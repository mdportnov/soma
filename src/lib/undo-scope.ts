import type { Translate } from "./delete-confirm";

/**
 * How complete the Undo of a delete really is.
 *
 * Every Undo toast in the app re-creates the deleted row from a snapshot taken
 * before the delete. That brings the row itself back, but not everything that
 * left with it: a source file is erased from disk the moment the delete runs,
 * an intake log is cascaded away, a prescription's link to its visit cannot be
 * re-established. With automatic backups off, the Undo button is the user's
 * only safety net — so wherever it is only a partial one, the prompt says so
 * before the click and the toast says so after it. The page that knows what
 * hangs off the row names the caveats; this module only turns them into copy.
 */
export type UndoCaveat =
  /** A linked source document is erased from disk and never comes back. */
  | "file"
  /** Prescriptions that pointed at the visit stay detached after Undo. */
  | "links"
  /** The medication's intake history is gone; Undo restores an empty log. */
  | "log";

/** Longest Undo window for a delete: long enough to read a caveat and decide. */
export const UNDO_TOAST_DURATION = 10_000;

/** Dialog bullet lines, one per caveat, in the order given. */
export function undoCaveatLines(t: Translate, caveats: readonly UndoCaveat[]): string[] {
  return dedupe(caveats).map((c) => t(`confirm.undoCaveat.${c}`));
}

/**
 * One short line for the toast, or undefined when Undo is complete. Several
 * caveats are joined into one sentence so the toast stays a toast.
 */
export function undoToastCaveat(
  t: Translate,
  caveats: readonly UndoCaveat[] | undefined,
): string | undefined {
  const unique = dedupe(caveats ?? []);
  if (!unique.length) return undefined;
  return unique.map((c) => t(`toasts.undoCaveat.${c}`)).join(" ");
}

function dedupe(caveats: readonly UndoCaveat[]): UndoCaveat[] {
  return [...new Set(caveats)];
}
