/**
 * The session journal — "how did the user actually get here".
 *
 * `nav.ts` describes the shape of the data; this file records the walk through
 * it. Every history entry the app visits is appended here with the key React
 * Router assigns it, so we can answer two questions the router itself will not:
 *
 *   1. What is the real previous screen, and how many entries back is it? The
 *      back affordance needs a *delta* rather than a path, because unwinding
 *      history (`navigate(-n)`) is what makes browser-back stay sane and what
 *      lets the shell restore the scroll position it saved for that entry.
 *      Navigating to the parent path instead would push, and every press of
 *      "back" would make the stack longer.
 *
 *   2. Which of those steps were drill-downs *into* the current record, so the
 *      breadcrumbs can say "Labs → Panel of Dec 4 → Haemoglobin" when the
 *      biomarker was opened from inside a panel, and plain
 *      "Biomarkers → Haemoglobin" when it was opened from the list.
 *
 * A step counts as a drill-down only when the link that made it said so
 * (`drillState`). That is deliberate: arriving from ⌘K, a notification, the
 * timeline or a chat record link is a jump, not containment, and pretending
 * otherwise would produce a trail that lies about the structure. Those jumps
 * still steer *back* — they just do not steer the crumbs.
 *
 * The journal is in-memory and session-scoped. A window reload wipes it, and
 * everything degrades to the `ROUTE_META` hierarchy, which is why the hierarchy
 * has to stay complete and correct rather than becoming vestigial.
 */

import {
  ancestorChain,
  isTransientRoute,
  resolveParent,
  routeTitleKey,
  type Crumb,
} from "@/app/nav";

/** Cap on retained journal entries; matches the shell's scroll-offset budget. */
export const MAX_JOURNAL_ENTRIES = 50;

/** Depth beyond which a trail stops being orientation and starts being clutter. */
export const MAX_TRAIL_DEPTH = 4;

/** Marker put on `location.state` by links that represent containment edges. */
const DRILL_FLAG = "somaDrill";

/**
 * Spread onto a `<Link state={...}>` (or `navigate(to, { state })`) when the
 * target is *inside* the current record: a biomarker opened from the panel that
 * measured it, a diagnosis opened from the visit that made it. Only these steps
 * extend the breadcrumb trail.
 */
export const drillState: Record<string, true> = { [DRILL_FLAG]: true };

export function isDrillState(state: unknown): boolean {
  return (
    typeof state === "object" &&
    state !== null &&
    (state as Record<string, unknown>)[DRILL_FLAG] === true
  );
}

export type JournalEntry = {
  /** `location.key` — unique per history entry, stable across re-renders. */
  key: string;
  path: string;
  /** Kept so a crumb link restores the tab/filter the user had open. */
  search: string;
  /** This entry was reached through a declared containment edge. */
  drill: boolean;
  /** Record title registered by the page while it was mounted. */
  label?: string;
};

export type Journal = {
  entries: JournalEntry[];
  /** Where in `entries` we currently stand; -1 before the first visit. */
  index: number;
};

export const EMPTY_JOURNAL: Journal = { entries: [], index: -1 };

export type NavType = "PUSH" | "POP" | "REPLACE";

export type Visit = Pick<JournalEntry, "key" | "path" | "search" | "drill">;

/**
 * Fold one navigation into the journal. Returns the same object when nothing
 * changed so the provider's state update is a no-op for React.
 */
export function recordVisit(journal: Journal, visit: Visit, navType: NavType): Journal {
  const { entries, index } = journal;

  // A key we have seen before is a POP (back/forward) — or a re-render of the
  // same entry. Move the pointer rather than appending: the forward half of the
  // stack is still reachable and must not be truncated.
  const seen = entries.findIndex((e) => e.key === visit.key);
  if (seen !== -1) {
    const current = entries[seen];
    if (seen === index && current.path === visit.path && current.search === visit.search) {
      return journal;
    }
    const next = entries.slice();
    next[seen] = { ...current, path: visit.path, search: visit.search };
    return { entries: next, index: seen };
  }

  // A replace is the same visit wearing a new key: consuming `?highlight=`,
  // switching threads in the assistant. It inherits the label and the drill
  // flag of the entry it overwrites, because it is not a new step.
  if (navType === "REPLACE" && index >= 0 && entries[index]) {
    const previous = entries[index];
    const next = entries.slice();
    next[index] = { ...previous, ...visit, drill: previous.drill || visit.drill };
    return { entries: next, index };
  }

  // A push invalidates whatever the user could have gone forward to.
  const next = entries.slice(0, index + 1);
  next.push(visit);
  return trim({ entries: next, index: next.length - 1 });
}

export type BackTarget =
  /** Unwind `delta` history entries — restores scroll, shortens the stack. */
  | { kind: "history"; delta: number; to: string }
  /** Nothing recorded to unwind to: go up the hierarchy instead. */
  | { kind: "path"; to: string };

/**
 * Where the back affordance on `pathname` should lead.
 *
 * `fallbackTo` overrides the hierarchical parent for pages whose "up" is
 * contextual rather than structural (the import wizard belongs to whichever
 * section opened it).
 */
export function resolveBack(
  journal: Journal,
  pathname: string,
  fallbackTo?: string,
): BackTarget | null {
  const { entries, index } = journal;
  if (index >= 0 && entries[index]?.path === pathname) {
    const previous = previousMeaningful(entries, index);
    if (previous >= 0) {
      const entry = entries[previous];
      return { kind: "history", delta: previous - index, to: `${entry.path}${entry.search}` };
    }
  }
  const parent = fallbackTo ?? resolveParent(pathname);
  return parent ? { kind: "path", to: parent } : null;
}

export type TrailOptions = {
  pathname: string;
  /** The current page's own crumb — record title, not a link. */
  leaf: Crumb;
  /** Translator for `ROUTE_META` title keys. */
  t: (key: string) => string;
  /**
   * Record titles for ancestor paths the registry can only label generically
   * (`/labs/42` is "Lab results" to the registry and "Panel of Dec 4" to the
   * page). Needed on a deep link, where no journal entry carries the label.
   */
  labels?: Record<string, string>;
  /** Replaces the hierarchical ancestors when "up" is contextual. */
  fallback?: Crumb;
};

/**
 * Assemble the breadcrumb trail: the drill-down chain the user actually walked,
 * rooted in the hierarchy above wherever that chain starts. With no chain the
 * trail is pure hierarchy, which is exactly what a deep link or a ⌘K jump
 * should show.
 */
export function buildTrail(journal: Journal, options: TrailOptions): Crumb[] {
  const { pathname, leaf, t, labels = {}, fallback } = options;
  const chain = drillChain(journal, pathname);
  const head = chain[0]?.path ?? pathname;

  const labelFor = (path: string, entry?: JournalEntry) => {
    const key = routeTitleKey(path);
    return labels[path] ?? entry?.label ?? (key ? t(key) : path);
  };
  const link = (path: string, entry?: JournalEntry): Crumb => {
    const delta = deltaTo(journal, path);
    return {
      label: labelFor(path, entry),
      to: entry ? `${entry.path}${entry.search}` : path,
      ...(delta !== null ? { delta } : {}),
    };
  };

  const roots = fallback ? [fallback] : ancestorChain(head).map((path) => link(path));
  const trail = [...roots, ...chain.map((entry) => link(entry.path, entry)), leaf];
  // Keep the tail: the leaf and its nearest context orient the user, a
  // seven-deep trail just wraps onto a second line.
  return trail.length > MAX_TRAIL_DEPTH ? trail.slice(trail.length - MAX_TRAIL_DEPTH) : trail;
}

/**
 * The unbroken run of drill-down steps leading to the current entry, oldest
 * first and excluding the current page. Stops as soon as a step was not a
 * declared drill-down — a ⌘K jump in the middle of a session must not graft the
 * page you happened to be on into the trail.
 */
function drillChain(journal: Journal, pathname: string): JournalEntry[] {
  const { entries, index } = journal;
  if (index < 0 || entries[index]?.path !== pathname) return [];
  const chain: JournalEntry[] = [];
  let i = index;
  while (entries[i]?.drill && chain.length < MAX_TRAIL_DEPTH) {
    const previous = previousMeaningful(entries, i);
    if (previous < 0) break;
    chain.unshift(entries[previous]);
    i = previous;
  }
  return chain;
}

/**
 * Nearest entry behind `from` that is worth landing on: not the page we are
 * already looking at (the assistant rewriting `?thread=`, a list swapping tabs)
 * and not a spent wizard or creation form.
 */
function previousMeaningful(entries: JournalEntry[], from: number): number {
  const current = entries[from]?.path;
  for (let i = from - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.path === current) continue;
    if (isTransientRoute(entry.path)) continue;
    return i;
  }
  return -1;
}

/**
 * How far back `path` sits from where we stand, or null if it is not behind us.
 * Lets a crumb click unwind history instead of pushing a duplicate entry.
 */
function deltaTo(journal: Journal, path: string): number | null {
  const { entries, index } = journal;
  for (let i = index - 1; i >= 0; i--) {
    if (entries[i].path === path) return i - index;
  }
  return null;
}

function trim(journal: Journal): Journal {
  const { entries, index } = journal;
  if (entries.length <= MAX_JOURNAL_ENTRIES) return journal;
  const drop = entries.length - MAX_JOURNAL_ENTRIES;
  return { entries: entries.slice(drop), index: index - drop };
}
