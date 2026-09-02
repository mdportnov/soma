import { useLocation } from "react-router-dom";
import type { Biomarker, LabPanel } from "@/db/schema";

/**
 * Continuity across a navigation.
 *
 * When the user opens a record from a list, the list already knows its name,
 * its date, its latest value. Throwing that away and making the detail page
 * re-derive it from a query is what makes the transition feel like a cut: the
 * row the user just read vanishes and, a beat later, an unrelated screen
 * appears. A *seed* carries the known part along on `location.state`, so the
 * detail page can paint its header — the thing the eye was on — in the very
 * same frame, and let the query fill in the rest around it.
 *
 * Seeds are a hint, never the truth: the page still loads, and the loaded
 * record replaces the seed the moment it arrives. They ride on history state,
 * so back/forward keeps them and a deep link simply has none.
 */

const SEED_KEY = "somaSeed";

/** The biomarkers list knows the dictionary row and the latest reading. */
export type BiomarkerSeed = {
  kind: "biomarker";
  biomarker: Biomarker;
  latest?: { value: number; unit: string; date: string };
};

/** The labs list knows the panel row and its result counts. */
export type LabPanelSeed = {
  kind: "labPanel";
  panel: LabPanel;
  resultCount: number;
  outOfRangeCount: number;
};

/**
 * Build `<Link state>` / `navigate(to, { state })` with a seed folded in.
 * Compose with `drillState` when the target is inside the current record:
 * `seedState(seed, drillState)`.
 */
export function seedState<T extends { kind: string }>(
  seed: T,
  base?: Record<string, unknown>,
): Record<string, unknown> {
  return { ...base, [SEED_KEY]: seed };
}

/**
 * Read the seed for this page, if the link that opened it left one and it is
 * of the expected kind. Anything else — a deep link, a search jump, a stale
 * state from another page — yields null and the page waits for its query as
 * before.
 */
export function useSeed<T extends { kind: string }>(kind: T["kind"]): T | null {
  const { state } = useLocation();
  return readSeed<T>(state, kind);
}

export function readSeed<T extends { kind: string }>(state: unknown, kind: T["kind"]): T | null {
  if (typeof state !== "object" || state === null) return null;
  const seed = (state as Record<string, unknown>)[SEED_KEY];
  if (typeof seed !== "object" || seed === null) return null;
  return (seed as { kind?: unknown }).kind === kind ? (seed as T) : null;
}
