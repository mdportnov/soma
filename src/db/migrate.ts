import type Database from "@tauri-apps/plugin-sql";

/**
 * Applies drizzle-kit-generated SQL migrations at startup.
 * Files are bundled as raw strings via Vite and tracked in a local
 * `__migrations` table, so the app is fully self-contained offline.
 */
const migrationFiles = import.meta.glob<string>("./migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
});

const BREAKPOINT = "--> statement-breakpoint";

/** Schema version = number of bundled migrations; stamped into backup files. */
export const schemaVersion = Object.keys(migrationFiles).length;

export async function runMigrations(conn: Database): Promise<void> {
  await conn.execute(
    `CREATE TABLE IF NOT EXISTS __migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )`,
  );
  const applied = new Set(
    (await conn.select<{ name: string }[]>("SELECT name FROM __migrations")).map((r) => r.name),
  );

  const entries = Object.entries(migrationFiles).sort(([a], [b]) => a.localeCompare(b));

  for (const [path, contents] of entries) {
    const name = path.split("/").pop()!;
    if (applied.has(name)) continue;
    const statements = contents
      .split(BREAKPOINT)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const statement of statements) {
      await conn.execute(statement);
    }
    await conn.execute("INSERT INTO __migrations (name) VALUES ($1)", [name]);
  }
}

/**
 * Runs `task` at most once across app launches, tracked in `__migrations` under
 * a synthetic `name` (prefixed `task:` so it never collides with a real .sql
 * file). Use for one-time data backfills that aren't schema changes — e.g.
 * recomputing stored flags after the flag logic changes. The marker is written
 * only after the task resolves, so a crash mid-task retries on next launch.
 */
export async function runOnceTask(
  conn: Database,
  taskName: string,
  task: () => Promise<void>,
): Promise<void> {
  const name = `task:${taskName}`;
  const done = await conn.select<{ name: string }[]>(
    "SELECT name FROM __migrations WHERE name = $1",
    [name],
  );
  if (done.length) return;
  await task();
  await conn.execute("INSERT INTO __migrations (name) VALUES ($1)", [name]);
}
