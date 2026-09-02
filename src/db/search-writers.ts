/**
 * Which repository functions have to tell the search index that the data moved
 * — and which ones deliberately do not, each with the reason.
 *
 * The bug this exists to prevent is not a wrong entry in a list; it is a NEW
 * write path added six months from now whose author never hears about the
 * search index. So the lists below are only half of the mechanism: the other
 * half is `findWriteFunctions`, which parses the files in `WRITER_SOURCES` and
 * reports every function that actually writes to the database. The test then
 * demands that each of them appears in exactly one of the three lists, exactly
 * the way `export-manifest.ts` demands that every schema table is either
 * exported or excluded with a reason. A new CRUD function therefore fails the
 * suite until somebody decides, in writing, whether it changes what search
 * returns.
 *
 * Kept dependency-free (no drizzle, no Tauri) so the parser and the coverage
 * rule are testable as plain functions over source text.
 */

/** Files whose write paths this manifest governs. */
export const WRITER_SOURCES = [
  "src/db/repos.ts",
  "src/db/chat-repos.ts",
  // Not a repository, but the one other place that writes health records:
  // the AI change-set commit. It is governed here so a statement added to that
  // transaction cannot quietly bypass the index either.
  "src/ai/agent/commit.ts",
] as const;

/** The call a write path uses to invalidate the index. */
export const STALE_MARK_CALL = "markSearchIndexStale()";

/** The call a write path uses to rebuild the index itself, synchronously. */
export const REBUILD_CALL = "rebuildSearchIndex(";

/**
 * Functions that write something the index carries, and therefore must call
 * `markSearchIndexStale()` before touching the database.
 *
 * "Carries" is judged against `buildIndexRows` in `search-index.ts`: the row's
 * title, subtitle, date, route or content blob. A delete counts too — a row
 * that outlives its record is the worse half of this bug, since it routes the
 * user to a page that no longer exists.
 */
export const INDEX_TOUCHING_WRITERS = [
  // dictionary — canonical name, category, code and aliases are all indexed
  "createBiomarker",
  "updateBiomarker",
  "updateBiomarkerDictionary",
  // labs
  "createPanelWithResults",
  "updatePanel",
  "updateResultValue",
  "createPanelFindings",
  "updateFinding",
  "deleteFinding",
  "deletePanel",
  // medications & prescriptions
  "createMedication",
  "updateMedication",
  "deleteMedication",
  "createPrescription",
  "deletePrescription",
  // visits and what hangs off them (a deleted visit re-routes its prescriptions)
  "createVisit",
  "updateVisit",
  "deleteVisit",
  "createDiagnosis",
  "updateDiagnosis",
  "deleteDiagnosis",
  // allergies, vaccines, imaging
  "createAllergy",
  "updateAllergy",
  "deleteAllergy",
  "createVaccine",
  "updateVaccine",
  "deleteVaccine",
  "createImagingRecord",
  "updateImagingRecord",
  "deleteImagingRecord",
  // journal — only entries with a note are indexed, but which ones have a note
  // is exactly what these edits change
  "createSymptomEntry",
  "updateSymptomEntry",
  "deleteSymptomEntry",
  "createWeightEntry",
  "updateWeightEntry",
  "deleteWeightEntry",
  "createBpEntry",
  "updateBpEntry",
  "deleteBpEntry",
  "upsertLifestyleLog",
  "deleteLifestyleLog",
  // notes and re-tests
  "createHealthNote",
  "updateHealthNote",
  "deleteHealthNote",
  "createRetestSchedule",
  "updateRetestSchedule",
  "deleteRetestSchedule",
  // attachments are indexed by file name, and carry the route to what they document
  "createAttachment",
  "updateAttachment",
  "deleteAttachmentIfUnreferenced",
  // chat — a thread is one index row built from its title and the user's messages
  "createChatThread",
  "renameChatThread",
  "archiveChatThread",
  "restoreChatThread",
  "deleteChatThread",
  "addChatMessage",
  "deleteChatMessage",
] as const;

export type IndexTouchingWriter = (typeof INDEX_TOUCHING_WRITERS)[number];

/**
 * Write paths that provably cannot change a single character of the index,
 * with the reason the reviewer is owed. Anything writing to a table that
 * `collectSources` reads must NOT be here — only writes to tables the index
 * ignores, or writes confined to columns it ignores.
 */
export const INDEX_NEUTRAL_WRITERS: Record<string, string> = {
  ensureActiveProfile: "creates the profile row; no profile column is indexed",
  updateProfile: "profile demographics are not part of any index row",
  completeOnboarding: "writes the profile row and re-derives lab flags, neither indexed",
  recomputeFlagsForProfile: "rewrites out_of_range/flag only; the index carries neither",
  markResultReviewed: "sets reviewed_at, which no index row reads",
  markPanelReviewed: "sets reviewed_at on a panel's results; same as markResultReviewed",
  logMedicationIntake: "medication_log is an adherence table, never indexed",
  deleteMedicationLogEntry: "medication_log is an adherence table, never indexed",
  recordThreadRecords: "chat_thread_record is the citation footprint, not indexed",
  updateChatMessageStatus: "turn status only; the message text is unchanged",
  addChatToolEvent: "chat_tool_event is transcript plumbing, not indexed",
  createChatChangeSet: "change sets and their items are proposals, not records",
  setChangeItemSelected: "selection state of a proposed change",
  discardChatChangeSet: "change-set status only",
  markChatChangeSetCommitted:
    "change-set status only — the records it created were written through the repo functions above",
  markChatChangeSetFailed: "change-set status only",
};

/**
 * Write paths that do not mark the index stale because they rebuild it
 * themselves, in full, as part of the same operation. Reserved for the AI
 * change-set commit, which writes a whole batch of records at once and already
 * owed the user a fresh index the moment it returned.
 */
export const INDEX_REBUILDING_WRITERS = ["commitHealthChangeSet"] as const;

/** Write paths claimed by no list — the coverage hole the test fails on. */
export function uncoveredWriters(writerNames: string[]): string[] {
  const claimed = new Set<string>([...INDEX_TOUCHING_WRITERS, ...INDEX_REBUILDING_WRITERS]);
  return writerNames.filter((name) => !claimed.has(name) && !(name in INDEX_NEUTRAL_WRITERS));
}

// ── source scanning ────────────────────────────────────────────────────────

/** Start of a top-level function declaration (column 0 — nested helpers are indented). */
const FUNCTION_START =
  /^(?:export\s+)?(?:async\s+)?function\s+(\w+)|^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/;

/**
 * A statement that writes to the database. Drizzle's builder is regularly
 * broken across lines by the formatter (`await db\n  .update(x)`), so the
 * pattern tolerates whitespace between `db` and the method; `executeTransaction`
 * covers the multi-statement plans in `tx-plans.ts`.
 */
const WRITE_CALL = /\bdb\s*\.\s*(?:insert|update|delete|run)\s*\(|\bexecuteTransaction\s*\(/;

export type WriteFunction = {
  name: string;
  /** True when the body calls `markSearchIndexStale()`. */
  marksStale: boolean;
  /** True when the body rebuilds the index itself instead of marking it. */
  rebuilds: boolean;
};

/**
 * Every top-level function in `source` whose body writes to the database, and
 * whether it invalidates the search index.
 *
 * A regex scan rather than a real parser on purpose: the input is two files we
 * own and format with prettier, the rule has to be readable by whoever it fails
 * on, and a false positive here is a prompt to think — never a broken build for
 * an unrelated reason. Comment lines are stripped first so the prose above a
 * function ("…must call db.delete…") cannot invent a write path.
 */
export function findWriteFunctions(source: string): WriteFunction[] {
  const found: WriteFunction[] = [];
  let current: { name: string; body: string[] } | null = null;
  const flush = () => {
    const fn = current;
    current = null;
    if (!fn) return;
    const body = fn.body.join("\n");
    if (WRITE_CALL.test(body)) {
      found.push({
        name: fn.name,
        marksStale: body.includes(STALE_MARK_CALL),
        rebuilds: body.includes(REBUILD_CALL),
      });
    }
  };
  for (const raw of stripComments(source).split("\n")) {
    const match = raw.match(FUNCTION_START);
    if (match) {
      flush();
      current = { name: match[1] ?? match[2], body: [] };
    }
    current?.body.push(raw);
  }
  flush();
  return found;
}

/** Removes `//` and `/* … *\/` comments so prose can't look like code. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}
