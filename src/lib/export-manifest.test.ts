import { describe, expect, it } from "vitest";
import { getTableName, is } from "drizzle-orm";
import { SQLiteTable } from "drizzle-orm/sqlite-core";
import * as schema from "@/db/schema";
import { EXCLUDED_TABLES, EXPORTED_TABLES, EXPORT_SCOPE, uncoveredTables } from "./export-manifest";

/** Every table the schema actually declares, by SQL name. */
const schemaTables = Object.values(schema)
  .filter((value) => is(value, SQLiteTable))
  .map((table) => getTableName(table as SQLiteTable));

describe("export coverage", () => {
  it("accounts for every table in the schema", () => {
    // The regression this guards: `labFinding`, `healthNote`, `retestSchedule`
    // and `lifestyleLog` were missing from a "full" export and nothing noticed.
    expect(uncoveredTables(schemaTables)).toEqual([]);
  });

  it("exports the four tables that used to vanish", () => {
    for (const table of ["lab_finding", "health_note", "retest_schedule", "lifestyle_log"]) {
      expect(EXPORTED_TABLES).toContain(table);
    }
  });

  it("names only tables that exist", () => {
    for (const table of EXPORTED_TABLES) expect(schemaTables).toContain(table);
  });

  it("gives a reason for everything it leaves out", () => {
    for (const [table, reason] of Object.entries(EXCLUDED_TABLES)) {
      expect(reason.length).toBeGreaterThan(0);
      // fts_records is a virtual table, declared in SQL rather than in schema.ts.
      if (table !== "fts_records") expect(schemaTables).toContain(table);
    }
  });

  it("never claims a table twice", () => {
    expect(new Set(EXPORTED_TABLES).size).toBe(EXPORTED_TABLES.length);
    for (const table of EXPORTED_TABLES) expect(EXCLUDED_TABLES).not.toHaveProperty(table);
  });

  it("states plainly that attachment files are not inside the export", () => {
    expect(EXPORT_SCOPE.includesAttachmentFiles).toBe(false);
    expect(EXPORT_SCOPE.note).toMatch(/backup/i);
  });
});
