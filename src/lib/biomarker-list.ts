/**
 * Pure list logic for the Biomarkers page: status classification, filtering
 * and sorting. Kept out of the component so the rules are unit-testable and so
 * the same vocabulary (status / sort / filter ids) can be persisted in prefs.
 */

import { normalizeLabel } from "@/lib/fuzzy";

/** Where the latest reading sits relative to the biomarker's two bands. */
export type RangeStatus = "optimal" | "in_range" | "out_of_range" | "not_evaluated";
/** Range status plus the "never measured" case a list has to rank as well. */
export type ListStatus = RangeStatus | "no_data";

export type BandedBiomarker = {
  id: number;
  canonicalName: string;
  category: string;
  aliases?: string[] | null;
  optimalLow?: number | null;
  optimalHigh?: number | null;
  isCustom?: boolean;
};

/** The latest reading as the repo returns it (SQLite booleans arrive as 0/1). */
export type LatestReading = {
  date: string;
  value: number;
  unit: string;
  outOfRange: boolean | number;
  flag: string | null;
  evaluated: boolean | number;
};

export type SeriesLike = { date: string; value: number };

export type ListItem<
  B extends BandedBiomarker = BandedBiomarker,
  S extends SeriesLike = SeriesLike,
> = {
  biomarker: B;
  latest: LatestReading | undefined;
  series: S[] | undefined;
};

export function rangeStatus(
  bio: Pick<BandedBiomarker, "optimalLow" | "optimalHigh">,
  latest: { value: number; outOfRange: boolean; evaluated: boolean },
): RangeStatus {
  if (!latest.evaluated) return "not_evaluated";
  if (latest.outOfRange) return "out_of_range";
  const { optimalLow, optimalHigh } = bio;
  const aboveLow = optimalLow == null || latest.value >= optimalLow;
  const belowHigh = optimalHigh == null || latest.value <= optimalHigh;
  if ((optimalLow != null || optimalHigh != null) && aboveLow && belowHigh) return "optimal";
  return "in_range";
}

export function listStatus(item: ListItem): ListStatus {
  if (!item.latest) return "no_data";
  return rangeStatus(item.biomarker, {
    value: item.latest.value,
    outOfRange: Boolean(item.latest.outOfRange),
    evaluated: Boolean(item.latest.evaluated),
  });
}

export function hasOptimalBand(bio: Pick<BandedBiomarker, "optimalLow" | "optimalHigh">): boolean {
  return bio.optimalLow != null || bio.optimalHigh != null;
}

// ── status filter ────────────────────────────────────────────────────────────

export const STATUS_FILTERS = [
  "all",
  "with_data",
  "out_of_range",
  "not_optimal",
  "optimal",
  "not_evaluated",
  "no_data",
] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export function isStatusFilter(v: unknown): v is StatusFilter {
  return typeof v === "string" && (STATUS_FILTERS as readonly string[]).includes(v);
}

/**
 * "not_optimal" means in range but outside the optimal band — it deliberately
 * excludes markers that simply have no optimal band, which would otherwise be
 * reported as "not optimal" for no reason the user can act on.
 */
export function matchesStatus(filter: StatusFilter, item: ListItem): boolean {
  const status = listStatus(item);
  switch (filter) {
    case "all":
      return true;
    case "with_data":
      return status !== "no_data";
    case "not_optimal":
      return status === "in_range" && hasOptimalBand(item.biomarker);
    default:
      return status === filter;
  }
}

// ── sorting ──────────────────────────────────────────────────────────────────

export const SORTS = ["attention", "name", "recent", "stale", "change"] as const;
export type Sort = (typeof SORTS)[number];

export function isSort(v: unknown): v is Sort {
  return typeof v === "string" && (SORTS as readonly string[]).includes(v);
}

/**
 * Category grouping only survives sorts whose order is meaningful inside a
 * group. A time- or change-based sort exists to put the single most stale /
 * most moved marker at the top of the page — slicing it per category would
 * bury exactly that.
 */
export function isGroupedSort(sort: Sort): boolean {
  return sort === "attention" || sort === "name";
}

// Out-of-range first, then not-evaluated (unverified values deserve a look),
// then optimal/in-range, then no-data — markers needing attention rise.
export const STATUS_RANK: Record<ListStatus, number> = {
  out_of_range: 0,
  not_evaluated: 1,
  optimal: 2,
  in_range: 2,
  no_data: 3,
};

/** Relative change of the last reading vs the one before; null below two points or when the previous value is 0. */
export function lastChangeRatio(series: SeriesLike[] | undefined): number | null {
  if (!series || series.length < 2) return null;
  const prev = series[series.length - 2]!.value;
  const last = series[series.length - 1]!.value;
  if (prev === 0) return null;
  return (last - prev) / Math.abs(prev);
}

const byName = (a: ListItem, b: ListItem) =>
  a.biomarker.canonicalName.localeCompare(b.biomarker.canonicalName);

/** Never-measured entries sink to the bottom under every sort. */
const noDataLast = (a: ListItem, b: ListItem) => Number(!a.latest) - Number(!b.latest);

export function compareItems(sort: Sort, a: ListItem, b: ListItem): number {
  switch (sort) {
    case "attention":
      return STATUS_RANK[listStatus(a)] - STATUS_RANK[listStatus(b)] || byName(a, b);
    case "name":
      return byName(a, b);
    case "recent":
      return (
        noDataLast(a, b) ||
        (b.latest?.date ?? "").localeCompare(a.latest?.date ?? "") ||
        byName(a, b)
      );
    case "stale":
      return (
        noDataLast(a, b) ||
        (a.latest?.date ?? "").localeCompare(b.latest?.date ?? "") ||
        byName(a, b)
      );
    case "change": {
      const ra = lastChangeRatio(a.series);
      const rb = lastChangeRatio(b.series);
      // Measured-and-moved first, then single readings, then nothing measured.
      return (
        noDataLast(a, b) ||
        Number(ra == null) - Number(rb == null) ||
        Math.abs(rb ?? 0) - Math.abs(ra ?? 0) ||
        byName(a, b)
      );
    }
  }
}

export function sortItems<T extends ListItem>(items: T[], sort: Sort): T[] {
  return [...items].sort((a, b) => compareItems(sort, a, b));
}

// ── filtering ────────────────────────────────────────────────────────────────

export type ListFilters = {
  query: string;
  status: StatusFilter;
  /** null = every category. */
  category: string | null;
};

export function matchesQuery(bio: BandedBiomarker, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  return [bio.canonicalName, ...(bio.aliases ?? [])].some((n) =>
    normalizeLabel(n).includes(normalizedQuery),
  );
}

export function filterItems<T extends ListItem>(items: T[], filters: ListFilters): T[] {
  const q = normalizeLabel(filters.query);
  return items.filter(
    (it) =>
      (filters.category == null || it.biomarker.category === filters.category) &&
      matchesStatus(filters.status, it) &&
      matchesQuery(it.biomarker, q),
  );
}

/** Which filters are narrowing the list — drives the "nothing matches" message. */
export function activeFilterKeys(filters: ListFilters): ("query" | "status" | "category")[] {
  const keys: ("query" | "status" | "category")[] = [];
  if (filters.query.trim()) keys.push("query");
  if (filters.status !== "all") keys.push("status");
  if (filters.category != null) keys.push("category");
  return keys;
}

/** Groups in first-seen order; the caller sorts items beforehand. */
export function groupByCategory<T extends ListItem>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const list = groups.get(it.biomarker.category) ?? [];
    list.push(it);
    groups.set(it.biomarker.category, list);
  }
  return groups;
}
