/**
 * Tracks whether the `fts_records` index still matches the data it was built
 * from. Pure in-memory bookkeeping: no DB handle, no Tauri, no clock — so a
 * write path can mark the index stale without adding an IPC round trip, and
 * without any chance of the marking itself failing the medical write it
 * accompanies.
 *
 * Why a revision counter rather than a boolean per profile: a rebuild reads the
 * source tables over many statements, and a write can land in the middle of it.
 * The rebuild therefore captures the revision BEFORE it starts reading and
 * stamps that number when it finishes — a write that arrives meanwhile bumps
 * the counter past the stamp, so the index is correctly still considered stale
 * instead of being declared fresh on data it never saw.
 *
 * Every profile starts stale, deliberately. The counter lives in the renderer
 * process, so it knows nothing about writes made by the previous run of the app
 * or by the MCP sidecar (`mcp/src/db.ts` opens the same soma.db from another
 * process). Assuming "stale until this process has rebuilt once" costs one
 * rebuild per launch — which is strictly less than the status quo, where the
 * palette rebuilt on every single open — and is the only assumption that is
 * safe against a writer we cannot observe.
 *
 * Staleness is global rather than per-profile on the write side: most `repos.ts`
 * functions take a record id, not a profile id, and looking the owner up would
 * turn a free memory write into a query. Over-marking only ever costs an extra
 * rebuild; under-marking is the bug this module exists to prevent.
 */

/** Bumped by every write that can change what search returns. */
let dataRevision = 0;

/** Revision each profile's index was last successfully built at. */
const builtRevision = new Map<number, number>();

/** Marks the search index as no longer matching the data. Never throws. */
export function markSearchIndexStale(): void {
  dataRevision += 1;
}

/** The current data revision — captured by a rebuild before it reads anything. */
export function currentDataRevision(): number {
  return dataRevision;
}

/** True when this profile's index has not been built at the current revision. */
export function isSearchIndexStale(profileId: number): boolean {
  return builtRevision.get(profileId) !== dataRevision;
}

/**
 * Records a completed rebuild. `revision` must be the value read BEFORE the
 * rebuild started reading source rows; passing a later one would mark the index
 * fresh for writes it did not include.
 */
export function markSearchIndexBuilt(profileId: number, revision: number): void {
  builtRevision.set(profileId, revision);
}

/** Test-only: returns the tracker to its launch state (everything stale). */
export function resetSearchFreshness(): void {
  dataRevision = 0;
  builtRevision.clear();
}
