/**
 * Shared persistence helpers for import modules. Keeps the source document as an
 * attachment so every imported record has a full traceability trail back to the
 * file it came from.
 */

import { createAttachment } from "@/db/repos";
import { storeAttachmentFile, mimeFromPath } from "@/lib/attachments";
import type { Attachment } from "@/db/schema";
import type { ImportContext } from "./registry";

type AttachmentKind = Attachment["kind"];

/**
 * Copy the picked source file into app storage and create an `attachment` row
 * linked to `entityType`. Returns the new attachment id, or null when there is
 * no source file. Modules typically call `updateAttachment(id, { linkedEntityId })`
 * afterwards once the target record has an id.
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
