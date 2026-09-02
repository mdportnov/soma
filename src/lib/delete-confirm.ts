import type { Lang } from "./i18n";
import { pluralForm } from "./plural";
import { undoCaveatLines, type UndoCaveat } from "./undo-scope";

/**
 * Copy for a "really delete this?" dialog. Deletion in Soma is one click away
 * from real medical history, so every prompt must name the row it is about to
 * remove and spell out what leaves with it — a faceless "Are you sure?" gives
 * the user nothing to check against.
 */

export type Translate = (key: string, vars?: Record<string, string>) => string;

/**
 * A child collection that the delete drags along. `key` points at
 * `confirm.cascade.<key>.<plural form>` in the dictionaries; zero counts are
 * dropped so an empty log never produces a scary line.
 */
export type CascadeItem = { key: string; count: number };

export type DeleteConfirmSpec = {
  /** Dictionary leaf under `confirm.delete.*` — what kind of row this is. */
  entity: string;
  /** Identifying name of the row (vaccine name, drug, symptom). */
  name?: string | null;
  /** Pre-formatted date of the row, appended to the name. */
  dateLabel?: string | null;
  /** Child rows deleted along with it. */
  cascade?: CascadeItem[];
  /** Extra already-translated lines (attached files, links that go stale). */
  notes?: string[];
  /**
   * True when the page offers an Undo toast afterwards. It changes the closing
   * line from "this cannot be undone" to a pointer at Undo — claiming
   * irreversibility where an Undo exists trains users to distrust the prompt,
   * and promising Undo where it is only partial does the opposite. The page
   * that offers the Undo is the one that knows what it can re-create, so it
   * states the limits in `undoCaveats`; with any present the closing line says
   * Undo is partial and the caveats are listed as bullets.
   */
  undoable?: boolean;
  /** What Undo will NOT bring back. Ignored unless `undoable` is true. */
  undoCaveats?: UndoCaveat[];
  /** Overrides the "Delete" button: use when confirming also detaches or unlinks. */
  confirmLabel?: string;
};

export type DeleteConfirmCopy = {
  title: string;
  description: string;
  /** Bullet lines rendered under the description. */
  details: string[];
  confirmLabel: string;
  destructive: true;
};

/** "Hepatitis B, 2 Sep 2026" — whichever of the two parts the row actually has. */
export function deleteTargetLabel(
  t: Translate,
  name?: string | null,
  dateLabel?: string | null,
): string {
  const parts = [name, dateLabel].map((p) => p?.trim()).filter((p): p is string => !!p);
  return parts.length ? parts.join(", ") : t("confirm.unnamedTarget");
}

/** One cascade sentence, plural-agreed with its count. */
export function cascadeLine(t: Translate, lang: Lang, item: CascadeItem): string {
  return t(`confirm.cascade.${item.key}.${pluralForm(lang, item.count)}`, {
    n: String(item.count),
  });
}

export function buildDeleteConfirm(
  t: Translate,
  lang: Lang,
  spec: DeleteConfirmSpec,
): DeleteConfirmCopy {
  const cascade = (spec.cascade ?? []).filter((c) => c.count > 0);
  const undoable = spec.undoable === true;
  const caveats = undoable ? (spec.undoCaveats ?? []) : [];
  const details = [
    ...cascade.map((c) => cascadeLine(t, lang, c)),
    ...(spec.notes ?? []).filter(Boolean),
    ...undoCaveatLines(t, caveats),
  ];
  const closing = !undoable
    ? "confirm.irreversible"
    : caveats.length
      ? "confirm.undoPartial"
      : "confirm.undoHint";
  return {
    title: t(`confirm.delete.${spec.entity}.title`, {
      target: deleteTargetLabel(t, spec.name, spec.dateLabel),
    }),
    description: [t(`confirm.delete.${spec.entity}.body`), t(closing)].join(" "),
    details,
    confirmLabel: spec.confirmLabel ?? t("common.delete"),
    destructive: true,
  };
}
