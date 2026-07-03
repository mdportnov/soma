/**
 * Pure safety-policy helpers for the MCP server: write gating, vault
 * detection messages and DB-error sanitization. No I/O — everything here is
 * unit-testable without a database (see guard.test.ts).
 */

/** Env var that opts the server in to write tools. Off by default. */
export const ALLOW_WRITES_ENV = "SOMA_MCP_ALLOW_WRITES";

/**
 * Writes are opt-in: any local MCP client can talk to this server, so
 * inserting health records must be explicitly enabled by the user in the
 * client config, not by whichever model happens to call a tool.
 */
export function writesAllowed(env: Record<string, string | undefined>): boolean {
  const v = env[ALLOW_WRITES_ENV];
  return v === "1" || v === "true";
}

/** Actionable refusal returned by every write tool when the gate is closed. */
export const WRITES_DISABLED_MESSAGE = `Write tools are disabled: this Soma MCP server runs read-only by default. To enable writes, set the environment variable ${ALLOW_WRITES_ENV}=1 for the server process — in your MCP client config add "env": { "${ALLOW_WRITES_ENV}": "1" } to the "soma" server entry (claude_desktop_config.json, .mcp.json, etc.) and restart the client. All read tools remain available.`;

/** Error for a DB that only exists as an encrypted `soma.db.vault` sibling. */
export function vaultLockedMessage(dbPath: string): string {
  return `The Soma database at ${dbPath} is currently locked by Soma's at-rest encryption (only the encrypted ${dbPath}.vault file exists). Open the Soma app to unlock it, then retry.`;
}

/** Error for a DB that simply doesn't exist yet. */
export function missingDbMessage(dbPath: string): string {
  return `Soma database not found at ${dbPath}. Run the Soma app once to create it, or pass --db <path> / set SOMA_DB.`;
}

/**
 * Maps an unexpected exception from a tool handler to a safe, actionable
 * message — never a stack trace, never raw driver internals. SQLite errors
 * from bun:sqlite carry a `code` like "SQLITE_BUSY"; we also match on the
 * message because drizzle sometimes rethrows with the code inlined.
 */
export function dbErrorMessage(err: unknown): string {
  const code =
    typeof err === "object" && err !== null ? String((err as { code?: unknown }).code ?? "") : "";
  const message = err instanceof Error ? err.message : String(err);
  const has = (tag: string) => code.includes(tag) || message.includes(tag);

  if (has("SQLITE_BUSY") || has("SQLITE_LOCKED")) {
    return "The database is busy — the Soma app may be writing; try again in a moment.";
  }
  if (has("SQLITE_CONSTRAINT")) {
    return "The write violated a database constraint — nothing was saved. Verify the referenced ids exist and retry.";
  }
  if (has("SQLITE_READONLY")) {
    return "The database file is not writable by this process — nothing was saved.";
  }
  return "Unexpected database error — the operation did not complete. Make sure the Soma app is healthy and try again.";
}
