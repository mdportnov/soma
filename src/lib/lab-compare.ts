/**
 * Side-by-side comparison of two lab panels (Quality-of-life roadmap item).
 *
 * Pure and deterministic — no DB, no clock — so the join + delta logic is fully
 * unit-testable. Given the result rows of two panels it produces one row per
 * biomarker present in either panel, carrying each side's reading (or null when
 * the marker is absent on that side) and the A→B change. Comparable readings use
 * the normalized value/unit; the change reuses the same `changeBetween` engine
 * the per-panel view uses, so "improved/worsened" semantics stay consistent.
 */

import type { Biomarker } from "@/db/schema";
import { changeBetween, pointFromResult, type BiomarkerChange } from "@/lib/insights";

export type CompareReading = {
  value: number;
  unit: string;
  valueNormalized: number | null;
  unitNormalized: string | null;
  outOfRange: boolean;
  flag: "low" | "high" | "critical" | null;
};

/** The subset of a `ResultWithBiomarker` row this module needs. */
export type CompareResult = CompareReading & {
  biomarkerId: number;
  biomarker: Pick<
    Biomarker,
    | "canonicalName"
    | "category"
    | "defaultUnit"
    | "refLow"
    | "refHigh"
    | "optimalLow"
    | "optimalHigh"
    | "direction"
  >;
};

export type ComparisonRow = {
  biomarkerId: number;
  biomarker: CompareResult["biomarker"];
  a: CompareReading | null;
  b: CompareReading | null;
  /** Change from A → B; null when a side is missing or the units don't match. */
  change: BiomarkerChange | null;
};

function toReading(r: CompareResult | undefined): CompareReading | null {
  if (!r) return null;
  return {
    value: r.value,
    unit: r.unit,
    valueNormalized: r.valueNormalized,
    unitNormalized: r.unitNormalized,
    outOfRange: r.outOfRange,
    flag: r.flag,
  };
}

/** The value/unit to display and compare on — the normalized pair when present. */
export function displayValue(reading: CompareReading): { value: number; unit: string } {
  return {
    value: reading.valueNormalized ?? reading.value,
    unit: reading.unitNormalized ?? reading.unit,
  };
}

/**
 * Builds the comparison rows for two panels' results, sorted by category then
 * biomarker name (matching the per-panel table). `dateA`/`dateB` are metadata
 * only (carried into the change's ValuePoints; they never affect the math).
 */
export function buildComparison(
  resultsA: CompareResult[],
  dateA: string,
  resultsB: CompareResult[],
  dateB: string,
): ComparisonRow[] {
  const byIdA = new Map(resultsA.map((r) => [r.biomarkerId, r]));
  const byIdB = new Map(resultsB.map((r) => [r.biomarkerId, r]));
  const ids = new Set<number>([...byIdA.keys(), ...byIdB.keys()]);

  const rows: ComparisonRow[] = [];
  for (const id of ids) {
    const a = byIdA.get(id);
    const b = byIdB.get(id);
    const biomarker = (a ?? b)!.biomarker;
    const change =
      a && b
        ? changeBetween(
            pointFromResult({ ...a, date: dateA }),
            pointFromResult({ ...b, date: dateB }),
            biomarker,
          )
        : null;
    rows.push({ biomarkerId: id, biomarker, a: toReading(a), b: toReading(b), change });
  }

  return rows.sort(
    (x, y) =>
      x.biomarker.category.localeCompare(y.biomarker.category) ||
      x.biomarker.canonicalName.localeCompare(y.biomarker.canonicalName),
  );
}
