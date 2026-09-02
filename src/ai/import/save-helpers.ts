/**
 * Shared persistence helpers for import modules. Keeps the source document as an
 * attachment so every imported record has a full traceability trail back to the
 * file it came from.
 */

import { createAttachment, deleteAttachmentIfUnreferenced, updateAttachment } from "@/db/repos";
import { storeAttachmentFile, mimeFromPath } from "@/lib/attachments";
import type { Attachment } from "@/db/schema";
import type { ImportContext } from "./registry";

type AttachmentKind = Attachment["kind"];

/**
 * The source document of one import, handed to the module's save routine.
 *
 * `id` is null when the import had no source file (hand-typed drafts), which is
 * why `link()` is safe to call unconditionally.
 */
export type SourceAttachment = {
  id: number | null;
  /**
   * Points the stored document at the record it produced. Call it as soon as
   * the FIRST record exists — not at the end of `save()`. An attachment row
   * whose `linked_entity_id` is still null is invisible to every delete path
   * (they all filter on that id), so a crash in between used to leave a file
   * and a row that nothing would ever clean up.
   */
  link: (entityId: number) => Promise<void>;
  /**
   * Drops the stored document when the import produced no record that could
   * own it. Without an owner it is unreachable from the UI and invisible to
   * every delete path, so keeping it would only leak a file forever. A no-op
   * while anything still references the row.
   */
  discard: () => Promise<void>;
};

/**
 * Runs an import's save routine with its source document attached, and rolls
 * that document back if the routine throws.
 *
 * The file is copied and registered before any record exists (the records need
 * its id), so every failure after that point has to undo it explicitly — the
 * rollback is a no-op when records written before the failure still reference
 * the document, so a partial import never loses the paper it came from.
 */
export async function withSourceAttachment<T>(
  ctx: ImportContext,
  kind: AttachmentKind,
  entityType: string,
  run: (source: SourceAttachment) => Promise<T>,
): Promise<T> {
  const id = await storeSourceAttachment(ctx, kind, entityType);
  const source: SourceAttachment = {
    id,
    link: async (entityId: number) => {
      if (id == null) return;
      await updateAttachment(id, { linkedEntityType: entityType, linkedEntityId: entityId });
    },
    discard: async () => {
      if (id == null) return;
      await deleteAttachmentIfUnreferenced(id);
    },
  };
  try {
    return await run(source);
  } catch (e) {
    if (id != null) await deleteAttachmentIfUnreferenced(id);
    throw e;
  }
}

/**
 * Copy the picked source file into app storage and create an `attachment` row
 * linked to `entityType`. Returns the new attachment id, or null when there is
 * no source file. Prefer `withSourceAttachment`, which also links the row to the
 * first created record and rolls it back when the save fails.
 */
export async function storeSourceAttachment(
  ctx: ImportContext,
  kind: AttachmentKind,
  entityType: string,
): Promise<number | null> {
  if (!ctx.sourceFilePath) return null;
  const stored = await storeAttachmentFile(ctx.sourceFilePath);
  return createAttachment({
    profileId: ctx.profileId,
    filePath: stored,
    mimeType: mimeFromPath(ctx.sourceFilePath),
    kind,
    linkedEntityType: entityType,
  });
}
