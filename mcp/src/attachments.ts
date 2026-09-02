/**
 * Attachment bookkeeping for the sidecar's delete paths.
 *
 * `attachment.linked_entity_type` / `linked_entity_id` is a polymorphic link:
 * there is no foreign key, so nothing in the schema removes an imported
 * document when the record it belongs to is deleted — whoever deletes the
 * record has to. The app does this in `repos.ts` (`collectLinkedAttachments` /
 * `removeDeletedAttachmentFiles`); this module is the same two steps for
 * bun:sqlite, so a record deleted through the assistant ends up in the same
 * state as one deleted through the UI.
 */

import fs from "node:fs";
import type { Database } from "bun:sqlite";
import type { AttachmentEntityType } from "../../src/db/tx-plans";

export type LinkedAttachment = { id: number; filePath: string };

/**
 * Reads the attachments linked to an entity BEFORE it is deleted — once the
 * rows are gone their file paths are unrecoverable, so the list has to be taken
 * first and the files removed afterwards.
 */
export function collectLinkedAttachments(
  sqlite: Database,
  entityType: AttachmentEntityType,
  entityId: number,
): LinkedAttachment[] {
  return sqlite
    .prepare(
      "SELECT id, file_path AS filePath FROM attachment WHERE linked_entity_type = ? AND linked_entity_id = ?",
    )
    .all(entityType, entityId) as LinkedAttachment[];
}

/**
 * Deletes the files of the attachment rows the transaction actually removed.
 *
 * Row first, file second, and the survivors are re-read rather than assumed:
 * the delete statement is guarded by correlated NOT EXISTS checks, so a
 * document still referenced by another record (one certificate covering several
 * vaccine doses) keeps its row — erasing its file would be exactly the
 * unrecoverable loss this is meant to prevent. A file that cannot be removed is
 * only leaked disk space, so failures are logged, never thrown.
 */
export function removeDeletedAttachmentFiles(
  sqlite: Database,
  candidates: LinkedAttachment[],
): number {
  if (candidates.length === 0) return 0;
  const placeholders = candidates.map(() => "?").join(", ");
  const survivors = sqlite
    .prepare(`SELECT id FROM attachment WHERE id IN (${placeholders})`)
    .all(...candidates.map((c) => c.id)) as { id: number }[];
  const stillLinked = new Set(survivors.map((s) => s.id));

  let removed = 0;
  for (const row of candidates) {
    if (stillLinked.has(row.id) || !row.filePath) continue;
    removed += 1;
    try {
      fs.rmSync(row.filePath, { force: true });
    } catch (err) {
      console.error(`soma-mcp: could not remove attachment file ${row.filePath}`, err);
    }
  }
  return removed;
}
