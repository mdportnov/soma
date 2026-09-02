import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "./client";
import {
  allergy,
  attachment,
  biomarker,
  bpLog,
  chatMessage,
  chatThread,
  diagnosis,
  healthNote,
  imagingRecord,
  labFinding,
  labPanel,
  labResult,
  lifestyleLog,
  medication,
  prescription,
  retestSchedule,
  symptomLog,
  vaccine,
  visit,
  weightLog,
} from "./schema";
import {
  buildIndexRows,
  rankResults,
  toMatchQuery,
  type IndexRow,
  type IndexSources,
  type EntityType,
  type ScoredRow,
  type SearchResult,
} from "./search-index";
import { currentDataRevision, isSearchIndexStale, markSearchIndexBuilt } from "./search-freshness";
import { normalizeLabel, similarity } from "@/lib/fuzzy";
import { todayISO } from "@/lib/utils";

/**
 * Full-text search over the user's records, backed by the `fts_records`
 * FTS5 virtual table (migrations 0001_fts_records / 0005_fts_records_route).
 * The index is denormalized: each row stores its display `title`/`subtitle`/
 * `date` and its destination `route` as UNINDEXED columns, so a search needs no
 * joins back to the source tables.
 *
 * This module is the DB half only — what is worth indexing, how a query is
 * parsed and how matches are ordered all live in the pure `search-index.ts`.
 */

export type { EntityType, SearchResult } from "./search-index";

/**
 * Every read of the index selects these columns, in this order.
 *
 * Raw `db.all()` carries no drizzle field map, so the SQL proxy in `client.ts`
 * hands rows back as positional value arrays (it maps each row through
 * `Object.values`). Rows are therefore decoded by position against this list;
 * a keyed object is accepted too, so the decoding does not silently depend on
 * which driver shape shows up.
 */
const INDEX_COLUMNS = ["entity_type", "entity_id", "title", "subtitle", "date", "route"] as const;

type RawRow = unknown[] | Record<string, unknown>;

function cell(row: RawRow, index: number, key: string): unknown {
  return Array.isArray(row) ? row[index] : row[key];
}

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

function toResult(row: RawRow): SearchResult {
  const date = cell(row, 4, "date");
  return {
    entityType: str(cell(row, 0, "entity_type")) as EntityType,
    entityId: Number(cell(row, 1, "entity_id")),
    title: str(cell(row, 2, "title")),
    subtitle: str(cell(row, 3, "subtitle")),
    date: date === null || date === undefined ? null : String(date),
    route: str(cell(row, 5, "route")) || "/",
  };
}

/** The SELECT list shared by every index read, matching `INDEX_COLUMNS`. */
const SELECT_COLUMNS = INDEX_COLUMNS.join(", ");

// ── source reads ───────────────────────────────────────────────────────────

/**
 * Reads every source table the index draws on. Nested rows (lab results and
 * findings, prescriptions) are joined to their owner both to scope them to the
 * profile — they carry no `profile_id` of their own — and to inherit its date,
 * which is what the palette shows and what recency ranking reads.
 */
async function collectSources(profileId: number): Promise<IndexSources> {
  const [
    biomarkers,
    panels,
    labResults,
    labFindings,
    visits,
    diagnoses,
    medications,
    prescriptions,
    allergies,
    vaccines,
    symptoms,
    imaging,
    notes,
    weightLogs,
    bpLogs,
    lifestyleLogs,
    retests,
    attachments,
    threads,
    userMessages,
  ] = await Promise.all([
    db
      .select({
        id: biomarker.id,
        canonicalName: biomarker.canonicalName,
        category: biomarker.category,
        code: biomarker.code,
        aliases: biomarker.aliases,
      })
      .from(biomarker),
    db
      .select({
        id: labPanel.id,
        date: labPanel.date,
        labName: labPanel.labName,
        city: labPanel.city,
        country: labPanel.country,
        notes: labPanel.notes,
      })
      .from(labPanel)
      .where(eq(labPanel.profileId, profileId)),
    db
      .select({
        id: labResult.id,
        panelId: labResult.panelId,
        panelDate: labPanel.date,
        biomarkerName: biomarker.canonicalName,
        aliases: biomarker.aliases,
        value: labResult.value,
        unit: labResult.unit,
        rawLabel: labResult.rawLabel,
      })
      .from(labResult)
      .innerJoin(labPanel, eq(labResult.panelId, labPanel.id))
      .innerJoin(biomarker, eq(labResult.biomarkerId, biomarker.id))
      .where(eq(labPanel.profileId, profileId)),
    db
      .select({
        id: labFinding.id,
        panelId: labFinding.panelId,
        panelDate: labPanel.date,
        rawLabel: labFinding.rawLabel,
        nameEn: labFinding.nameEn,
        valueText: labFinding.valueText,
        unit: labFinding.unit,
        refRangeText: labFinding.refRangeText,
      })
      .from(labFinding)
      .innerJoin(labPanel, eq(labFinding.panelId, labPanel.id))
      .where(eq(labPanel.profileId, profileId)),
    db
      .select({
        id: visit.id,
        date: visit.date,
        doctorName: visit.doctorName,
        clinic: visit.clinic,
        city: visit.city,
        country: visit.country,
        specialty: visit.specialty,
        notes: visit.notes,
      })
      .from(visit)
      .where(eq(visit.profileId, profileId)),
    db
      .select({
        id: diagnosis.id,
        date: diagnosis.date,
        name: diagnosis.name,
        icdCode: diagnosis.icdCode,
        status: diagnosis.status,
        notes: diagnosis.notes,
      })
      .from(diagnosis)
      .where(eq(diagnosis.profileId, profileId)),
    db
      .select({
        id: medication.id,
        name: medication.name,
        purpose: medication.purpose,
        type: medication.type,
        doseUnit: medication.doseUnit,
        schedule: medication.schedule,
        startDate: medication.startDate,
      })
      .from(medication)
      .where(eq(medication.profileId, profileId)),
    // A prescription has no profile_id: the owning visit carries it, so an
    // archived script or one detached from its visit is simply not indexed.
    db
      .select({
        id: prescription.id,
        visitId: prescription.visitId,
        visitDate: visit.date,
        drugName: prescription.drugName,
        doseUnit: prescription.doseUnit,
        frequency: prescription.frequency,
        notes: prescription.notes,
      })
      .from(prescription)
      .innerJoin(visit, eq(prescription.visitId, visit.id))
      .where(and(eq(visit.profileId, profileId), isNull(prescription.archivedAt))),
    db
      .select({
        id: allergy.id,
        allergen: allergy.allergen,
        reaction: allergy.reaction,
        category: allergy.category,
        severity: allergy.severity,
        notes: allergy.notes,
        onsetDate: allergy.onsetDate,
      })
      .from(allergy)
      .where(eq(allergy.profileId, profileId)),
    db
      .select({
        id: vaccine.id,
        vaccineName: vaccine.vaccineName,
        manufacturer: vaccine.manufacturer,
        batchNumber: vaccine.batchNumber,
        administeredBy: vaccine.administeredBy,
        country: vaccine.country,
        notes: vaccine.notes,
        date: vaccine.date,
      })
      .from(vaccine)
      .where(eq(vaccine.profileId, profileId)),
    db
      .select({
        id: symptomLog.id,
        symptomName: symptomLog.symptomName,
        notes: symptomLog.notes,
        date: symptomLog.date,
      })
      .from(symptomLog)
      .where(eq(symptomLog.profileId, profileId)),
    db
      .select({
        id: imagingRecord.id,
        modalityType: imagingRecord.modalityType,
        bodyArea: imagingRecord.bodyArea,
        findings: imagingRecord.findings,
        radiologistName: imagingRecord.radiologistName,
        clinic: imagingRecord.clinic,
        city: imagingRecord.city,
        country: imagingRecord.country,
        date: imagingRecord.date,
      })
      .from(imagingRecord)
      .where(eq(imagingRecord.profileId, profileId)),
    db
      .select({
        id: healthNote.id,
        title: healthNote.title,
        summary: healthNote.summary,
        originalText: healthNote.originalText,
        category: healthNote.category,
        tags: healthNote.tags,
        date: healthNote.date,
      })
      .from(healthNote)
      .where(eq(healthNote.profileId, profileId)),
    db
      .select({
        id: weightLog.id,
        date: weightLog.date,
        weightKg: weightLog.weightKg,
        notes: weightLog.notes,
      })
      .from(weightLog)
      .where(eq(weightLog.profileId, profileId)),
    db
      .select({
        id: bpLog.id,
        date: bpLog.date,
        systolic: bpLog.systolic,
        diastolic: bpLog.diastolic,
        notes: bpLog.notes,
      })
      .from(bpLog)
      .where(eq(bpLog.profileId, profileId)),
    db
      .select({ id: lifestyleLog.id, date: lifestyleLog.date, notes: lifestyleLog.notes })
      .from(lifestyleLog)
      .where(eq(lifestyleLog.profileId, profileId)),
    db
      .select({
        id: retestSchedule.id,
        label: retestSchedule.label,
        notes: retestSchedule.notes,
        lastTestedDate: retestSchedule.lastTestedDate,
      })
      .from(retestSchedule)
      .where(eq(retestSchedule.profileId, profileId)),
    db
      .select({
        id: attachment.id,
        filePath: attachment.filePath,
        kind: attachment.kind,
        linkedEntityType: attachment.linkedEntityType,
        linkedEntityId: attachment.linkedEntityId,
      })
      .from(attachment)
      .where(eq(attachment.profileId, profileId)),
    db
      .select({ id: chatThread.id, title: chatThread.title, updatedAt: chatThread.updatedAt })
      .from(chatThread)
      .where(eq(chatThread.profileId, profileId)),
    // Only the user's side of each thread — see the note in `search-index.ts`.
    db
      .select({ threadId: chatMessage.threadId, content: chatMessage.content })
      .from(chatMessage)
      .innerJoin(chatThread, eq(chatMessage.threadId, chatThread.id))
      .where(and(eq(chatThread.profileId, profileId), eq(chatMessage.role, "user")))
      .orderBy(asc(chatMessage.id)),
  ]);
  const messagesByThread = new Map<number, string[]>();
  for (const m of userMessages) {
    const list = messagesByThread.get(m.threadId) ?? [];
    list.push(m.content);
    messagesByThread.set(m.threadId, list);
  }

  return {
    biomarkers,
    panels,
    labResults,
    labFindings,
    visits,
    diagnoses,
    // `schedule` is a JSON blob; only its free-text `notes` is worth indexing.
    medications: medications.map((m) => ({
      id: m.id,
      name: m.name,
      purpose: m.purpose,
      type: m.type,
      doseUnit: m.doseUnit,
      scheduleNotes: m.schedule?.notes ?? null,
      startDate: m.startDate,
    })),
    prescriptions,
    allergies,
    vaccines,
    symptoms,
    imaging,
    notes,
    weightLogs,
    bpLogs,
    lifestyleLogs,
    retests,
    attachments,
    chatThreads: threads.map((c) => ({
      ...c,
      userMessages: messagesByThread.get(c.id) ?? [],
    })),
  };
}

// ── index maintenance ──────────────────────────────────────────────────────

/**
 * Rows per INSERT. Each row binds 8 parameters, so 100 rows is 800 bindings —
 * comfortably under SQLite's 999-parameter default. Batching is what keeps a
 * full rebuild affordable now that lab results are indexed: a heavy user's
 * couple of thousand rows would otherwise be a couple of thousand round trips
 * across the Tauri SQL bridge.
 */
const INSERT_BATCH = 100;

/** In-flight rebuild per profile, so opening the palette twice does the work once. */
const inFlight = new Map<number, Promise<void>>();

async function writeIndex(profileId: number, rows: IndexRow[]): Promise<void> {
  await db.run(sql`DELETE FROM fts_records WHERE profile_id = ${profileId}`);
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const chunk = rows.slice(i, i + INSERT_BATCH);
    const values = chunk.map(
      (r) =>
        sql`(${r.entityType}, ${r.entityId}, ${profileId}, ${r.title}, ${r.subtitle}, ${r.date}, ${r.route}, ${r.content})`,
    );
    await db.run(sql`
      INSERT INTO fts_records (entity_type, entity_id, profile_id, title, subtitle, date, route, content)
      VALUES ${sql.join(values, sql`, `)}
    `);
  }
}

/**
 * Deletes all index rows for the profile, then re-inserts one row per record.
 * Unconditional: every caller that asks for a rebuild gets one.
 *
 * Still a full rebuild rather than incremental upkeep, and deliberately so: the
 * index is derived data, so rebuilding is the only version that can never drift
 * out of sync with an edit made anywhere in the app — including the edits this
 * process cannot see, since the MCP sidecar (`mcp/src/db.ts`) opens the same
 * soma.db from another process and writes to it. That external writer is the
 * reason the palette keeps rebuilding on open instead of trusting the freshness
 * counter: the counter can prove the index is stale, never that it is fresh.
 *
 * What keeps it affordable is unchanged — batched inserts and the in-flight
 * dedupe below. If a profile ever grows past the tens of thousands of rows
 * where that stops being instant, the next step is a per-table `max(id)` /
 * `count(*)` signature to skip unchanged rebuilds, not triggers.
 *
 * The data revision is read BEFORE the source rows are collected, so a write
 * that lands mid-rebuild leaves the index stale rather than being swallowed
 * (see `search-freshness.ts`).
 */
export function rebuildSearchIndex(profileId: number): Promise<void> {
  const existing = inFlight.get(profileId);
  if (existing) return existing;
  const revision = currentDataRevision();
  const run = (async () => {
    try {
      const sources = await collectSources(profileId);
      await writeIndex(profileId, buildIndexRows(sources));
      markSearchIndexBuilt(profileId, revision);
    } catch (e) {
      console.error("rebuildSearchIndex failed", e);
      // A missing virtual table means the FTS migration never ran — a setup bug
      // that must surface loudly, not vanish into a silently empty search.
      if (isMissingTable(e)) throw e;
    } finally {
      inFlight.delete(profileId);
    }
  })();
  inFlight.set(profileId, run);
  return run;
}

/** True when the error is SQLite's "no such table" (FTS migration not applied). */
function isMissingTable(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return msg.includes("no such table");
}

/**
 * Rebuilds the index only when a write has invalidated it — the lazy half of
 * index maintenance.
 *
 * Every `repos.ts` / `chat-repos.ts` path that changes indexed data calls
 * `markSearchIndexStale()` before it writes (enforced by `search-writers.ts`
 * and its test), which costs a single integer increment: no extra statement, no
 * place inside a transaction where a rollback could leave the index claiming
 * something the database no longer holds, and no way for a failed index update
 * to take a medical record down with it. Marking BEFORE the write is the
 * conservative direction — a write that then fails only buys one needless
 * rebuild, whereas marking afterwards would lose the invalidation if the
 * process died in between.
 *
 * A profile starts stale, so the first search of every launch rebuilds once:
 * that is what picks up whatever was written by the previous session or by the
 * MCP sidecar while the app was closed.
 */
export async function ensureSearchIndex(profileId: number): Promise<void> {
  if (!isSearchIndexStale(profileId)) return;
  await rebuildSearchIndex(profileId);
}

/**
 * Freshness for the read paths: search must never answer with a record the user
 * has just deleted, whoever the caller is. A rebuild that throws (the FTS
 * migration never ran) is logged and swallowed here — the query below already
 * degrades to "no results" and a broken index must not turn a keystroke into an
 * unhandled rejection.
 */
async function refreshBeforeRead(profileId: number): Promise<void> {
  try {
    await ensureSearchIndex(profileId);
  } catch (e) {
    console.error("search index refresh failed; querying what is there", e);
  }
}

// ── reads ──────────────────────────────────────────────────────────────────

/** Rows returned per query — enough to fill several groups after ranking. */
const RESULT_LIMIT = 60;

/**
 * The most recently dated records, for the palette's empty state: opening ⌘K
 * with nothing typed should show where you have been, not a blank box.
 */
export async function recentRecords(profileId: number, limit = 8): Promise<SearchResult[]> {
  await refreshBeforeRead(profileId);
  try {
    const rows = await db.all<RawRow>(sql`
      SELECT ${sql.raw(SELECT_COLUMNS)}
      FROM fts_records
      WHERE profile_id = ${profileId} AND date IS NOT NULL AND date <= ${todayISO()}
      ORDER BY date DESC
      LIMIT ${limit}
    `);
    return rows.map(toResult);
  } catch (e) {
    console.error("recentRecords failed", e);
    return [];
  }
}

/** Ceiling on the rows the fuzzy fallback scans; well past any real library. */
const FUZZY_SCAN_LIMIT = 5000;

/** Minimum similarity for a fuzzy title match to be offered at all. */
const FUZZY_THRESHOLD = 0.62;

/**
 * Typo tolerance, reached only when FTS5 returned nothing at all. unicode61
 * matches terms exactly (modulo case and diacritics), so "феритин" — one letter
 * short of "ферритин" — finds zero rows where the user clearly meant something.
 * The import mapper's `similarity` already solves that problem well; this reuses
 * it against titles only, and only on the empty path, so the cost lands on the
 * query that was going to show nothing anyway.
 */
async function fuzzyFallback(profileId: number, query: string): Promise<SearchResult[]> {
  const needle = normalizeLabel(query);
  if (needle.length < 3) return [];
  try {
    const rows = await db.all<RawRow>(sql`
      SELECT ${sql.raw(SELECT_COLUMNS)}
      FROM fts_records
      WHERE profile_id = ${profileId}
      LIMIT ${FUZZY_SCAN_LIMIT}
    `);
    return rows
      .map(toResult)
      .map((result) => ({ result, score: similarity(needle, normalizeLabel(result.title)) }))
      .filter(({ score }) => score >= FUZZY_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map(({ result }) => result);
  } catch (e) {
    console.error("fuzzy fallback failed", e);
    return [];
  }
}

/**
 * Runs an FTS5 MATCH query and re-orders the matches with `rankResults`
 * (relevance + title match + recency). Returns `[]` (with a console error) if
 * the query fails — e.g. the virtual table does not exist because the FTS
 * migration was never applied — so the palette degrades to "no results"
 * instead of crashing.
 */
export async function searchRecords(profileId: number, query: string): Promise<SearchResult[]> {
  const match = toMatchQuery(query);
  if (!match) return [];
  await refreshBeforeRead(profileId);

  let rows: RawRow[];
  try {
    rows = await db.all<RawRow>(sql`
      SELECT ${sql.raw(SELECT_COLUMNS)}, bm25(fts_records) AS bm25
      FROM fts_records
      WHERE profile_id = ${profileId} AND fts_records MATCH ${match}
      ORDER BY bm25(fts_records)
      LIMIT ${RESULT_LIMIT}
    `);
  } catch (e) {
    console.error("searchRecords MATCH failed", e);
    return [];
  }

  if (rows.length === 0) return fuzzyFallback(profileId, query);

  const scored: ScoredRow[] = rows.map((r) => ({
    ...toResult(r),
    bm25: Number(cell(r, INDEX_COLUMNS.length, "bm25")),
  }));
  return rankResults(scored, query, todayISO());
}
