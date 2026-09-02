/**
 * What the JSON export covers — and, just as importantly, what it does not.
 *
 * The export used to call itself "full" while quietly dropping four tables
 * (lab findings, health notes, retest schedules, the lifestyle diary): data the
 * user would only discover missing after needing it. The scope is therefore
 * declared here as data, checked against the schema by a test, and shipped
 * inside the export file itself, so the promise on the button and the contents
 * of the file cannot drift apart again.
 *
 * Kept free of any Tauri import so the coverage rule is testable.
 */

/** Every table written into the JSON export, by its SQL name. */
export const EXPORTED_TABLES = [
  "profile",
  "biomarker",
  "biomarker_reference_range",
  "attachment",
  "lab_panel",
  "lab_result",
  "lab_finding",
  "visit",
  "diagnosis",
  "prescription",
  "medication",
  "medication_log",
  "allergy",
  "vaccine",
  "symptom_log",
  "imaging_record",
  "weight_log",
  "bp_log",
  "lifestyle_log",
  "health_note",
  "retest_schedule",
  "record_provenance",
  "record_audit_event",
  "record_relation",
] as const;

export type ExportedTable = (typeof EXPORTED_TABLES)[number];

/**
 * Tables deliberately left out, each with the reason the user is entitled to.
 * A new table must be added to one list or the other — the coverage test fails
 * otherwise, which is the whole point: silence is how the last four went
 * missing.
 */
export const EXCLUDED_TABLES: Record<string, string> = {
  chat_thread: "AI conversation history, not part of the health record",
  chat_thread_record: "AI conversation history, not part of the health record",
  chat_message: "AI conversation history, not part of the health record",
  chat_tool_event: "AI conversation history, not part of the health record",
  chat_change_set: "AI conversation history, not part of the health record",
  chat_change_item: "AI conversation history, not part of the health record",
  fts_records: "derived search index, rebuilt from the data above",
};

/**
 * The honest scope statement that travels with every export file. Attachment
 * ROWS are exported (paths, kinds, links); the documents they point at are not
 * — embedding them would multiply the file size and the encrypted backup
 * already archives them properly. The export is a complete record dump, not a
 * restorable machine-to-machine backup, and says so.
 */
export const EXPORT_SCOPE = {
  includesAttachmentFiles: false,
  note: "Row-level dump of every health table. Attachment files are referenced by path, not embedded — use the encrypted backup to move documents between machines.",
} as const;

/** Tables present in the schema but claimed by neither list. */
export function uncoveredTables(schemaTableNames: string[]): string[] {
  const exported = new Set<string>(EXPORTED_TABLES);
  return schemaTableNames.filter((name) => !exported.has(name) && !(name in EXCLUDED_TABLES));
}
