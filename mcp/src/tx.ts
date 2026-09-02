/**
 * Executes the shared statement plans of `src/db/tx-plans.ts` against the
 * sidecar's bun:sqlite handle.
 *
 * The sidecar writes the SAME database file as the app, so a delete performed
 * here must leave exactly the state a delete performed in the UI would. The
 * plans are therefore imported, never re-typed: the ORDER of the statements is
 * the safety property (child rows first, attachment last, under its NOT EXISTS
 * guards) and a second hand-written copy of that order is precisely how the two
 * implementations drifted apart in the first place.
 *
 * What differs is only the runtime. The app has to cross an IPC boundary into
 * `src-tauri/src/transaction.rs` because its pooled plugin connection cannot
 * promise a real BEGIN/COMMIT; here bun:sqlite owns a single connection, so the
 * same plan runs directly. This function mirrors the Rust executor's contract
 * statement for statement — same `$lastInsertId` back-references, same
 * `minRowsAffected` conflict check, same results array.
 */

import type { Database } from "bun:sqlite";
import type { TransactionParam, TransactionStatement } from "../../src/db/transaction";

export type StatementResult = { rowsAffected: number; lastInsertId: number };

/**
 * bun:sqlite binds numbers, strings, null, bigint and Uint8Array. Booleans —
 * written by drizzle's `mode: "boolean"` columns and used by `panelInsertPlan`
 * — are stored by SQLite as 0/1, so they are normalized here rather than left
 * to the driver.
 */
function bindable(value: TransactionParam, results: StatementResult[]): string | number | null {
  if (typeof value === "object" && value !== null) {
    const previous = results[value.$lastInsertId];
    if (!previous) throw new Error(`invalid lastInsertId reference: ${value.$lastInsertId}`);
    return previous.lastInsertId;
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

/**
 * Runs a plan as one IMMEDIATE transaction and returns per-statement results.
 *
 * IMMEDIATE, not the default DEFERRED: the write lock is taken up front, so a
 * plan that reads its own earlier writes can never be interleaved with the app
 * writing the same rows and be rolled back at COMMIT. Any thrown error — a
 * constraint, or a `minRowsAffected` conflict — aborts the whole plan, so the
 * database is never left in the half-deleted state finding 2.2 describes.
 */
export function runTransaction(
  sqlite: Database,
  statements: TransactionStatement[],
): StatementResult[] {
  const execute = sqlite.transaction((plan: TransactionStatement[]): StatementResult[] => {
    const results: StatementResult[] = [];
    for (const statement of plan) {
      const params = statement.params.map((p) => bindable(p, results));
      const outcome = sqlite.prepare(statement.sql).run(...params);
      const rowsAffected = Number(outcome.changes);
      if (statement.minRowsAffected != null && rowsAffected < statement.minRowsAffected) {
        throw new Error(
          `transaction conflict: expected at least ${statement.minRowsAffected} affected row(s)`,
        );
      }
      results.push({ rowsAffected, lastInsertId: Number(outcome.lastInsertRowid) });
    }
    return results;
  });
  return execute.immediate(statements);
}
