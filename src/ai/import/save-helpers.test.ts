import { beforeEach, describe, expect, it, vi } from "vitest";

// The helper sits between the Tauri filesystem and the Tauri-backed DB; both
// are stubbed so the behaviour under test is the one that matters — what
// happens to the stored source document when a save fails half-way.
vi.mock("@/db/repos", () => ({
  createAttachment: vi.fn(async () => 42),
  updateAttachment: vi.fn(async () => undefined),
  deleteAttachmentIfUnreferenced: vi.fn(async () => true),
}));

vi.mock("@/lib/attachments", () => ({
  storeAttachmentFile: vi.fn(async (path: string) => `/app/attachments/copy-${path}`),
  mimeFromPath: vi.fn(() => "application/pdf"),
}));

import { createAttachment, deleteAttachmentIfUnreferenced, updateAttachment } from "@/db/repos";
import { storeAttachmentFile } from "@/lib/attachments";
import { withSourceAttachment, storeSourceAttachment } from "./save-helpers";
import type { ImportContext } from "./registry";

/** Only the fields the source-attachment helpers read. */
const ctx = { profileId: 1, sourceFilePath: "/tmp/report.pdf" } as unknown as ImportContext;
const noFileCtx = { profileId: 1, sourceFilePath: null } as unknown as ImportContext;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("storeSourceAttachment", () => {
  it("copies the file and registers it under the target entity type", async () => {
    const id = await storeSourceAttachment(ctx, "lab_pdf", "lab_panel");
    expect(id).toBe(42);
    expect(storeAttachmentFile).toHaveBeenCalledWith("/tmp/report.pdf");
    expect(createAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ linkedEntityType: "lab_panel", kind: "lab_pdf" }),
    );
  });

  it("does nothing for a hand-typed import with no source file", async () => {
    expect(await storeSourceAttachment(noFileCtx, "lab_pdf", "lab_panel")).toBeNull();
    expect(createAttachment).not.toHaveBeenCalled();
  });
});

describe("withSourceAttachment", () => {
  it("links the document to the record as soon as the record exists", async () => {
    await withSourceAttachment(ctx, "lab_pdf", "lab_panel", async (source) => {
      expect(source.id).toBe(42);
      await source.link(7);
      // The link must land before the save returns: an attachment row whose
      // linked_entity_id is still null is invisible to every delete path.
      expect(updateAttachment).toHaveBeenCalledWith(42, {
        linkedEntityType: "lab_panel",
        linkedEntityId: 7,
      });
      return "/labs/7";
    });
    expect(deleteAttachmentIfUnreferenced).not.toHaveBeenCalled();
  });

  it("returns whatever the save routine returns", async () => {
    await expect(
      withSourceAttachment(ctx, "lab_pdf", "lab_panel", async () => "/labs/7"),
    ).resolves.toBe("/labs/7");
  });

  it("rolls the stored document back when the save throws", async () => {
    await expect(
      withSourceAttachment(ctx, "lab_pdf", "lab_panel", async () => {
        throw new Error("insert failed");
      }),
    ).rejects.toThrow("insert failed");
    expect(deleteAttachmentIfUnreferenced).toHaveBeenCalledWith(42);
  });

  it("rolls back even when the failure happens after the link was made", async () => {
    // The rollback is guarded in SQL: records written before the failure keep
    // the document, so this call is safe to make unconditionally.
    await expect(
      withSourceAttachment(ctx, "vaccination_cert", "vaccine", async (source) => {
        await source.link(3);
        throw new Error("second dose failed");
      }),
    ).rejects.toThrow("second dose failed");
    expect(deleteAttachmentIfUnreferenced).toHaveBeenCalledWith(42);
  });

  it("has nothing to roll back when there was no source file", async () => {
    await expect(
      withSourceAttachment(noFileCtx, "lab_pdf", "lab_panel", async (source) => {
        await source.link(7);
        await source.discard();
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(updateAttachment).not.toHaveBeenCalled();
    expect(deleteAttachmentIfUnreferenced).not.toHaveBeenCalled();
  });

  it("discards a document no record could claim", async () => {
    // A discharge draft with no visit data creates no visit: nothing can own
    // the file, and keeping it would leak a document no screen can reach.
    await withSourceAttachment(ctx, "discharge", "visit", async (source) => {
      await source.discard();
      return "/visits";
    });
    expect(deleteAttachmentIfUnreferenced).toHaveBeenCalledWith(42);
  });
});
