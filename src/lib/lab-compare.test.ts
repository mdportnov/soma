import { describe, it, expect } from "vitest";
import { buildComparison, displayValue, type CompareResult } from "./lab-compare";

function mk(
  biomarkerId: number,
  opts: {
    name: string;
    value: number;
    category?: string;
    unit?: string;
    valueNormalized?: number | null;
    unitNormalized?: string | null;
    outOfRange?: boolean;
    flag?: "low" | "high" | "critical" | null;
    direction?: "higher_better" | "lower_better" | "range";
    refLow?: number | null;
    refHigh?: number | null;
  },
): CompareResult {
  return {
    biomarkerId,
    value: opts.value,
    unit: opts.unit ?? "mmol/L",
    valueNormalized: opts.valueNormalized ?? null,
    unitNormalized: opts.unitNormalized ?? null,
    outOfRange: opts.outOfRange ?? false,
    flag: opts.flag ?? null,
    biomarker: {
      canonicalName: opts.name,
      category: opts.category ?? "Chemistry",
      defaultUnit: "mmol/L",
      refLow: opts.refLow ?? 3,
      refHigh: opts.refHigh ?? 6,
      optimalLow: null,
      optimalHigh: null,
      direction: opts.direction ?? "range",
    },
  };
}

describe("buildComparison", () => {
  it("pairs a biomarker present in both panels and computes the A→B change", () => {
    const a = [mk(1, { name: "Glucose", value: 5 })];
    const b = [mk(1, { name: "Glucose", value: 7, outOfRange: true, flag: "high" })];
    const [row] = buildComparison(a, "2026-01-01", b, "2026-03-01");
    expect(row.biomarkerId).toBe(1);
    expect(row.a?.value).toBe(5);
    expect(row.b?.value).toBe(7);
    expect(row.change).not.toBeNull();
    expect(row.change?.direction).toBe("up");
    expect(row.change?.reasons).toContain("became_out_of_range");
  });

  it("keeps markers present in only one panel, with no change", () => {
    const a = [mk(1, { name: "Glucose", value: 5 }), mk(2, { name: "Iron", value: 18 })];
    const b = [mk(1, { name: "Glucose", value: 5 })];
    const rows = buildComparison(a, "2026-01-01", b, "2026-03-01");
    const iron = rows.find((r) => r.biomarkerId === 2)!;
    expect(iron.a).not.toBeNull();
    expect(iron.b).toBeNull();
    expect(iron.change).toBeNull();
  });

  it("includes a marker that appears only in panel B", () => {
    const a = [mk(1, { name: "Glucose", value: 5 })];
    const b = [mk(1, { name: "Glucose", value: 5 }), mk(3, { name: "TSH", value: 2 })];
    const tsh = buildComparison(a, "2026-01-01", b, "2026-03-01").find((r) => r.biomarkerId === 3)!;
    expect(tsh.a).toBeNull();
    expect(tsh.b).not.toBeNull();
    expect(tsh.change).toBeNull();
  });

  it("does not compute a change across incomparable units", () => {
    const a = [mk(1, { name: "Glucose", value: 90, unit: "mg/dL" })];
    const b = [mk(1, { name: "Glucose", value: 5, unit: "mmol/L" })];
    const [row] = buildComparison(a, "2026-01-01", b, "2026-03-01");
    expect(row.a).not.toBeNull();
    expect(row.b).not.toBeNull();
    expect(row.change).toBeNull();
  });

  it("sorts rows by category then biomarker name", () => {
    const a = [
      mk(1, { name: "LDL cholesterol", value: 3, category: "Lipids" }),
      mk(2, { name: "Hemoglobin", value: 150, category: "CBC" }),
      mk(3, { name: "HDL cholesterol", value: 1.5, category: "Lipids" }),
    ];
    const rows = buildComparison(a, "2026-01-01", [], "2026-03-01");
    expect(rows.map((r) => r.biomarker.canonicalName)).toEqual([
      "Hemoglobin",
      "HDL cholesterol",
      "LDL cholesterol",
    ]);
  });
});

describe("displayValue", () => {
  it("prefers the normalized value/unit when present", () => {
    expect(
      displayValue({
        value: 90,
        unit: "mg/dL",
        valueNormalized: 5,
        unitNormalized: "mmol/L",
        outOfRange: false,
        flag: null,
      }),
    ).toEqual({ value: 5, unit: "mmol/L" });
  });

  it("falls back to the raw value/unit", () => {
    expect(
      displayValue({
        value: 7,
        unit: "mmol/L",
        valueNormalized: null,
        unitNormalized: null,
        outOfRange: false,
        flag: null,
      }),
    ).toEqual({ value: 7, unit: "mmol/L" });
  });
});
