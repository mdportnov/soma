/**
 * Dev-only: delete the local SQLite database so the next app launch rebuilds it
 * from the current migrations (and re-seeds the biomarker dictionary).
 *
 * Use after squashing/regenerating migrations — drizzle-kit gives the squashed
 * file a fresh random name, and an existing local DB with the old name recorded
 * would otherwise re-run its CREATE statements. The migrator now tolerates that,
 * but a clean rebuild is still the honest way to verify a from-scratch install.
 *
 * Run:  pnpm db:reset
 * macOS path only (the dev platform), matching scripts/seed-fake-data.ts.
 */
import { rmSync, existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const APP_DIR = join(homedir(), "Library/Application Support/com.soma.health");

if (!existsSync(APP_DIR)) {
  console.log(`No app data dir at ${APP_DIR} — nothing to reset.`);
  process.exit(0);
}

const removed: string[] = [];
for (const f of readdirSync(APP_DIR)) {
  if (/^soma\.db($|[-.])/.test(f)) {
    rmSync(join(APP_DIR, f), { force: true });
    removed.push(f);
  }
}

console.log(
  removed.length
    ? `Removed ${removed.length} file(s): ${removed.join(", ")}\nNext launch will rebuild the DB from migrations.`
    : "No soma.db files found — already clean.",
);
