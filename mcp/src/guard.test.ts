import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileIdentity, liveDatabaseError, type SomaDb } from "./db";
import {
  ALLOW_WRITES_ENV,
  databaseNoLongerLiveMessage,
  dbErrorMessage,
  missingDbMessage,
  vaultLockedMessage,
  writesAllowed,
  WRITES_DISABLED_MESSAGE,
} from "./guard";

test("writes are disabled unless the opt-in env var is truthy", () => {
  expect(writesAllowed({})).toBe(false);
  expect(writesAllowed({ [ALLOW_WRITES_ENV]: "0" })).toBe(false);
  expect(writesAllowed({ [ALLOW_WRITES_ENV]: "" })).toBe(false);
  expect(writesAllowed({ [ALLOW_WRITES_ENV]: "no" })).toBe(false);
  expect(writesAllowed({ [ALLOW_WRITES_ENV]: "1" })).toBe(true);
  expect(writesAllowed({ [ALLOW_WRITES_ENV]: "true" })).toBe(true);
});

test("the disabled message names the exact env var to set", () => {
  expect(WRITES_DISABLED_MESSAGE).toContain(ALLOW_WRITES_ENV);
});

test("vault-locked and missing-db messages are distinct and actionable", () => {
  const locked = vaultLockedMessage("/data/soma.db");
  const missing = missingDbMessage("/data/soma.db");
  expect(locked).toContain("locked");
  expect(locked).toContain("Open the Soma app");
  expect(missing).toContain("not found");
  expect(locked).not.toBe(missing);
});

test("db errors map to safe messages by code without leaking internals", () => {
  const busy = dbErrorMessage({ code: "SQLITE_BUSY", message: "database is locked" });
  expect(busy).toContain("busy");

  const constraint = dbErrorMessage(new Error("SQLITE_CONSTRAINT: FOREIGN KEY constraint failed"));
  expect(constraint).toContain("constraint");

  const readonly = dbErrorMessage({ code: "SQLITE_READONLY" });
  expect(readonly).toContain("not writable");

  const unknown = dbErrorMessage(new Error("kaboom stack trace here"));
  expect(unknown).not.toContain("kaboom");
  expect(unknown).toContain("Unexpected database error");
});

test("a database that was unlinked or swapped is refused, in its own words", () => {
  const gone = databaseNoLongerLiveMessage("/data/soma.db");
  expect(gone).toContain("/data/soma.db");
  // The user has to know nothing was saved — a write through an unlinked
  // handle otherwise looks like a success and disappears.
  expect(gone).toContain("Nothing was written");
  expect(gone).not.toBe(vaultLockedMessage("/data/soma.db"));
  expect(gone).not.toBe(missingDbMessage("/data/soma.db"));
});

test("liveDatabaseError notices removal and replacement of the open file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "soma-live-"));
  const dbPath = path.join(dir, "soma.db");
  fs.writeFileSync(dbPath, "one");

  const db = { dbPath, identity: fileIdentity(dbPath) } as SomaDb;
  expect(liveDatabaseError(db)).toBeNull();

  // What Soma's lock does: the file is unlinked and only the vault remains.
  fs.rmSync(dbPath);
  expect(liveDatabaseError(db)).toContain("no longer");

  // What Soma's unlock does: a NEW file appears at the same path. Existing
  // again is not the same as being the file we hold open.
  fs.writeFileSync(dbPath, "two");
  expect(liveDatabaseError(db)).toContain("no longer");

  fs.rmSync(dir, { recursive: true, force: true });
});
