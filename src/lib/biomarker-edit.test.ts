import { describe, it, expect } from "vitest";
import { parseAliases, parseNumberOrNull, validateRanges } from "./biomarker-edit";

describe("parseAliases", () => {
  it("splits on commas and newlines, trimming each", () => {
    expect(parseAliases("glucose, blood sugar\nглюкоза")).toEqual([
      "glucose",
      "blood sugar",
      "глюкоза",
    ]);
  });

  it("drops empties and deduplicates case-insensitively (first spelling wins)", () => {
    expect(parseAliases("LDL, , ldl,\n\nLDL ")).toEqual(["LDL"]);
  });

  it("returns an empty array for blank input", () => {
    expect(parseAliases("  \n , ")).toEqual([]);
  });
});

describe("parseNumberOrNull", () => {
  it("parses finite numbers", () => {
    expect(parseNumberOrNull("3.9")).toBe(3.9);
    expect(parseNumberOrNull("  0 ")).toBe(0);
  });

  it("returns null for empty or non-numeric input", () => {
    expect(parseNumberOrNull("")).toBe(null);
    expect(parseNumberOrNull("   ")).toBe(null);
    expect(parseNumberOrNull("abc")).toBe(null);
  });
});

describe("validateRanges", () => {
  it("accepts ordered and open-ended ranges", () => {
    expect(validateRanges({ refLow: 1, refHigh: 10, optimalLow: 3, optimalHigh: 7 })).toEqual({
      ok: true,
    });
    expect(validateRanges({ refLow: null, refHigh: 10, optimalLow: 3, optimalHigh: null })).toEqual(
      {
        ok: true,
      },
    );
  });

  it("rejects an inverted reference range", () => {
    expect(validateRanges({ refLow: 10, refHigh: 1, optimalLow: null, optimalHigh: null })).toEqual(
      {
        ok: false,
        error: "ref",
      },
    );
  });

  it("rejects an inverted optimal range", () => {
    expect(validateRanges({ refLow: 1, refHigh: 10, optimalLow: 8, optimalHigh: 4 })).toEqual({
      ok: false,
      error: "optimal",
    });
  });
});
