import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { getChatChangeSet, type ChangeSetWithItems } from "@/db/chat-repos";
import {
  executeTransaction,
  type TransactionParam,
  type TransactionStatement,
} from "@/db/transaction";
import { rebuildSearchIndex } from "@/db/search";
import { recomputeFlagsForProfile } from "@/db/repos";
import type { HealthChange } from "./change-schema";
import { dayBefore, lifestyleFields, profileFields } from "./commit";
import {
  TABLES,
  UPDATE_SPECS,
  deleteStatements,
  isUpdateKind,
  updateFields,
  type DeletableEntityType,
} from "./record-edits";

/**
 * Undo of a saved chat change set.
 *
 * Every committed item kept what it needs to be reversed: creations know the
 * id they produced, edits kept the stored row from before (`beforeJson`), and
 * deletions kept the whole deleted row. The reversal is one transaction, item
 * by item in reverse order, and it refuses to run when the record has moved on
 * since — an edit is only undone while the fields still hold what the chat
 * wrote, so a later manual correction is never silently overwritten.
 */

type ChangeItem = ChangeSetWithItems["items"][number];

/** Deletions whose children are gone with the row, so it cannot be put back whole. */
const IRREVERSIBLE_DELETES = new Set<string>(["medication", "visit", "lab_panel"]);

/** Why this set cannot be undone, or null when it can (checked again on undo). */
export function revertBlocker(set: ChangeSetWithItems): string | null {
  if (set.status !== "committed") return "not_committed";
  for (const item of set.items) {
    if (item.status !== "committed") continue;
    if (item.operation === "delete" && IRREVERSIBLE_DELETES.has(item.entityType)) {
      return "irreversible_delete";
    }
  }
  return null;
}

export async function revertHealthChangeSet(profileId: number, changeSetId: number): Promise<void> {
  const set = await getChatChangeSet(changeSetId);
  if (!set) throw new Error("Change set not found");
  const blocker = revertBlocker(set);
  if (blocker === "not_committed") throw new Error("Only saved changes can be undone.");
  if (blocker)
    throw new Error("Deleting this record removed its linked data; it cannot be undone.");
  const statements: TransactionStatement[] = [];
  const items = set.items.filter((item) => item.status === "committed").reverse();
  for (const item of items) await refuseIfChangedLater(set, item);
  for (const item of items) {
    await appendReversal(statements, profileId, item);
    statements.push({
      sql: "INSERT INTO record_audit_event (profile_id, entity_type, entity_id, operation, before_json, after_json, source_type, source_id) VALUES (?, ?, ?, 'revert', NULL, ?, 'chat', ?)",
      params: [
        profileId,
        item.entityType,
        item.entityId ?? 0,
        JSON.stringify(item.payloadJson),
        String(set.sourceMessageId),
      ],
    });
  }
  statements.push({
    sql: "UPDATE chat_change_set SET status = 'reverted' WHERE id = ? AND status = 'committed'",
    params: [set.id],
    minRowsAffected: 1,
  });
  await executeTransaction(statements);
  try {
    if (items.some((item) => item.entityType === "profile"))
      await recomputeFlagsForProfile(profileId);
    await rebuildSearchIndex(profileId);
  } catch (error) {
    console.error("Search index refresh failed after undo", error);
  }
}

async function appendReversal(
  statements: TransactionStatement[],
  profileId: number,
  item: ChangeItem,
): Promise<void> {
  const change = item.payloadJson as HealthChange;
  const id = item.entityId;
  if (id == null) throw new Error("A saved change has no record id; it cannot be undone.");
  const before = item.beforeJson ?? null;

  if (change.kind === "delete_record") {
    if (!before) throw new Error("The deleted record was not kept; it cannot be restored.");
    if (change.entityType === "lifestyle") {
      // One lifestyle row per day: a day logged again since cannot take the old row back.
      const rows = (await db.all(
        sql`SELECT count(*) FROM lifestyle_log WHERE profile_id = ${profileId} AND date = ${String(before.date)}`,
      )) as unknown[][];
      if (Number(rows[0]?.[0] ?? 0) > 0) {
        throw new Error("That day has been logged again since; it cannot be restored.");
      }
    }
    statements.push(restoreRowStatement(change.entityType, before));
    return;
  }
  if (change.kind === "log_medication_intake") {
    statements.push({
      sql: "DELETE FROM medication_log WHERE id = ?",
      params: [id],
      minRowsAffected: 1,
    });
    return;
  }
  if (change.kind === "change_medication_regimen") {
    await refuseIfLogged(id);
    statements.push(...deleteCreated("medication", id, profileId));
    statements.push({
      sql: "UPDATE medication SET end_date = ? WHERE id = ? AND profile_id = ? AND end_date = ?",
      params: [
        (before?.endDate as string | null) ?? null,
        change.medicationId,
        profileId,
        dayBefore(change.effectiveDate),
      ],
      minRowsAffected: 1,
    });
    return;
  }
  const restored = restoredColumns(change, before);
  if (restored) {
    const table = item.entityType === "profile" ? "profile" : tableOf(item.entityType);
    await refuseIfChanged(table, id, profileId, restored);
    statements.push({
      sql: `UPDATE ${table} SET ${restored.map((c) => `${c.column} = ?`).join(", ")} WHERE id = ?${table === "profile" ? "" : " AND profile_id = ?"}`,
      params: [...restored.map((c) => c.before), id, ...(table === "profile" ? [] : [profileId])],
      minRowsAffected: 1,
    });
    return;
  }
  // Everything else created a row: remove it again.
  if (change.kind === "create_medication_course") {
    await refuseIfLogged(id);
    const [row] = await selectColumns("medication", id, profileId, ["prescription_id"]);
    statements.push(...deleteCreated("medication", id, profileId));
    if (row?.[0] != null) {
      statements.push({ sql: "DELETE FROM prescription WHERE id = ?", params: [row[0] as number] });
    }
    return;
  }
  statements.push(...deleteCreated(item.entityType as DeletableEntityType, id, profileId));
}

type RestoredColumn = { column: string; written: TransactionParam; before: TransactionParam };

/** The columns an edit wrote, with the values it wrote and the ones it replaced. */
function restoredColumns(
  change: HealthChange,
  before: Record<string, unknown> | null,
): RestoredColumn[] | null {
  const pairs = (() => {
    if (isUpdateKind(change.kind)) {
      const spec = UPDATE_SPECS[change.kind] as {
        columns: Record<string, string>;
        json?: string[];
      };
      return updateFields(change.kind, change as Record<string, unknown>).map(
        ([field, value]) =>
          [spec.columns[field], spec.json?.includes(field) ? JSON.stringify(value) : value] as [
            string,
            unknown,
          ],
      );
    }
    switch (change.kind) {
      case "end_medication_course":
        return [["end_date", change.endDate]] as [string, unknown][];
      case "update_diagnosis_status":
        return [
          ["status", change.status],
          ["resolved_date", change.status === "active" ? null : (change.resolvedDate ?? null)],
          ...(change.notes ? [["notes", change.notes]] : []),
        ] as [string, unknown][];
      case "update_allergy_status":
        return [["status", change.status]] as [string, unknown][];
      case "update_profile_fact":
        return profileFields(change.fields);
      case "merge_lifestyle_day":
        // Without a stored row the merge created one, which is deleted instead.
        return before ? lifestyleFields(change) : null;
      default:
        return null;
    }
  })();
  if (!pairs) return null;
  if (!before) throw new Error("The previous values were not kept; this change cannot be undone.");
  return pairs.map(([column, written]) => ({
    column,
    written: sqlValue(written),
    before: sqlValue(before[camel(column)]),
  }));
}

async function refuseIfChanged(
  table: string,
  id: number,
  profileId: number,
  columns: RestoredColumn[],
): Promise<void> {
  const [row] = await selectColumns(
    table,
    id,
    table === "profile" ? null : profileId,
    columns.map((c) => c.column),
  );
  if (!row) throw new Error("The record no longer exists.");
  columns.forEach((column, index) => {
    if (!sameValue(row[index], column.written)) {
      throw new Error("The record was edited after this change; undo it there instead.");
    }
  });
}

/**
 * A record a later saved chat change built on is not rolled back underneath
 * it: that later change has to be undone first.
 */
async function refuseIfChangedLater(set: ChangeSetWithItems, item: ChangeItem): Promise<void> {
  if (item.entityId == null || !set.committedAt) return;
  const rows = (await db.all(
    sql`SELECT count(*) FROM chat_change_item i JOIN chat_change_set s ON s.id = i.change_set_id
        WHERE s.status = 'committed' AND s.id != ${set.id} AND s.committed_at > ${set.committedAt}
          AND i.status = 'committed' AND i.entity_type = ${item.entityType} AND i.entity_id = ${item.entityId}`,
  )) as unknown[][];
  if (Number(rows[0]?.[0] ?? 0) > 0) {
    throw new Error("A later saved change edited this record; undo that one first.");
  }
}

async function refuseIfLogged(medicationId: number): Promise<void> {
  const rows = (await db.all(
    sql`SELECT count(*) FROM medication_log WHERE medication_id = ${medicationId}`,
  )) as unknown[][];
  if (Number(rows[0]?.[0] ?? 0) > 0) {
    throw new Error("Intake has been logged for this medication since; it cannot be undone.");
  }
}

/** Positional rows (see `src/db/search.ts`): values come back in SELECT order. */
async function selectColumns(
  table: string,
  id: number,
  profileId: number | null,
  columns: string[],
): Promise<unknown[][]> {
  const scope = profileId == null ? sql`` : sql` AND profile_id = ${profileId}`;
  const rows = (await db.all(
    sql`SELECT ${sql.raw(columns.join(", "))} FROM ${sql.raw(table)} WHERE id = ${id}${scope}`,
  )) as Array<unknown[] | Record<string, unknown>>;
  return rows.map((row) => (Array.isArray(row) ? row : columns.map((column) => row[column])));
}

function deleteCreated(
  entityType: DeletableEntityType,
  id: number,
  profileId: number,
): TransactionStatement[] {
  return [
    ...deleteStatements(entityType, id, profileId),
    {
      sql: "DELETE FROM record_relation WHERE profile_id = ? AND source_entity_type = ? AND source_entity_id = ?",
      params: [profileId, entityType, id],
    },
    {
      sql: "DELETE FROM record_provenance WHERE profile_id = ? AND entity_type = ? AND entity_id = ?",
      params: [profileId, entityType, id],
    },
  ];
}

/**
 * Re-inserts a deleted row with its original id. Its document was removed with
 * it, so the attachment link is dropped; a visit link survives only while the
 * visit does.
 */
function restoreRowStatement(
  entityType: DeletableEntityType,
  row: Record<string, unknown>,
): TransactionStatement {
  const columns: string[] = [];
  const values: string[] = [];
  const params: TransactionParam[] = [];
  for (const [key, value] of Object.entries(row)) {
    if (key === "attachmentId") continue;
    const column = camel2snake(key);
    columns.push(column);
    if (key === "visitId" && value != null) {
      values.push("(SELECT id FROM visit WHERE id = ?)");
    } else {
      values.push("?");
    }
    params.push(sqlValue(value));
  }
  return {
    sql: `INSERT INTO ${tableOf(entityType)} (${columns.join(", ")}) VALUES (${values.join(", ")})`,
    params,
  };
}

function tableOf(entityType: string): string {
  const table = (TABLES as Record<string, string>)[entityType];
  if (!table) throw new Error(`Unsupported record type: ${entityType}`);
  return table;
}

function sqlValue(value: unknown): TransactionParam {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "object") return JSON.stringify(value);
  return value as TransactionParam;
}

function sameValue(stored: unknown, written: TransactionParam): boolean {
  return JSON.stringify(sqlValue(stored)) === JSON.stringify(written);
}

function camel(column: string): string {
  return column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function camel2snake(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
