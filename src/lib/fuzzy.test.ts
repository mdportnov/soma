import { describe, it, expect } from "vitest";
import { normalizeLabel, levenshtein, trigramSimilarity, similarity } from "./fuzzy";

describe("normalizeLabel", () => {
  it("lowercases, trims and collapses whitespace", () => {
    expect(normalizeLabel("  Total   Cholesterol  ")).toBe("total cholesterol");
  });

  it("strips punctuation and treats separators as spaces", () => {
    expect(normalizeLabel("HDL-Cholesterol (mg/dL)")).toBe("hdl cholesterol mg dl");
    expect(normalizeLabel("T3,free")).toBe("t3 free");
  });

  it("strips diacritics via NFKD so accented scans match the dictionary", () => {
    expect(normalizeLabel("Hémoglobine")).toBe("hemoglobine");
    expect(normalizeLabel("Ecografía")).toBe("ecografia");
  });
});

describe("levenshtein", () => {
  it("is zero for identical strings", () => {
    expect(levenshtein("glucose", "glucose")).toBe(0);
  });

  it("counts a single substitution", () => {
    expect(levenshtein("glucose", "glucoze")).toBe(1);
  });

  it("equals the other length when one string is empty", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
  });

  it("counts insertions and deletions", () => {
    expect(levenshtein("triglyceride", "triglycerides")).toBe(1);
  });
});

describe("trigramSimilarity", () => {
  it("is 1 for identical strings", () => {
    expect(trigramSimilarity("glucose", "glucose")).toBeCloseTo(1, 5);
  });

  it("is 0 when either side is empty", () => {
    expect(trigramSimilarity("", "glucose")).toBe(0);
    expect(trigramSimilarity("glucose", "")).toBe(0);
  });

  it("is between 0 and 1 for partial overlap", () => {
    const s = trigramSimilarity("cholesterol", "cholesterin");
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1);
  });
});

describe("similarity", () => {
  it("is 1 for an exact match", () => {
    expect(similarity("glucose", "glucose")).toBeCloseTo(1, 5);
  });

  it("rewards a one-character OCR typo highly", () => {
    expect(similarity("glucose", "glucoze")).toBeGreaterThan(0.8);
  });

  it("is robust to word reordering", () => {
    // Trigram overlap keeps reordered phrases close even when edit distance is large.
    expect(similarity("cholesterol ldl", "ldl cholesterol")).toBeGreaterThan(0.6);
  });

  it("scores unrelated strings low", () => {
    expect(similarity("glucose", "ferritin")).toBeLessThan(0.4);
  });
});
