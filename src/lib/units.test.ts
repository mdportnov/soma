import { describe, it, expect } from "vitest";
import type { Biomarker } from "@/db/schema";
import {
  normalizeUnit,
  unitsEquivalent,
  convertToDefaultUnit,
  resolveRange,
  computeFlag,
  ageYearsFrom,
  kgToLb,
  lbToKg,
  cmToFtIn,
  ftInToCm,
  allKnownUnits,
  convertibleUnits,
  type DemographicRange,
} from "./units";

/** Minimal biomarker stub for conversion/flag tests. */
function bio(code: string | null, defaultUnit: string): Pick<Biomarker, "code" | "defaultUnit"> {
  return { code, defaultUnit };
}

describe("normalizeUnit (Cyrillic → Latin)", () => {
  it("transliterates the common Russian molar units", () => {
    expect(normalizeUnit("мг/дл")).toBe("mg/dl");
    expect(normalizeUnit("мкг/дл")).toBe("µg/dl");
    expect(normalizeUnit("ммоль/л")).toBe("mmol/l");
    expect(normalizeUnit("нмоль/л")).toBe("nmol/l");
  });

  it("maps international-unit and unit abbreviations", () => {
    expect(normalizeUnit("МЕ/мл")).toBe("iu/ml");
    expect(normalizeUnit("Ед/л")).toBe("u/l");
  });

  it("lowercases and removes whitespace", () => {
    expect(normalizeUnit(" MG / DL ")).toBe("mg/dl");
  });
});

describe("unitsEquivalent", () => {
  it("treats identical spellings (incl. case) as equivalent", () => {
    expect(unitsEquivalent("mg/dL", "mg/dl")).toBe(true);
  });

  it("knows mass/volume synonyms", () => {
    expect(unitsEquivalent("ng/mL", "µg/L")).toBe(true);
    expect(unitsEquivalent("pg/mL", "ng/L")).toBe(true);
  });

  it("knows cell-count scientific-notation synonyms", () => {
    expect(unitsEquivalent("10^9/L", "x10^9/L")).toBe(true);
    expect(unitsEquivalent("x10^3/uL", "10^9/L")).toBe(true);
  });

  it("rejects units that need a molar conversion", () => {
    expect(unitsEquivalent("mg/dL", "mmol/L")).toBe(false);
  });
});

describe("convertToDefaultUnit — passthrough", () => {
  it("returns the value unchanged when units are already equivalent", () => {
    const r = convertToDefaultUnit(5.5, "mmol/L", bio("1558-6", "mmol/L"));
    expect(r).toEqual({ ok: true, value: 5.5, unit: "mmol/L" });
  });

  it("passes through via a synonym spelling", () => {
    const r = convertToDefaultUnit(4.9, "x10^3/uL", bio("6690-2", "10^9/L"));
    expect(r.ok && r.value).toBe(4.9);
  });
});

describe("convertToDefaultUnit — molar (analyte-specific)", () => {
  it("glucose mg/dL → mmol/L", () => {
    const r = convertToDefaultUnit(90, "mg/dL", bio("1558-6", "mmol/L"));
    expect(r.ok && r.value).toBeCloseTo(5.0, 1);
  });

  it("glucose mmol/L → mg/dL (reverse)", () => {
    const r = convertToDefaultUnit(5.5, "mmol/L", bio("1558-6", "mg/dL"));
    expect(r.ok && r.value).toBeCloseTo(99.1, 0);
  });

  it("urea mg/dL → mmol/L (the urea-not-BUN fix)", () => {
    const r = convertToDefaultUnit(35, "mg/dL", bio("3091-6", "mmol/L"));
    expect(r.ok && r.value).toBeCloseTo(5.83, 1);
  });

  it("testosterone ng/dL → nmol/L", () => {
    const r = convertToDefaultUnit(600, "ng/dL", bio("2986-8", "nmol/L"));
    expect(r.ok && r.value).toBeCloseTo(20.8, 0);
  });

  it("vitamin D nmol/L → ng/mL", () => {
    const r = convertToDefaultUnit(75, "nmol/L", bio("1989-3", "ng/mL"));
    expect(r.ok && r.value).toBeCloseTo(30.0, 0);
  });

  it("vitamin B12 pmol/L → pg/mL", () => {
    const r = convertToDefaultUnit(300, "pmol/L", bio("2132-9", "pg/mL"));
    expect(r.ok && r.value).toBeCloseTo(406.5, 0);
  });

  it("round-trips within rounding tolerance", () => {
    const fwd = convertToDefaultUnit(90, "mg/dL", bio("1558-6", "mmol/L"));
    expect(fwd.ok).toBe(true);
    if (!fwd.ok) return;
    const back = convertToDefaultUnit(fwd.value, "mmol/L", bio("1558-6", "mg/dL"));
    expect(back.ok && back.value).toBeCloseTo(90, 0);
  });
});

describe("convertToDefaultUnit — phase-3 molar additions", () => {
  // Each case converts INTO the analyte's default unit (the direction the import
  // pipeline uses); expected values derived from molar mass.
  const val = (r: ReturnType<typeof convertToDefaultUnit>) => (r.ok ? r.value : NaN);

  it("Total T4 µg/dL → nmol/L", () => {
    expect(val(convertToDefaultUnit(8, "µg/dL", bio("3026-2", "nmol/L")))).toBeCloseTo(103, 0);
  });
  it("Total T4 reverse nmol/L → µg/dL", () => {
    expect(val(convertToDefaultUnit(100, "nmol/L", bio("3026-2", "µg/dL")))).toBeCloseTo(7.77, 1);
  });
  it("Total T3 ng/dL → nmol/L", () => {
    expect(val(convertToDefaultUnit(120, "ng/dL", bio("3053-6", "nmol/L")))).toBeCloseTo(1.84, 1);
  });
  it("Free T3 pg/mL → pmol/L", () => {
    expect(val(convertToDefaultUnit(3.2, "pg/mL", bio("3051-0", "pmol/L")))).toBeCloseTo(4.92, 1);
  });
  it("Progesterone ng/mL → nmol/L", () => {
    expect(val(convertToDefaultUnit(5, "ng/mL", bio("2839-9", "nmol/L")))).toBeCloseTo(15.9, 1);
  });
  it("Free testosterone pg/mL → pmol/L", () => {
    expect(val(convertToDefaultUnit(15, "pg/mL", bio("2991-8", "pmol/L")))).toBeCloseTo(52.0, 0);
  });
  it("Ionized calcium mg/dL → mmol/L", () => {
    expect(val(convertToDefaultUnit(4.8, "mg/dL", bio("1995-0", "mmol/L")))).toBeCloseTo(1.2, 1);
  });

  it("BUN mg/dL → mmol/L uses the nitrogen basis, distinct from urea", () => {
    const bun = val(convertToDefaultUnit(20, "mg/dL", bio("3094-0", "mmol/L")));
    expect(bun).toBeCloseTo(7.14, 1);
    // The same printed value as urea must NOT yield the same mmol/L (different basis).
    const urea = val(convertToDefaultUnit(20, "mg/dL", bio("3091-6", "mmol/L")));
    expect(Math.abs(bun - urea)).toBeGreaterThan(1);
  });

  it("C-peptide nmol/L → ng/mL", () => {
    expect(val(convertToDefaultUnit(1, "nmol/L", bio("1986-9", "ng/mL")))).toBeCloseTo(3.02, 1);
  });
  it("PTH pmol/L → pg/mL", () => {
    expect(val(convertToDefaultUnit(5, "pmol/L", bio("2731-8", "pg/mL")))).toBeCloseTo(47.2, 0);
  });
  it("Vitamin A µg/dL → µmol/L", () => {
    expect(val(convertToDefaultUnit(50, "µg/dL", bio("2923-1", "µmol/L")))).toBeCloseTo(1.745, 2);
  });
  it("Vitamin E mg/L → µmol/L", () => {
    expect(val(convertToDefaultUnit(10, "mg/L", bio("1823-4", "µmol/L")))).toBeCloseTo(23.22, 1);
  });
  it("Vitamin C mg/dL → µmol/L", () => {
    expect(val(convertToDefaultUnit(1, "mg/dL", bio("1992-7", "µmol/L")))).toBeCloseTo(56.78, 1);
  });
  it("Copper µg/dL → µmol/L", () => {
    expect(val(convertToDefaultUnit(100, "µg/dL", bio("5631-7", "µmol/L")))).toBeCloseTo(15.74, 1);
  });
  it("Selenium µg/L and µg/dL → µmol/L agree", () => {
    expect(val(convertToDefaultUnit(100, "µg/L", bio("5697-8", "µmol/L")))).toBeCloseTo(1.266, 2);
    expect(val(convertToDefaultUnit(10, "µg/dL", bio("5697-8", "µmol/L")))).toBeCloseTo(1.266, 2);
  });
  it("Lead µmol/L → µg/dL", () => {
    expect(val(convertToDefaultUnit(1, "µmol/L", bio("5671-3", "µg/dL")))).toBeCloseTo(20.72, 1);
  });
  it("Mercury nmol/L → µg/L", () => {
    expect(val(convertToDefaultUnit(10, "nmol/L", bio("5683-8", "µg/L")))).toBeCloseTo(2.006, 2);
  });

  it("every phase-3 analyte round-trips (forward × reverse ≈ identity)", () => {
    const cases: [string, string, string, number][] = [
      ["3026-2", "µg/dL", "nmol/L", 8],
      ["3053-6", "ng/dL", "nmol/L", 120],
      ["3051-0", "pg/mL", "pmol/L", 3.2],
      ["2839-9", "ng/mL", "nmol/L", 5],
      ["2991-8", "pg/mL", "pmol/L", 15],
      ["1995-0", "mg/dL", "mmol/L", 4.8],
      ["3094-0", "mg/dL", "mmol/L", 20],
      ["1986-9", "ng/mL", "nmol/L", 2],
      ["2731-8", "pg/mL", "pmol/L", 30],
      ["2923-1", "µg/dL", "µmol/L", 50],
      ["1823-4", "mg/L", "µmol/L", 10],
      ["1992-7", "mg/dL", "µmol/L", 1.2],
      ["5631-7", "µg/dL", "µmol/L", 100],
      ["5697-8", "µg/L", "µmol/L", 100],
      ["5671-3", "µg/dL", "µmol/L", 5],
      ["5683-8", "µg/L", "nmol/L", 5],
    ];
    for (const [code, srcUnit, dstUnit, x] of cases) {
      const fwd = convertToDefaultUnit(x, srcUnit, bio(code, dstUnit));
      expect(fwd.ok).toBe(true);
      if (!fwd.ok) continue;
      const back = convertToDefaultUnit(fwd.value, dstUnit, bio(code, srcUnit));
      expect(back.ok && back.value).toBeCloseTo(x, 1);
    }
  });
});

describe("convertToDefaultUnit — generic (mass basis)", () => {
  it("mg/dL → g/L for a protein (no molar dependence)", () => {
    const r = convertToDefaultUnit(1200, "mg/dL", bio(null, "g/L"));
    expect(r.ok && r.value).toBeCloseTo(12.0, 5);
  });

  it("g/dL → g/L", () => {
    const r = convertToDefaultUnit(15, "g/dL", bio(null, "g/L"));
    expect(r.ok && r.value).toBeCloseTo(150, 5);
  });
});

describe("convertToDefaultUnit — unknown conversions are flagged, never guessed", () => {
  it("flags a unit pair with no known factor", () => {
    expect(convertToDefaultUnit(90, "IU/L", bio("1558-6", "mmol/L"))).toEqual({
      ok: false,
      reason: "unknown_conversion",
    });
  });

  it("refuses a molar conversion when the biomarker has no code", () => {
    // mg/dL → mmol/L depends on molar mass; without a code there is no factor.
    expect(convertToDefaultUnit(90, "mg/dL", bio(null, "mmol/L")).ok).toBe(false);
  });

  it("routes NaN/Infinity readings to manual review instead of asserting them", () => {
    expect(convertToDefaultUnit(NaN, "mmol/L", bio("1558-6", "mmol/L")).ok).toBe(false);
    expect(convertToDefaultUnit(Infinity, "mg/dL", bio("1558-6", "mmol/L")).ok).toBe(false);
  });
});

describe("resolveRange — most-specific demographic range wins", () => {
  const base: Pick<Biomarker, "refLow" | "refHigh" | "optimalLow" | "optimalHigh"> = {
    refLow: 0,
    refHigh: 100,
    optimalLow: null,
    optimalHigh: null,
  };
  const range = (r: Partial<DemographicRange>): DemographicRange => ({
    sex: null,
    ageMinYears: null,
    ageMaxYears: null,
    condition: null,
    refLow: null,
    refHigh: null,
    optimalLow: null,
    optimalHigh: null,
    ...r,
  });

  it("falls back to the biomarker's generic range when none provided", () => {
    expect(resolveRange(base, undefined, { sex: "male", ageYears: 30 })).toMatchObject({
      refLow: 0,
      refHigh: 100,
    });
  });

  it("picks the matching sex-specific range", () => {
    const ranges = [
      range({ sex: "male", refLow: 13, refHigh: 17 }),
      range({ sex: "female", refLow: 12, refHigh: 15 }),
    ];
    expect(resolveRange(base, ranges, { sex: "female", ageYears: 30 })).toMatchObject({
      refLow: 12,
      refHigh: 15,
    });
  });

  it("prefers a sex+age range over a sex-only range (specificity)", () => {
    const ranges = [
      range({ sex: "male", refLow: 13, refHigh: 17 }),
      range({ sex: "male", ageMinYears: 0, ageMaxYears: 5, refLow: 10, refHigh: 14 }),
    ];
    expect(resolveRange(base, ranges, { sex: "male", ageYears: 3 })).toMatchObject({
      refLow: 10,
      refHigh: 14,
    });
  });

  it("falls back to generic when no demographic row matches", () => {
    const ranges = [range({ sex: "female", refLow: 12, refHigh: 15 })];
    expect(resolveRange(base, ranges, { sex: "male", ageYears: 30 })).toMatchObject({
      refLow: 0,
      refHigh: 100,
    });
  });

  it("fills a null field on the chosen range from the generic range", () => {
    const withOptimal = { ...base, optimalLow: 40, optimalHigh: 60 };
    const ranges = [range({ sex: "male", refLow: 13, refHigh: 17 })];
    expect(resolveRange(withOptimal, ranges, { sex: "male", ageYears: 30 })).toMatchObject({
      refLow: 13,
      refHigh: 17,
      optimalLow: 40,
      optimalHigh: 60,
    });
  });
});

describe("computeFlag — out-of-range detection", () => {
  const ref = { refLow: 1, refHigh: 10 };

  it("returns no flag for an in-range value", () => {
    expect(computeFlag(5, ref)).toEqual({ outOfRange: false, flag: null });
  });

  it("flags low and high", () => {
    expect(computeFlag(0.5, ref).flag).toBe("low");
    expect(computeFlag(20, ref).flag).toBe("high");
  });

  it("never raises a critical without a policy", () => {
    expect(computeFlag(0.01, ref).flag).toBe("low");
  });

  it("guards non-finite values (no silent in-range)", () => {
    expect(computeFlag(NaN, ref)).toEqual({ outOfRange: false, flag: null });
    expect(computeFlag(Infinity, ref).flag).toBe(null);
  });
});

describe("computeFlag — clinically-aware critical policy", () => {
  it("escalates severe anemia (hemoglobin ≤ 70 g/L) to critical", () => {
    const hb = { code: "718-7", direction: "higher_better" as const };
    expect(computeFlag(60, { refLow: 130, refHigh: 170 }, hb).flag).toBe("critical");
    // Below range but above the panic cutoff stays a plain "low".
    expect(computeFlag(100, { refLow: 130, refHigh: 170 }, hb).flag).toBe("low");
  });

  it("escalates a glucose panic high via the absolute cutoff", () => {
    const glu = { code: "1558-6", direction: "range" as const };
    expect(computeFlag(30, { refLow: 3.9, refHigh: 5.5 }, glu).flag).toBe("critical");
  });

  it("never escalates a direction-less (range) marker without a code policy", () => {
    const marker = { code: null, direction: "range" as const };
    expect(computeFlag(0, { refLow: 1, refHigh: 10 }, marker).flag).toBe("low");
  });

  it("uses the multiplier on the bad side for direction-only markers", () => {
    const higher = { code: null, direction: "higher_better" as const };
    expect(computeFlag(0.4, { refLow: 1, refHigh: 10 }, higher).flag).toBe("critical");
    const lower = { code: null, direction: "lower_better" as const };
    expect(computeFlag(25, { refLow: 1, refHigh: 10 }, lower).flag).toBe("critical");
    // The safe side of a directional marker is never critical.
    expect(computeFlag(0.4, { refLow: 1, refHigh: 10 }, lower).flag).toBe("low");
  });
});

describe("ageYearsFrom", () => {
  const on = new Date("2026-06-21T00:00:00Z");

  it("computes whole years, accounting for birthday not yet reached", () => {
    expect(ageYearsFrom("1990-01-01", on)).toBe(36);
    expect(ageYearsFrom("1990-12-31", on)).toBe(35);
  });

  it("returns null for missing or unparseable input", () => {
    expect(ageYearsFrom(null, on)).toBe(null);
    expect(ageYearsFrom("not-a-date", on)).toBe(null);
  });
});

describe("body-measurement conversions", () => {
  it("kg ↔ lb round-trips", () => {
    expect(kgToLb(100)).toBeCloseTo(220.462, 2);
    expect(lbToKg(220.462)).toBeCloseTo(100, 3);
    expect(lbToKg(kgToLb(72.5))).toBeCloseTo(72.5, 6);
  });

  it("cm → ft/in", () => {
    expect(cmToFtIn(180)).toEqual({ ft: 5, inches: 11 });
    expect(cmToFtIn(182.88)).toEqual({ ft: 6, inches: 0 });
  });

  it("carries over when rounding pushes inches to 12", () => {
    expect(cmToFtIn(181.9)).toEqual({ ft: 6, inches: 0 });
  });

  it("ft/in → cm", () => {
    expect(ftInToCm(6, 0)).toBeCloseTo(182.88, 2);
    expect(ftInToCm(5, 11)).toBeCloseTo(180.34, 2);
  });
});

describe("unit catalog helpers", () => {
  it("allKnownUnits dedupes by normalized form and includes factor-table units", () => {
    const units = allKnownUnits(["mg/dL"]);
    expect(units).toContain("mg/dL");
    expect(units).toContain("mmol/L");
    // Sorted output, no duplicates.
    expect([...units].sort((a, b) => a.localeCompare(b))).toEqual(units);
    expect(new Set(units).size).toBe(units.length);
  });

  it("convertibleUnits lists the default plus everything that converts for the analyte", () => {
    const glucose = { code: "1558-6", defaultUnit: "mmol/L" };
    const out = convertibleUnits(glucose, ["mmol/L", "mg/dL", "IU/L"]);
    expect(out[0]).toBe("mmol/L");
    expect(out).toContain("mg/dL");
    expect(out).not.toContain("IU/L");
  });
});
