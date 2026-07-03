import { expect, test } from "bun:test";
import {
  ALLOW_WRITES_ENV,
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
