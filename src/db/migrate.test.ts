import { describe, it, expect } from "vitest";
import {
  applyPending,
  idempotentDDL,
  isAlreadyApplied,
  runOnceTask,
  type MigrationConn,
} from "./migrate";

describe("idempotentDDL", () => {
  it("guards CREATE TABLE", () => {
    expect(idempotentDDL("CREATE TABLE `allergy` (id integer)")).toBe(
      "CREATE TABLE IF NOT EXISTS `allergy` (id integer)",
    );
  });

  it("guards CREATE INDEX and CREATE UNIQUE INDEX", () => {
    expect(idempotentDDL("CREATE INDEX `i` ON `t` (`a`)")).toBe(
      "CREATE INDEX IF NOT EXISTS `i` ON `t` (`a`)",
    );
    expect(idempotentDDL("CREATE UNIQUE INDEX `u` ON `t` (`a`)")).toBe(
      "CREATE UNIQUE INDEX IF NOT EXISTS `u` ON `t` (`a`)",
    );
  });

  it("is a no-op when the guard is already present", () => {
    const s = "CREATE TABLE IF NOT EXISTS `x` (id integer)";
    expect(idempotentDDL(s)).toBe(s);
  });

  it("leaves ALTER / INSERT statements untouched", () => {
    const alter = "ALTER TABLE `profile` ADD `ui_prefs` text";
    expect(idempotentDDL(alter)).toBe(alter);
  });
});

describe("isAlreadyApplied", () => {
  it("matches the re-run errors a populated DB raises", () => {
    expect(isAlreadyApplied(new Error("table `allergy` already exists"))).toBe(true);
    expect(isAlreadyApplied(new Error("duplicate column name: cost"))).toBe(true);
  });

  it("rejects unrelated errors", () => {
    expect(isAlreadyApplied(new Error("no such table: foo"))).toBe(false);
    expect(isAlreadyApplied(new Error("syntax error"))).toBe(false);
  });
});

/** In-memory stub: records executed DDL, tracks the __migrations table, and can
 *  be told to throw a chosen error the first time a matching statement runs. */
function makeConn(opts: { throwOnce?: { match: string; error: Error } } = {}) {
  const stamped = new Set<string>();
  const executed: string[] = [];
  let pending = opts.throwOnce;
  const conn: MigrationConn = {
    async execute(sql: string, params: unknown[] = []) {
      if (pending && sql.includes(pending.match)) {
        const err = pending.error;
        pending = undefined;
        throw err;
      }
      executed.push(sql);
      if (sql.startsWith("INSERT OR IGNORE INTO __migrations")) stamped.add(params[0] as string);
      return {};
    },
    async select<T>(sql: string, params: unknown[] = []) {
      if (sql.includes("FROM __migrations WHERE name")) {
        const name = params[0] as string;
        return (stamped.has(name) ? [{ name }] : []) as T;
      }
      if (sql.includes("FROM __migrations")) {
        return [...stamped].map((name) => ({ name })) as T;
      }
      return [] as T;
    },
  };
  return { conn, stamped, executed };
}

describe("applyPending", () => {
  it("applies and stamps a fresh migration", async () => {
    const { conn, stamped } = makeConn();
    await applyPending(conn, [{ name: "0000_init", sql: "CREATE TABLE `a` (id integer)" }]);
    expect(stamped.has("0000_init")).toBe(true);
  });

  it("skips an already-stamped migration", async () => {
    const { conn, executed } = makeConn();
    await applyPending(conn, [{ name: "0000_init", sql: "CREATE TABLE `a` (id integer)" }]);
    const before = executed.length;
    await applyPending(conn, [{ name: "0000_init", sql: "CREATE TABLE `a` (id integer)" }]);
    // Only the __migrations CREATE + SELECT ran again — no table DDL re-executed.
    expect(executed.length).toBe(before + 1);
  });

  it("recovers from an aborted run: tolerates 'already exists' and still stamps", async () => {
    const { conn, stamped } = makeConn({
      throwOnce: { match: "`a`", error: new Error("table `a` already exists") },
    });
    await applyPending(conn, [{ name: "0000_init", sql: "CREATE TABLE `a` (id integer)" }]);
    expect(stamped.has("0000_init")).toBe(true);
  });

  it("propagates a genuine error and does NOT stamp", async () => {
    const { conn, stamped } = makeConn({
      throwOnce: { match: "`a`", error: new Error("disk I/O error") },
    });
    await expect(
      applyPending(conn, [{ name: "0000_init", sql: "CREATE TABLE `a` (id integer)" }]),
    ).rejects.toThrow("disk I/O error");
    expect(stamped.has("0000_init")).toBe(false);
  });
});

describe("runOnceTask", () => {
  it("runs the task once, then never again", async () => {
    const { conn } = makeConn();
    await conn.execute(
      "CREATE TABLE IF NOT EXISTS __migrations (name TEXT PRIMARY KEY, applied_at TEXT)",
    );
    let runs = 0;
    const task = async () => {
      runs++;
    };
    await runOnceTask(conn, "backfill", task);
    await runOnceTask(conn, "backfill", task);
    expect(runs).toBe(1);
  });

  it("does not stamp when the task throws (so it retries next launch)", async () => {
    const { conn } = makeConn();
    let runs = 0;
    await expect(
      runOnceTask(conn, "flaky", async () => {
        runs++;
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    await runOnceTask(conn, "flaky", async () => {
      runs++;
    });
    expect(runs).toBe(2);
  });
});
