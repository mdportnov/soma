import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  INDEX_NEUTRAL_WRITERS,
  INDEX_REBUILDING_WRITERS,
  INDEX_TOUCHING_WRITERS,
  STALE_MARK_CALL,
  WRITER_SOURCES,
  findWriteFunctions,
  uncoveredWriters,
  type WriteFunction,
} from "./search-writers";

/** Every DB-writing function of the governed repositories, as they are today. */
const writers: WriteFunction[] = WRITER_SOURCES.flatMap((file) =>
  findWriteFunctions(readFileSync(resolve(process.cwd(), file), "utf8")),
);
const byName = new Map(writers.map((w) => [w.name, w]));

describe("search index write coverage", () => {
  it("finds the write paths at all (a parser that matches nothing proves nothing)", () => {
    expect(writers.length).toBeGreaterThan(50);
    expect(byName.has("deletePanel")).toBe(true);
    expect(byName.has("addChatMessage")).toBe(true);
  });

  it("accounts for every function that writes to the database", () => {
    // The regression this guards: a new CRUD path is added, nobody remembers
    // the search index, and a deleted record keeps answering ⌘K until the
    // palette happens to rebuild. Add the function to INDEX_TOUCHING_WRITERS
    // (and call markSearchIndexStale in it) or to INDEX_NEUTRAL_WRITERS with
    // the reason it cannot change a single index row.
    expect(uncoveredWriters([...byName.keys()])).toEqual([]);
  });

  it("makes every index-touching writer actually mark the index stale", () => {
    const silent = INDEX_TOUCHING_WRITERS.filter((name) => byName.get(name)?.marksStale !== true);
    expect(silent).toEqual([]);
  });

  it("makes the self-rebuilding writers actually rebuild", () => {
    for (const name of INDEX_REBUILDING_WRITERS) {
      expect(byName.get(name)?.rebuilds).toBe(true);
    }
  });

  it("gives a reason for every writer it excuses", () => {
    for (const [name, reason] of Object.entries(INDEX_NEUTRAL_WRITERS)) {
      expect(reason.length).toBeGreaterThan(10);
      expect(byName.has(name)).toBe(true);
    }
  });

  it("names only functions that still exist", () => {
    for (const name of INDEX_TOUCHING_WRITERS) expect(byName.has(name)).toBe(true);
  });

  it("never claims a writer twice", () => {
    expect(new Set(INDEX_TOUCHING_WRITERS).size).toBe(INDEX_TOUCHING_WRITERS.length);
    for (const name of INDEX_TOUCHING_WRITERS) {
      expect(INDEX_NEUTRAL_WRITERS).not.toHaveProperty(name);
      expect(INDEX_REBUILDING_WRITERS).not.toContain(name);
    }
  });

  it("covers deletion, not just creation — a stale row is the worse half", () => {
    for (const name of [
      "deletePanel",
      "deleteVisit",
      "deleteMedication",
      "deleteChatThread",
      "deleteChatMessage",
      "deleteHealthNote",
    ]) {
      expect(byName.get(name)?.marksStale).toBe(true);
    }
  });
});

describe("findWriteFunctions", () => {
  it("sees drizzle calls the formatter broke across lines", () => {
    const source = `
export async function updateThing(id: number) {
  await db
    .update(thing)
    .set({ name: "x" })
    .where(eq(thing.id, id));
}`;
    expect(findWriteFunctions(source)).toEqual([
      { name: "updateThing", marksStale: false, rebuilds: false },
    ]);
  });

  it("sees transaction plans as writes", () => {
    const source = `
export async function deleteThing(id: number) {
  ${STALE_MARK_CALL};
  await executeTransaction(thingDeletePlan(id));
}`;
    expect(findWriteFunctions(source)).toEqual([
      { name: "deleteThing", marksStale: true, rebuilds: false },
    ]);
  });

  it("ignores read-only functions", () => {
    const source = `
export async function listThings(profileId: number) {
  return db.select().from(thing).where(eq(thing.profileId, profileId));
}`;
    expect(findWriteFunctions(source)).toEqual([]);
  });

  it("does not mistake prose for a write path", () => {
    // A comment saying "…then db.delete(x)…" above a read-only helper must not
    // invent a writer that the manifest is then forced to classify.
    const source = `
/** Called before db.delete(thing) removes the row. */
export async function getThing(id: number) {
  // uses executeTransaction(…) elsewhere
  return db.select().from(thing).where(eq(thing.id, id));
}`;
    expect(findWriteFunctions(source)).toEqual([]);
  });

  it("attributes a write to the enclosing top-level function, not the previous one", () => {
    const source = `
export async function readOnly(id: number) {
  return db.select().from(thing).where(eq(thing.id, id));
}

export async function writes(id: number) {
  await db.delete(thing).where(eq(thing.id, id));
}`;
    expect(findWriteFunctions(source)).toEqual([
      { name: "writes", marksStale: false, rebuilds: false },
    ]);
  });
});
