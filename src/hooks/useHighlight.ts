import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { HIGHLIGHT_PARAM } from "@/db/search-index";

/**
 * "Take me to that row" for list pages.
 *
 * Records without a detail page (a vaccine, an allergy, a note, a weight entry)
 * are reached from ⌘K as `/vaccines?highlight=42`. This hook reads that id,
 * scrolls the matching row into view, and marks it for a couple of seconds so
 * the eye lands on it — then lets it fade back into the list. The parameter is
 * dropped from the URL once consumed, so a re-render, a tab switch or a back
 * navigation doesn't replay the flash.
 */

/** How long the flagged row stays marked before fading back to normal. */
const HIGHLIGHT_MS = 2400;

export type Highlight = {
  /** The requested record id, or null when the page was opened normally. */
  id: number | null;
  /** True while the flash is showing (false again after it fades). */
  active: boolean;
  /** Attach to the matching row: scrolls it into view once, on mount. */
  ref: (el: HTMLElement | null) => void;
  /** Classes for the row: a ring that fades out rather than snapping off. */
  className: (rowId: number) => string;
};

export function useHighlight(): Highlight {
  const [params, setParams] = useSearchParams();
  const raw = params.get(HIGHLIGHT_PARAM);
  const id = raw !== null && /^\d+$/.test(raw) ? Number(raw) : null;

  const [active, setActive] = React.useState(id !== null);

  React.useEffect(() => {
    if (id === null) {
      setActive(false);
      return;
    }
    setActive(true);
    const timer = window.setTimeout(() => {
      setActive(false);
      // Consume the parameter so the row isn't re-flagged on the next render
      // pass; `replace` keeps the flagged URL out of the history stack.
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete(HIGHLIGHT_PARAM);
          return next;
        },
        { replace: true },
      );
    }, HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [id, setParams]);

  const ref = React.useCallback((el: HTMLElement | null) => {
    // `block: "center"` rather than "nearest": a row already just inside the
    // viewport edge would otherwise not move at all, and the user would be left
    // hunting for what flashed.
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);

  // A background tint rather than a ring: the flagged element is as often a
  // <tr> as a card, and box-shadow rings render inconsistently on table rows.
  // The tint is unmistakable on arrival and dissolves on the linger clock —
  // the one place in the motion system where a slow fade is the point.
  const className = React.useCallback(
    (rowId: number) =>
      id === rowId
        ? `transition-colors duration-[var(--motion-linger)] ${active ? "bg-primary/10" : "bg-transparent"}`
        : "",
    [id, active],
  );

  return { id, active, ref, className };
}
