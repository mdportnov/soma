/**
 * Integrity tests for the sidecar's write paths.
 *
 * The database is built from the app's real migration SQL, not a hand-written
 * subset: the whole point of these tests is that the sidecar leaves the exact
 * state the app would, and a simplified schema would silently drop the very
 * foreign keys and cascades that decide the outcome.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Database } from "bun:sqlite";
import {
  ATTACHMENT_ENTITY_TYPES,
  medicationDeletePlan,
  panelInsertPlan,
  vaccineDeletePlan,
} from "../../src/db/tx-plans";
import { collectLinkedAttachments, removeDeletedAttachmentFiles } from "./attachments";
import { runTransaction } from "./tx";

const MIGRATIONS_DIR = path.resolve(import.meta.dir, "../../src/db/migrations");

let sqlite: Database;
let tmpDir: string;

/** `SELECT <expr> AS n` → number. */
function scalar(sql: string, ...params: (string | number)[]): number {
  const row = sqlite.prepare(sql).get(...params) as { n: number } | null;
  return row ? Number(row.n) : 0;
}

function applyMigrations(db: Database): void {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) db.exec(statement);
    }
  }
}

function seedProfile(db: Database): number {
  db.prepare(
    "INSERT INTO profile (name, birth_date, sex) VALUES ('Test', '1990-01-01', 'male')",
  ).run();
  return (db.prepare("SELECT id FROM profile").get() as { id: number }).id;
}

/** An attachment row plus a real file on disk, linked to `entityType`/`entityId`. */
function seedAttachment(
  db: Database,
  profileId: number,
  entityType: string,
  entityId: number | null,
): { id: number; filePath: string } {
  const filePath = path.join(tmpDir, `doc-${Math.random().toString(36).slice(2)}.pdf`);
  fs.writeFileSync(filePath, "pdf");
  db.prepare(
    "INSERT INTO attachment (profile_id, file_path, mime_type, kind, linked_entity_type, linked_entity_id) VALUES (?, ?, 'application/pdf', 'other', ?, ?)",
  ).run(profileId, filePath, entityType, entityId);
  const [{ id }] = db.prepare("SELECT last_insert_rowid() AS id").all() as { id: number }[];
  return { id, filePath };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "soma-mcp-tx-"));
  sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  applyMigrations(sqlite);
});

afterEach(() => {
  sqlite.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("foreign keys are enforced on the sidecar connection", () => {
  const [{ foreign_keys: on }] = sqlite.prepare("PRAGMA foreign_keys").all() as {
    foreign_keys: number;
  }[];
  expect(on).toBe(1);
});

test("deleting a medication removes its adherence logs and its prescription document", () => {
  const profileId = seedProfile(sqlite);
  sqlite
    .prepare(
      "INSERT INTO medication (profile_id, name, type, start_date) VALUES (?, 'Vitamin D', 'supplement', '2026-01-01')",
    )
    .run(profileId);
  const medId = (sqlite.prepare("SELECT id FROM medication").get() as { id: number }).id;
  sqlite
    .prepare(
      "INSERT INTO medication_log (medication_id, taken_at, taken) VALUES (?, '2026-01-02T08:00:00Z', 1)",
    )
    .run(medId);
  const doc = seedAttachment(sqlite, profileId, ATTACHMENT_ENTITY_TYPES.medication, medId);

  const files = collectLinkedAttachments(sqlite, ATTACHMENT_ENTITY_TYPES.medication, medId);
  runTransaction(sqlite, medicationDeletePlan(medId));
  removeDeletedAttachmentFiles(sqlite, files);

  expect(scalar("SELECT count(*) AS n FROM medication")).toBe(0);
  expect(scalar("SELECT count(*) AS n FROM medication_log")).toBe(0);
  expect(scalar("SELECT count(*) AS n FROM attachment")).toBe(0);
  expect(fs.existsSync(doc.filePath)).toBe(false);
});

test("a document shared by another record survives the delete, file included", () => {
  const profileId = seedProfile(sqlite);
  const doc = seedAttachment(sqlite, profileId, ATTACHMENT_ENTITY_TYPES.vaccine, 1);
  // Two doses of the same vaccine, both pointing at one certificate — the case
  // that a straight `DELETE FROM attachment` would destroy for the second dose.
  for (const date of ["2026-01-01", "2026-02-01"]) {
    sqlite
      .prepare(
        "INSERT INTO vaccine (profile_id, vaccine_name, date, attachment_id) VALUES (?, 'Hep B', ?, ?)",
      )
      .run(profileId, date, doc.id);
  }
  const [first] = sqlite.prepare("SELECT id FROM vaccine ORDER BY id").all() as { id: number }[];
  sqlite.prepare("UPDATE attachment SET linked_entity_id = ? WHERE id = ?").run(first.id, doc.id);

  const files = collectLinkedAttachments(sqlite, ATTACHMENT_ENTITY_TYPES.vaccine, first.id);
  runTransaction(sqlite, vaccineDeletePlan(first.id));
  const removed = removeDeletedAttachmentFiles(sqlite, files);

  expect(scalar("SELECT count(*) AS n FROM vaccine")).toBe(1);
  expect(scalar("SELECT count(*) AS n FROM attachment")).toBe(1);
  expect(removed).toBe(0);
  expect(fs.existsSync(doc.filePath)).toBe(true);
});

test("a panel and its results commit together, or not at all", () => {
  const profileId = seedProfile(sqlite);
  sqlite
    .prepare(
      "INSERT INTO biomarker (canonical_name, category, default_unit) VALUES ('Ferritin', 'other', 'ng/mL')",
    )
    .run();
  const bioId = (sqlite.prepare("SELECT id FROM biomarker").get() as { id: number }).id;

  const [panelInsert] = runTransaction(
    sqlite,
    panelInsertPlan(
      { profileId, date: "2026-03-01", sampleTypes: ["blood"], importMethod: "mcp" },
      [{ biomarkerId: bioId, value: 42, unit: "ng/mL", outOfRange: false }],
      [],
    ),
  );
  const results = sqlite.prepare("SELECT panel_id AS panelId FROM lab_result").all() as {
    panelId: number;
  }[];
  expect(results).toHaveLength(1);
  // The result resolved its `$lastInsertId` back-reference to the new panel.
  expect(results[0].panelId).toBe(panelInsert.lastInsertId);

  // A second panel whose result names a biomarker that does not exist must
  // leave nothing behind — not even the panel row inserted before the failure.
  expect(() =>
    runTransaction(
      sqlite,
      panelInsertPlan(
        { profileId, date: "2026-04-01", sampleTypes: ["blood"], importMethod: "mcp" },
        [{ biomarkerId: 9999, value: 1, unit: "ng/mL", outOfRange: false }],
        [],
      ),
    ),
  ).toThrow();
  expect(scalar("SELECT count(*) AS n FROM lab_panel")).toBe(1);
});
