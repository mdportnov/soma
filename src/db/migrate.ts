/**
 * Applies drizzle-kit-generated SQL migrations at startup.
 * Files are bundled as raw strings via Vite and tracked in a local
 * `__migrations` table, so the app is fully self-contained offline.
 *
 * Robustness contract — this runs on every launch, so it must never brick a
 * database no matter how the previous run ended:
 *   • crash / forced-quit mid-migration → the unfinished migration is re-applied
 *     on the next launch (idempotent DDL + tolerated "already applied" errors),
 *     never half-failing on a table that the aborted run already created;
 *   • a squashed / renamed initial migration meeting an already-populated file
 *     (common in development) → re-applies as a no-op and simply records the new
 *     name instead of erroring with "table … already exists";
 *   • a normal restart with nothing new → every migration is already stamped, so
 *     the loop does no work.
 * Each statement is its own implicit SQLite transaction, so a statement either
 * fully applies or not at all; we rely on that plus idempotency rather than a
 * cross-statement transaction (which the pooled plugin connection can't promise).
 */
const migrationFiles = import.meta.glob<string>("./migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
});

const BREAKPOINT = "--> statement-breakpoint";

/**
 * Schema version stamped into backup files and compared on restore.
 *
 * This is an explicit constant, NOT the count of bundled migration files: the
 * pre-squash history reached 6 (backups written by those builds carry 6), and
 * squashing the migrations into one file would have reset a count-based version
 * to 1 — wrongly rejecting every older backup as "newer than the app". Bump it
 * by hand whenever a new migration is added (0001_fts_records → 7).
 */
export const schemaVersion = 7;

/** Minimal connection surface the migrator needs — lets it be unit-tested with
 *  a stub instead of a real SQLite handle. */
export interface MigrationConn {
  execute(sql: string, params?: unknown[]): Promise<unknown>;
  select<T>(sql: string, params?: unknown[]): Promise<T>;
}

/**
 * Rewrites a CREATE TABLE/INDEX so re-applying it on a database that already has
 * the object is a no-op rather than a hard error. drizzle emits plain
 * `CREATE TABLE`/`CREATE [UNIQUE] INDEX`; everything else (ALTER, DROP, INSERT)
 * passes through untouched and leans on `isAlreadyApplied` for re-run safety.
 */
export function idempotentDDL(statement: string): string {
  return statement
    .replace(/^(\s*CREATE\s+TABLE\s+)(?!IF\s+NOT\s+EXISTS\b)/i, "$1IF NOT EXISTS ")
    .replace(/^(\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+)(?!IF\s+NOT\s+EXISTS\b)/i, "$1IF NOT EXISTS ");
}

/**
 * True for the errors a statement legitimately raises when its effect is already
 * present — i.e. it was applied by an earlier run that aborted before the
 * migration could be stamped. `CREATE … IF NOT EXISTS` removes the table/index
 * cases; `ALTER TABLE … ADD COLUMN` can't be guarded inline, so its "duplicate
 * column" is tolerated here. Anything else is a real failure and propagates.
 */
export function isAlreadyApplied(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return msg.includes("already exists") || msg.includes("duplicate column");
}

/** Applies any not-yet-recorded migrations, in order. Exported (and decoupled
 *  from the Vite glob) so the apply logic is directly unit-testable. */
export async function applyPending(
  conn: MigrationConn,
  migrations: { name: string; sql: string }[],
): Promise<void> {
  await conn.execute(
    `CREATE TABLE IF NOT EXISTS __migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )`,
  );
  const applied = new Set(
    (await conn.select<{ name: string }[]>("SELECT name FROM __migrations")).map((r) => r.name),
  );

  for (const { name, sql } of migrations) {
    if (applied.has(name)) continue;
    const statements = sql
      .split(BREAKPOINT)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const statement of statements) {
      try {
        await conn.execute(idempotentDDL(statement));
      } catch (e) {
        // A re-applied statement whose effect already exists is expected after an
        // aborted run — skip it. Any other error is genuine and must surface.
        if (isAlreadyApplied(e)) continue;
        throw e;
      }
    }
    // INSERT OR IGNORE: stamping is itself idempotent, so a retry that already
    // recorded the name (before crashing elsewhere) doesn't trip the PK.
    await conn.execute("INSERT OR IGNORE INTO __migrations (name) VALUES ($1)", [name]);
  }
}

export async function runMigrations(conn: MigrationConn): Promise<void> {
  const migrations = Object.entries(migrationFiles)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, sql]) => ({ name: path.split("/").pop()!, sql }));
  await applyPending(conn, migrations);
}

/**
 * Runs `task` at most once across app launches, tracked in `__migrations` under
 * a synthetic `name` (prefixed `task:` so it never collides with a real .sql
 * file). Use for one-time data backfills that aren't schema changes — e.g.
 * recomputing stored flags after the flag logic changes. The marker is written
 * only after the task resolves, so a crash mid-task retries on next launch
 * (the task itself must therefore be idempotent).
 */
export async function runOnceTask(
  conn: MigrationConn,
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
  await conn.execute("INSERT OR IGNORE INTO __migrations (name) VALUES ($1)", [name]);
}
