/**
 * Pure repo-layer guards, kept free of any Tauri/SQLite import so the safety
 * rules they encode can be unit-tested directly. `repos.ts` enforces these
 * before mutating the database — the guard is the source of truth, not the UI.
 */

export const ANAPHYLACTIC_DELETE_MESSAGE =
  "Anaphylactic allergies cannot be deleted — mark as resolved instead.";

/**
 * Anaphylactic allergies are safety-critical: they may be marked resolved but
 * never hard-deleted, so the record can never silently disappear from an
 * emergency card. Throws for an anaphylactic row; a no-op for every other
 * severity (and for a missing row, which the caller then treats as a normal
 * delete of nothing).
 */
export function assertAllergyDeletable(severity: string | null | undefined): void {
  if (severity === "anaphylactic") {
    throw new Error(ANAPHYLACTIC_DELETE_MESSAGE);
  }
}
