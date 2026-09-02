import type { Journal, NavType, Visit } from "@/app/nav-journal";

/**
 * The motion system's numbers, mirrored from `src/index.css` so JavaScript-driven
 * animations (FLIP, stagger, exit-before-remove) run on the same clock as the
 * CSS ones. The rules that go with them live in `docs/motion.md`.
 */
export const MOTION_MS = {
  /** Feedback: hover, press, focus, toggles, popovers, exits. */
  quick: 120,
  /** Reveal: page and content entrances, toasts, dialogs. */
  base: 180,
  /** Spatial: accordion height, list reorder, row removal. */
  slow: 280,
  /** Attention decaying: the ⌘K highlight tint. */
  linger: 600,
} as const;

export const EASE_OUT_SOFT = "cubic-bezier(0.22, 1, 0.36, 1)";
export const EASE_IN_FIRM = "cubic-bezier(0.4, 0, 1, 1)";

/** How a screen should enter, derived from how the user got there. */
export type PageMotion = "drill" | "back" | "lateral" | "none";

/**
 * Direction of a route change, read off the journal *before* it has folded the
 * new visit in (the shell renders the page in the same commit the provider
 * records it). A key already in the journal is a POP: behind the pointer means
 * back, ahead means forward, which reads as drilling in again. An unseen key is
 * a PUSH — a declared drill-down comes from the right, anything else (sidebar,
 * ⌘K, a notification) is a lateral hop. A REPLACE is the same screen wearing a
 * new key and gets no entrance at all: re-animating the page you are already
 * reading because `?highlight=` was consumed would be a glitch, not motion.
 */
export function pageMotion(journal: Journal, visit: Visit, navType: NavType): PageMotion {
  const { entries, index } = journal;
  const seen = entries.findIndex((e) => e.key === visit.key);
  if (seen !== -1) {
    if (seen === index) return "none";
    return seen < index ? "back" : "drill";
  }
  if (navType === "REPLACE") return "none";
  if (navType === "POP") return "lateral";
  return visit.drill ? "drill" : "lateral";
}

export type StaggerOptions = {
  /** Delay added per item. */
  stepMs: number;
  /** Items past this index share the last delay and arrive as one block. */
  cap: number;
};

export const STAGGER: StaggerOptions = { stepMs: 20, cap: 12 };

/**
 * Entrance delay for the `index`-th item of a list. The first dozen ripple in
 * one after another; everything after arrives together with the last of them.
 * Without the cap a 200-row table would still be drawing itself four seconds
 * after the filter was applied.
 */
export function staggerDelay(index: number, opts: StaggerOptions = STAGGER): number {
  const i = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
  return Math.min(i, opts.cap) * opts.stepMs;
}

export type ListChange = {
  kind: "none" | "initial" | "reorder" | "refilter";
  /** Keys present now that were not before — they get a staggered entrance. */
  entering: string[];
  /** Keys present both before and after — they FLIP from their old position. */
  staying: string[];
};

/**
 * What a keyed list did between two renders, so the DOM side knows which rows
 * to slide and which to fade in. Filtering and sorting are told apart only for
 * the reader's benefit: a sort moves everything, a filter moves the survivors
 * and reveals newcomers, and both are handled by the same two passes.
 */
export function planListChange(prev: readonly string[], next: readonly string[]): ListChange {
  if (prev.length === 0) {
    return { kind: next.length === 0 ? "none" : "initial", entering: [...next], staying: [] };
  }
  if (prev.length === next.length && prev.every((k, i) => k === next[i])) {
    return { kind: "none", entering: [], staying: [] };
  }
  const prevSet = new Set(prev);
  const entering: string[] = [];
  const staying: string[] = [];
  for (const key of next) (prevSet.has(key) ? staying : entering).push(key);
  const kind = entering.length === 0 && prev.length === next.length ? "reorder" : "refilter";
  return { kind, entering, staying };
}

/**
 * Lists longer than this are not animated per item at all: the entrance stagger
 * is capped anyway, and a FLIP pass over hundreds of nodes costs more in
 * measurement than it returns in feel. The page-level entrance still covers them.
 */
export const MAX_ANIMATED_ITEMS = 150;

/**
 * Cheap guard for JavaScript-driven motion. Every CSS animation degrades through
 * the `prefers-reduced-motion` block in `index.css`; JavaScript has to ask.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Duration to actually run: zero when the user asked for no motion. */
export function motionDuration(ms: number, reduced: boolean = prefersReducedMotion()): number {
  return reduced ? 0 : ms;
}
