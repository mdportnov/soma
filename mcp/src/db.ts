import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../../src/db/schema";

const APP_IDENTIFIER = "com.soma.health";
const DB_FILE = "soma.db";

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
  orm: BetterSQLite3Database<typeof schema>;
  sqlite: Database.Database;
  /** False when the DB schema doesn't match this checkout's migrations — writes are refused. */
  writable: boolean;
  schemaNote: string | null;
};

/**
 * Compares migrations applied by the app (`__migrations` table, written by
 * src/db/migrate.ts) against the .sql files in src/db/migrations. Any
 * mismatch in either direction makes the connection read-only: writing
 * through a stale or newer schema could corrupt data the app relies on.
 */
function checkSchema(sqlite: Database.Database): { writable: boolean; note: string | null } {
  const migrationsDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../src/db/migrations",
  );
  if (!fs.existsSync(migrationsDir)) {
    return { writable: false, note: `migrations dir not found at ${migrationsDir}` };
  }
  const expected = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

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

  const pending = expected.filter((name) => !applied.has(name));
  if (pending.length > 0) {
    return {
      writable: false,
      note: `database is behind this checkout (unapplied migrations: ${pending.join(", ")}); open the Soma app once to migrate`,
    };
  }
  const unknown = [...applied].filter((name) => !expected.includes(name));
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
    throw new Error(
      `Soma database not found at ${dbPath}. Run the Soma app once to create it, or pass --db <path> / set SOMA_DB.`,
    );
  }
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");

  const { writable, note } = checkSchema(sqlite);
  return { orm: drizzle(sqlite, { schema }), sqlite, writable, schemaNote: note };
}
