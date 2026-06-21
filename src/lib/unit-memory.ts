/**
 * Per-lab unit memory.
 *
 * Labs are consistent about the units they print, but differ from each other
 * (one reports glucose in mg/dL, another in mmol/L). After the user confirms a
 * unit for a biomarker on a given lab's report, remember it so the next import
 * from the *same* lab defaults to the same unit — without ever overriding a unit
 * the user explicitly picked or the document actually printed.
 *
 * Storage is a small localStorage map keyed by `${normalizedLab}::${biomarkerId}`.
 * It is best-effort: any storage failure (private mode, quota, SSR/tests without
 * a DOM) degrades to a no-op rather than breaking import.
 */

import { normalizeLabel } from "@/lib/fuzzy";

const STORE_KEY = "soma.unitMemory";
/** Bound the map so a long history of one-off labs can't grow without limit. */
const MAX_ENTRIES = 1000;

type Store = Record<string, string>;

/** localStorage if present and usable, else null (access itself can throw). */
function storage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function load(): Store {
  const s = storage();
  if (!s) return {};
  try {
    const raw = s.getItem(STORE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

function persist(store: Store): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* quota exceeded / disabled — unit memory is best-effort */
  }
}

/** Stable key for a (lab, biomarker) pair. An unknown lab shares the "" bucket. */
function keyFor(labName: string | null | undefined, biomarkerId: number): string {
  return `${normalizeLabel(labName ?? "")}::${biomarkerId}`;
}

/**
 * Remembers the unit confirmed for this lab + biomarker. No-ops on a blank unit
 * or a non-finite id. Re-insertion keeps the entry "freshest" so the cap evicts
 * the least-recently-written pairs first.
 */
export function rememberUnit(
  labName: string | null | undefined,
  biomarkerId: number,
  unit: string,
): void {
  const trimmed = unit?.trim();
  if (!trimmed || !Number.isFinite(biomarkerId)) return;
  const store = load();
  const key = keyFor(labName, biomarkerId);
  delete store[key];
  store[key] = trimmed;
  const keys = Object.keys(store);
  if (keys.length > MAX_ENTRIES) {
    for (const stale of keys.slice(0, keys.length - MAX_ENTRIES)) delete store[stale];
  }
  persist(store);
}

/** The unit previously confirmed for this lab + biomarker, or null. */
export function recallUnit(labName: string | null | undefined, biomarkerId: number): string | null {
  if (!Number.isFinite(biomarkerId)) return null;
  return load()[keyFor(labName, biomarkerId)] ?? null;
}

/** Wipes all remembered units (Settings reset / tests). */
export function clearUnitMemory(): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(STORE_KEY);
  } catch {
    /* best-effort */
  }
}
