/**
 * Persisted sort / filter state of the Biomarkers page. A per-device UI
 * preference in localStorage (like `dashboard-prefs.ts` and `interests.ts`),
 * deliberately outside backups. The search query is NOT persisted — it is a
 * transient action, and reopening the page to a stale search reads as "my
 * biomarkers are missing".
 *
 * Unknown or malformed values fall back field by field to the defaults, so a
 * removed sort id in a future version can never strand the page on an option
 * that no longer exists.
 */

import { isSort, isStatusFilter, type Sort, type StatusFilter } from "./biomarker-list";

export type BiomarkerListPrefs = {
  sort: Sort;
  status: StatusFilter;
  category: string | null;
};

export const DEFAULT_BIOMARKER_LIST_PREFS: BiomarkerListPrefs = {
  sort: "attention",
  status: "all",
  category: null,
};

const STORAGE_KEY = "soma.biomarkers.list";

export function loadBiomarkerListPrefs(): BiomarkerListPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { ...DEFAULT_BIOMARKER_LIST_PREFS };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_BIOMARKER_LIST_PREFS };
    const p = parsed as Record<string, unknown>;
    return {
      sort: isSort(p.sort) ? p.sort : DEFAULT_BIOMARKER_LIST_PREFS.sort,
      status: isStatusFilter(p.status) ? p.status : DEFAULT_BIOMARKER_LIST_PREFS.status,
      category: typeof p.category === "string" && p.category ? p.category : null,
    };
  } catch {
    return { ...DEFAULT_BIOMARKER_LIST_PREFS };
  }
}

export function saveBiomarkerListPrefs(prefs: BiomarkerListPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable — the selection just won't persist this session */
  }
}

export function isDefaultBiomarkerListPrefs(prefs: BiomarkerListPrefs): boolean {
  return (
    prefs.sort === DEFAULT_BIOMARKER_LIST_PREFS.sort &&
    prefs.status === DEFAULT_BIOMARKER_LIST_PREFS.status &&
    prefs.category === DEFAULT_BIOMARKER_LIST_PREFS.category
  );
}
