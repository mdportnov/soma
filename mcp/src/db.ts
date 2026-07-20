import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as schema from "../../src/db/schema";
import journal from "../../src/db/migrations/meta/_journal.json";
import { missingDbMessage, vaultLockedMessage } from "./guard";

const APP_IDENTIFIER = "com.soma.health";
const DB_FILE = "soma.db";

/**
 * Migration filenames this checkout expects, embedded at build time from the
 * drizzle journal. The app stamps `__migrations.name` as `<tag>.sql`
 * (see src/db/migrate.ts), so we mirror that here — the compiled binary has
 * no migrations directory on disk to read.
 */
const EXPECTED_MIGRATIONS = journal.entries
  .map((e) => `${e.tag}.sql`)
  .sort((a, b) => a.localeCompare(b));

/** Mirrors Tauri's `app_config_dir()` — where tauri-plugin-sql keeps soma.db. */
export function defaultDbPath(): string {
  const home = os.homedir();
  switch (process.platform) {
    case "darwin":
      return path.join(home, "Library", "Application Support", APP_IDENTIFIER, DB_FILE);
    case "win32":
      return path.join(
        process.env.APPDATA ?? path.join(home, "AppData", "Roaming"),
        APP_IDENTIFIER,
        DB_FILE,
      );
    default:
      return path.join(
        process.env.XDG_CONFIG_HOME ?? path.join(home, ".config"),
        APP_IDENTIFIER,
        DB_FILE,
      );
  }
}

export function resolveDbPath(): string {
  const argIdx = process.argv.indexOf("--db");
  if (argIdx !== -1 && process.argv[argIdx + 1]) return path.resolve(process.argv[argIdx + 1]);
  if (process.env.SOMA_DB) return path.resolve(process.env.SOMA_DB);
  return defaultDbPath();
}

export type SomaDb = {
  orm: BunSQLiteDatabase<typeof schema>;
  sqlite: Database;
  /** False when the DB schema doesn't match this checkout's migrations — writes are refused. */
  writable: boolean;
  schemaNote: string | null;
};

/**
 * Compares migrations applied by the app (`__migrations` table, written by
 * src/db/migrate.ts) against the migration list embedded from the drizzle
 * journal. Any mismatch in either direction makes the connection read-only:
 * writing through a stale or newer schema could corrupt data the app relies on.
 */
function checkSchema(sqlite: Database): { writable: boolean; note: string | null } {
  const hasTable = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='__migrations'")
    .get();
  if (!hasTable) {
    return { writable: false, note: "database has never been initialized by the Soma app" };
  }
  const applied = new Set(
    (sqlite.prepare("SELECT name FROM __migrations").all() as { name: string }[]).map(
      (r) => r.name,
    ),
  );

  const pending = EXPECTED_MIGRATIONS.filter((name) => !applied.has(name));
  if (pending.length > 0) {
    return {
      writable: false,
      note: `database is behind this checkout (unapplied migrations: ${pending.join(", ")}); open the Soma app once to migrate`,
    };
  }
  // `task:`-prefixed rows are one-time data-backfill markers stamped by the
  // app's runOnceTask (src/db/migrate.ts), not schema migrations — their
  // presence says nothing about schema compatibility.
  const unknown = [...applied].filter(
    (name) => !name.startsWith("task:") && !EXPECTED_MIGRATIONS.includes(name),
  );
  if (unknown.length > 0) {
    return {
      writable: false,
      note: `database has migrations unknown to this checkout (${unknown.join(", ")}); update the repo / rebuild the MCP server`,
    };
  }
  return { writable: true, note: null };
}

export function openDb(dbPath: string): SomaDb {
  if (!fs.existsSync(dbPath)) {
    // With at-rest encryption enabled the app replaces soma.db by an
    // encrypted soma.db.vault on exit (src-tauri/src/vault.rs) — tell the
    // user to unlock instead of claiming the database doesn't exist.
    if (fs.existsSync(`${dbPath}.vault`)) {
      throw new Error(vaultLockedMessage(dbPath));
    }
    throw new Error(missingDbMessage(dbPath));
  }
  const sqlite = new Database(dbPath);
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA busy_timeout = 5000;");
  sqlite.exec("PRAGMA foreign_keys = ON;");

  const { writable, note } = checkSchema(sqlite);
  return { orm: drizzle(sqlite, { schema }), sqlite, writable, schemaNote: note };
}
