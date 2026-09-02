/**
 * Statement plans for the multi-step writes of `repos.ts`.
 *
 * Every plan here is executed through `executeTransaction()` — the one path in
 * the app that gets a dedicated SQLite connection with a real BEGIN/COMMIT and
 * `foreign_keys = ON` (`src-tauri/src/transaction.rs`). The plugin's pooled
 * `db` handle cannot promise either, so a delete spread over several `db.*`
 * calls can be interrupted half-way and leave, say, a panel whose results are
 * already gone.
 *
 * The plans are kept in this separate, dependency-free module for two reasons:
 * the ORDER of the statements is the actual safety property (child rows first,
 * exactly like `deleteChatThread`), and order is only testable if the plan can
 * be built without a Tauri runtime. `TransactionStatement` is imported as a
 * type only, so nothing from `./transaction` (and therefore `@tauri-apps/api`)
 * is pulled in at runtime.
 *
 * Cascades declared in the schema are deliberately NOT relied upon: they are
 * spelled out statement by statement, so the plan is correct even where the FK
 * is `NO ACTION` and self-documenting where it is `CASCADE`.
 */

import type { TransactionParam, TransactionStatement } from "./transaction";
import type { NewLabFinding, NewLabPanel, NewLabResult } from "./schema";

/**
 * `attachment.linked_entity_type` values actually written by the app. The
 * import pipeline stores its source document under the type of the record it
 * produced, so every `delete*` for one of these must clean up after itself —
 * nothing else ever will (the link is polymorphic, so there is no FK to lean on).
 */
export const ATTACHMENT_ENTITY_TYPES = {
  labPanel: "lab_panel",
  visit: "visit",
  medication: "medication",
  vaccine: "vaccine",
  allergy: "allergy",
  imagingRecord: "imaging_record",
} as const;

export type AttachmentEntityType =
  (typeof ATTACHMENT_ENTITY_TYPES)[keyof typeof ATTACHMENT_ENTITY_TYPES];

/**
 * Tables that point at `attachment` through a real FK column (all `NO ACTION`).
 * An attachment row may only be deleted once none of them references it — one
 * imported certificate is commonly shared by several vaccine or imaging rows,
 * so deleting the row (and its file) with the first of them would break the
 * rest. Written as correlated NOT EXISTS guards so the check and the delete are
 * one atomic statement rather than a read followed by a racy write.
 */
const ATTACHMENT_REFERENCE_GUARDS = [
  "NOT EXISTS (SELECT 1 FROM lab_panel WHERE lab_panel.source_file_id = attachment.id)",
  "NOT EXISTS (SELECT 1 FROM vaccine WHERE vaccine.attachment_id = attachment.id)",
  "NOT EXISTS (SELECT 1 FROM imaging_record WHERE imaging_record.attachment_id = attachment.id)",
].join(" AND ");

/**
 * Removes the attachment rows linked to a now-deleted entity. Always the LAST
 * statement of a delete plan: `lab_panel.source_file_id` (and the vaccine /
 * imaging `attachment_id`) reference `attachment` with `NO ACTION`, so the
 * parent row has to be gone before its attachment can be.
 */
export function linkedAttachmentDeleteStatement(
  entityType: AttachmentEntityType,
  entityId: number,
): TransactionStatement {
  return {
    sql: `DELETE FROM attachment WHERE linked_entity_type = ? AND linked_entity_id = ? AND ${ATTACHMENT_REFERENCE_GUARDS}`,
    params: [entityType, entityId],
  };
}

/**
 * Deletes one attachment row by id, but only when nothing references it — the
 * compensating delete for an import that failed after the source file was
 * already copied and registered. Rows created before the failure keep their
 * document; the guards make that decision inside SQL instead of leaving the
 * caller to guess.
 */
export function unreferencedAttachmentDeleteStatement(attachmentId: number): TransactionStatement {
  return {
    sql: `DELETE FROM attachment WHERE id = ? AND ${ATTACHMENT_REFERENCE_GUARDS}`,
    params: [attachmentId],
  };
}

/** Panel → results → findings → source attachment, child-first. */
export function panelDeletePlan(panelId: number): TransactionStatement[] {
  return [
    { sql: "DELETE FROM lab_result WHERE panel_id = ?", params: [panelId] },
    { sql: "DELETE FROM lab_finding WHERE panel_id = ?", params: [panelId] },
    { sql: "DELETE FROM lab_panel WHERE id = ?", params: [panelId] },
    linkedAttachmentDeleteStatement(ATTACHMENT_ENTITY_TYPES.labPanel, panelId),
  ];
}

/**
 * Compensation for a partially written panel import: the same child-first
 * deletes as `panelDeletePlan`, minus the attachment (the import wrapper owns
 * the source document and rolls it back itself, together with the file).
 */
export function panelRollbackPlan(panelId: number): TransactionStatement[] {
  return [
    { sql: "DELETE FROM lab_result WHERE panel_id = ?", params: [panelId] },
    { sql: "DELETE FROM lab_finding WHERE panel_id = ?", params: [panelId] },
    { sql: "DELETE FROM lab_panel WHERE id = ?", params: [panelId] },
  ];
}

function boolParam(value: boolean | null | undefined): TransactionParam {
  return value == null ? null : value;
}

/**
 * Panel + its results + its findings as ONE transaction. The previous version
 * inserted the panel first and compensated on failure, which left a window in
 * which a crash produced an empty panel that looks like a clean import — and
 * the compensation itself leaned on the cascade it was meant to distrust.
 *
 * The results and findings reference the panel through `$lastInsertId: 0`,
 * resolved by the Rust side against the first statement's rowid.
 */
export function panelInsertPlan(
  panel: NewLabPanel,
  results: Omit<NewLabResult, "panelId">[],
  findings: Omit<NewLabFinding, "panelId" | "createdAt">[],
): TransactionStatement[] {
  const panelRef = { $lastInsertId: 0 } as const;
  return [
    {
      sql: `INSERT INTO lab_panel (profile_id, date, lab_name, city, country, sample_types, cost, collection_time, fasting, menstrual_cycle_day, notes, source_file_id, import_method) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        panel.profileId,
        panel.date,
        panel.labName ?? null,
        panel.city ?? null,
        panel.country ?? null,
        // `sample_types` is a JSON column in drizzle; raw SQL has to encode it.
        JSON.stringify(panel.sampleTypes ?? ["blood"]),
        panel.cost ?? null,
        panel.collectionTime ?? null,
        boolParam(panel.fasting),
        panel.menstrualCycleDay ?? null,
        panel.notes ?? null,
        panel.sourceFileId ?? null,
        panel.importMethod ?? "manual",
      ],
      minRowsAffected: 1,
    },
    ...results.map((r) => ({
      sql: `INSERT INTO lab_result (panel_id, biomarker_id, value, unit, unit_normalized, value_normalized, out_of_range, flag, raw_label, source_page, confidence, reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        panelRef,
        r.biomarkerId,
        r.value,
        r.unit,
        r.unitNormalized ?? null,
        r.valueNormalized ?? null,
        r.outOfRange ?? false,
        r.flag ?? null,
        r.rawLabel ?? null,
        r.sourcePage ?? null,
        r.confidence ?? null,
        r.reviewedAt ?? null,
      ] as TransactionParam[],
      minRowsAffected: 1,
    })),
    ...findings.map((f) => ({
      sql: `INSERT INTO lab_finding (panel_id, raw_label, name_en, value_text, value_numeric, unit, ref_range_text, source_page) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        panelRef,
        f.rawLabel,
        f.nameEn ?? null,
        f.valueText,
        f.valueNumeric ?? null,
        f.unit ?? null,
        f.refRangeText ?? null,
        f.sourcePage ?? null,
      ] as TransactionParam[],
      minRowsAffected: 1,
    })),
  ];
}

/** Findings added to an already-stored panel, in one transaction. */
export function findingsInsertPlan(
  panelId: number,
  findings: Omit<NewLabFinding, "panelId" | "createdAt">[],
): TransactionStatement[] {
  return findings.map((f) => ({
    sql: `INSERT INTO lab_finding (panel_id, raw_label, name_en, value_text, value_numeric, unit, ref_range_text, source_page) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      panelId,
      f.rawLabel,
      f.nameEn ?? null,
      f.valueText,
      f.valueNumeric ?? null,
      f.unit ?? null,
      f.refRangeText ?? null,
      f.sourcePage ?? null,
    ] as TransactionParam[],
    minRowsAffected: 1,
  }));
}

/**
 * A visit is deleted, but what came out of it is not: diagnoses, symptoms,
 * imaging and prescriptions are detached first (their `visit_id` FKs are
 * `NO ACTION`, so leaving them would fail the delete outright), then the visit
 * row, then the discharge document attached to it.
 */
export function visitDeletePlan(visitId: number): TransactionStatement[] {
  return [
    { sql: "UPDATE prescription SET visit_id = NULL WHERE visit_id = ?", params: [visitId] },
    { sql: "UPDATE diagnosis SET visit_id = NULL WHERE visit_id = ?", params: [visitId] },
    { sql: "UPDATE symptom_log SET visit_id = NULL WHERE visit_id = ?", params: [visitId] },
    { sql: "UPDATE imaging_record SET visit_id = NULL WHERE visit_id = ?", params: [visitId] },
    { sql: "DELETE FROM visit WHERE id = ?", params: [visitId] },
    linkedAttachmentDeleteStatement(ATTACHMENT_ENTITY_TYPES.visit, visitId),
  ];
}

/** Adherence log (CASCADE in schema, spelled out anyway) → medication → prescription document. */
export function medicationDeletePlan(medicationId: number): TransactionStatement[] {
  return [
    { sql: "DELETE FROM medication_log WHERE medication_id = ?", params: [medicationId] },
    { sql: "DELETE FROM medication WHERE id = ?", params: [medicationId] },
    linkedAttachmentDeleteStatement(ATTACHMENT_ENTITY_TYPES.medication, medicationId),
  ];
}

export function vaccineDeletePlan(vaccineId: number): TransactionStatement[] {
  return [
    { sql: "DELETE FROM vaccine WHERE id = ?", params: [vaccineId] },
    linkedAttachmentDeleteStatement(ATTACHMENT_ENTITY_TYPES.vaccine, vaccineId),
  ];
}

export function allergyDeletePlan(allergyId: number): TransactionStatement[] {
  return [
    { sql: "DELETE FROM allergy WHERE id = ?", params: [allergyId] },
    linkedAttachmentDeleteStatement(ATTACHMENT_ENTITY_TYPES.allergy, allergyId),
  ];
}

export function imagingRecordDeletePlan(recordId: number): TransactionStatement[] {
  return [
    { sql: "DELETE FROM imaging_record WHERE id = ?", params: [recordId] },
    linkedAttachmentDeleteStatement(ATTACHMENT_ENTITY_TYPES.imagingRecord, recordId),
  ];
}

/**
 * `medication.prescription_id` is `NO ACTION`: with medications still attached,
 * deleting the prescription either fails outright or (without FK enforcement)
 * leaves them pointing at nothing. The detach is therefore explicit and part of
 * the same transaction — never a separate step that a crash could skip.
 */
export function prescriptionDeletePlan(prescriptionId: number): TransactionStatement[] {
  return [
    {
      sql: "UPDATE medication SET prescription_id = NULL WHERE prescription_id = ?",
      params: [prescriptionId],
    },
    { sql: "DELETE FROM prescription WHERE id = ?", params: [prescriptionId] },
  ];
}
