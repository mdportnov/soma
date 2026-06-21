import Database from "@tauri-apps/plugin-sql";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema";
import { runMigrations, runOnceTask } from "./migrate";
import {
  seedBiomarkersIfEmpty,
  seedReferenceRangesIfEmpty,
  syncBiomarkers,
} from "./seed-biomarkers";

const DB_URL = "sqlite:soma.db";

let sqlite: Database | null = null;

async function getSqlite(): Promise<Database> {
  if (!sqlite) {
    sqlite = await Database.load(DB_URL);
  }
  return sqlite;
}

/** Statements that return rows must go through `select` on tauri-plugin-sql. */
function returnsRows(sql: string): boolean {
  return /^\s*(select|pragma)\b/i.test(sql) || /\breturning\b/i.test(sql);
}

/**
 * Drizzle over tauri-plugin-sql via the sqlite-proxy driver.
 * The plugin returns row objects with column insertion order preserved,
 * so `Object.values` yields values in SELECT column order, which is what
 * the proxy driver expects.
 */
export const db = drizzle<typeof schema>(
  async (sql, params, method) => {
    const conn = await getSqlite();
    if (!returnsRows(sql)) {
      await conn.execute(sql, params);
      return { rows: [] };
    }
    const rows = (await conn.select<Record<string, unknown>[]>(sql, params)).map((row) =>
      Object.values(row),
    );
    return { rows: method === "get" ? (rows[0] ?? []) : rows };
  },
  { schema },
);

/**
 * Atomic, consistent snapshot of the live database into `path`.
 * `VACUUM INTO` is the only safe way to copy an open SQLite file.
 */
export async function vacuumInto(path: string): Promise<void> {
  const conn = await getSqlite();
  await conn.execute(`VACUUM INTO '${path.replace(/'/g, "''")}'`);
}

/** Closes the SQLite connection; required before the DB file is swapped on restore. */
export async function closeDatabase(): Promise<void> {
  if (sqlite) {
    await sqlite.close();
    sqlite = null;
  }
}

let initPromise: Promise<void> | null = null;

/** Idempotent startup: migrations + reference-data seed + default profile. */
export function initDatabase(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const conn = await getSqlite();
      await conn.execute("PRAGMA foreign_keys = ON");
      await runMigrations(conn);
      await seedBiomarkersIfEmpty(conn);
      // Reconcile the dictionary with the current SEED on every launch so
      // library expansions + new aliases reach existing installs (idempotent).
      await syncBiomarkers(conn);
      await seedReferenceRangesIfEmpty(conn);
      // One-time backfill: the critical-flag logic became clinically aware (no
      // more "0% eosinophils = critical"), so re-derive stored flags for data
      // imported under the old rule. Guarded → runs once per database.
      await runOnceTask(conn, "recompute-flags-clinical-critical-2026-06", async () => {
        const { recomputeFlagsForProfile } = await import("./repos");
        const profiles = await conn.select<{ id: number }[]>("SELECT id FROM profile");
        for (const p of profiles) await recomputeFlagsForProfile(p.id);
      });
    })();
  }
  return initPromise;
}
