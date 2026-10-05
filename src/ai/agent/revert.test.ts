import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChangeSetWithItems } from "@/db/chat-repos";
import type { TransactionStatement } from "@/db/transaction";

const state = vi.hoisted(() => ({
  set: null as unknown,
  rows: [] as unknown[][],
  executed: [] as TransactionStatement[],
}));

vi.mock("@/db/client", () => ({ db: { all: vi.fn(async () => state.rows) } }));
vi.mock("@/db/chat-repos", () => ({ getChatChangeSet: vi.fn(async () => state.set) }));
vi.mock("@/db/transaction", () => ({
  executeTransaction: vi.fn(async (statements: TransactionStatement[]) => {
    state.executed = statements;
    return [];
  }),
}));
vi.mock("@/db/search", () => ({ rebuildSearchIndex: vi.fn() }));
vi.mock("@/db/repos", () => ({ recomputeFlagsForProfile: vi.fn() }));

const { revertBlocker, revertHealthChangeSet } = await import("./revert");

function changeSet(items: Array<Partial<ChangeSetWithItems["items"][number]>>) {
  return {
    id: 5,
    threadId: 1,
    sourceMessageId: 9,
    status: "committed",
    items: items.map((item, index) => ({
      id: index + 1,
      status: "committed",
      selected: true,
      beforeJson: null,
      ...item,
    })),
  } as unknown as ChangeSetWithItems;
}

const sqlOf = () => state.executed.map((statement) => statement.sql);

describe("revertHealthChangeSet", () => {
  beforeEach(() => {
    state.rows = [];
    state.executed = [];
  });

  it("restores the fields an edit wrote while they still hold its values", async () => {
    state.set = changeSet([
      {
        operation: "update",
        entityType: "vaccine",
        entityId: 29,
        payloadJson: { kind: "update_vaccine", vaccineId: 29, date: "2026-07-28" },
        beforeJson: { id: 29, vaccineName: "DTP", date: "2019-05-10" },
      },
    ]);
    state.rows = [["2026-07-28"]];
    await revertHealthChangeSet(1, 5);
    expect(state.executed[0]).toMatchObject({
      sql: "UPDATE vaccine SET date = ? WHERE id = ? AND profile_id = ?",
      params: ["2019-05-10", 29, 1],
    });
    expect(sqlOf().at(-1)).toContain("status = 'reverted'");
  });

  it("refuses when the record was edited after the change", async () => {
    state.set = changeSet([
      {
        operation: "update",
        entityType: "vaccine",
        entityId: 29,
        payloadJson: { kind: "update_vaccine", vaccineId: 29, date: "2026-07-28" },
        beforeJson: { id: 29, date: "2019-05-10" },
      },
    ]);
    state.rows = [["2026-08-01"]];
    await expect(revertHealthChangeSet(1, 5)).rejects.toThrow(/edited after/);
    expect(state.executed).toEqual([]);
  });

  it("removes a created record with its provenance", async () => {
    state.set = changeSet([
      {
        operation: "create",
        entityType: "weight",
        entityId: 4,
        payloadJson: { kind: "log_weight", weightKg: 72, date: "2026-10-01" },
      },
    ]);
    await revertHealthChangeSet(1, 5);
    expect(sqlOf()).toEqual(
      expect.arrayContaining([
        "DELETE FROM weight_log WHERE id = ?",
        "DELETE FROM record_provenance WHERE profile_id = ? AND entity_type = ? AND entity_id = ?",
      ]),
    );
  });

  it("re-inserts a deleted row with its id, without the removed document", async () => {
    state.set = changeSet([
      {
        operation: "delete",
        entityType: "vaccine",
        entityId: 29,
        payloadJson: { kind: "delete_record", entityType: "vaccine", entityId: 29, reason: "dup" },
        beforeJson: {
          id: 29,
          profileId: 1,
          vaccineName: "DTP",
          date: "2019-05-10",
          attachmentId: 3,
        },
      },
    ]);
    await revertHealthChangeSet(1, 5);
    expect(state.executed[0]).toEqual({
      sql: "INSERT INTO vaccine (id, profile_id, vaccine_name, date) VALUES (?, ?, ?, ?)",
      params: [29, 1, "DTP", "2019-05-10"],
    });
  });

  it("does not offer undo for deletes that took linked data with them", () => {
    const set = changeSet([
      {
        operation: "delete",
        entityType: "lab_panel",
        entityId: 2,
        payloadJson: { kind: "delete_record", entityType: "lab_panel", entityId: 2, reason: "x" },
      },
    ]);
    expect(revertBlocker(set)).toBe("irreversible_delete");
  });
});
