import { describe, it, expect } from "vitest";
import { resolveEnum, parseDose, type VocabEntry } from "./resolve";
import {
  IMAGING_MODALITY_VOCAB,
  ALLERGY_CATEGORY_VOCAB,
  ALLERGY_SEVERITY_VOCAB,
  MEDICATION_TYPE_VOCAB,
} from "./vocab";

describe("resolveEnum — controlled vocabulary (multilingual)", () => {
  it("resolves imaging modality across languages", () => {
    expect(resolveEnum("Рентген грудной клетки", IMAGING_MODALITY_VOCAB, "other").value).toBe(
      "xray",
    );
    expect(resolveEnum("Ecografía", IMAGING_MODALITY_VOCAB, "other").value).toBe("ultrasound");
    expect(resolveEnum("КТ", IMAGING_MODALITY_VOCAB, "other").value).toBe("ct");
  });

  it("resolves allergy category and severity", () => {
    expect(resolveEnum("Penicillin", ALLERGY_CATEGORY_VOCAB, "other").value).toBe("drug");
    expect(resolveEnum("anaphylaxis", ALLERGY_SEVERITY_VOCAB, "moderate").value).toBe(
      "anaphylactic",
    );
  });

  it("classifies medication type, defaulting drugs that aren't supplements", () => {
    expect(resolveEnum("Vitamin D", MEDICATION_TYPE_VOCAB, "drug").value).toBe("supplement");
    expect(resolveEnum("Ibuprofen", MEDICATION_TYPE_VOCAB, "drug").value).toBe("drug");
  });

  it("returns the fallback with 'fallback' confidence for empty/unknown input", () => {
    expect(resolveEnum(null, ALLERGY_SEVERITY_VOCAB, "moderate")).toEqual({
      value: "moderate",
      confidence: "fallback",
    });
    expect(resolveEnum("   ", ALLERGY_SEVERITY_VOCAB, "moderate").confidence).toBe("fallback");
    // Non-empty but unrecognized → still fallback, never a wrong enum.
    expect(resolveEnum("totally unknown modality", IMAGING_MODALITY_VOCAB, "other")).toEqual({
      value: "other",
      confidence: "fallback",
    });
  });

  it("matches a synonym embedded as a whole phrase inside a longer label", () => {
    // Token-containment pass: "CT scan of the chest" resolves on the "ct" synonym.
    expect(resolveEnum("CT scan of the chest", IMAGING_MODALITY_VOCAB, "other").value).toBe("ct");
  });

  it("tags exact, synonym and fuzzy matches with the right confidence", () => {
    const vocab: VocabEntry<"ct" | "mri">[] = [
      { value: "ct", synonyms: ["computed tomography", "кт"] },
      { value: "mri", synonyms: ["magnetic resonance imaging"] },
    ];
    expect(resolveEnum("ct", vocab, "ct").confidence).toBe("exact");
    expect(resolveEnum("Computed Tomography", vocab, "ct").confidence).toBe("synonym");
    // One-character typo against a synonym → fuzzy, not fallback.
    expect(resolveEnum("computed tomografy", vocab, "mri")).toMatchObject({
      value: "ct",
      confidence: "fuzzy",
    });
  });
});

describe("parseDose", () => {
  it("splits amount and unit", () => {
    expect(parseDose("500 mg")).toEqual({ amount: 500, unit: "mg" });
    expect(parseDose("1.5g")).toEqual({ amount: 1.5, unit: "g" });
  });

  it("keeps a non-Latin unit and a decimal comma", () => {
    expect(parseDose("2 таблетки")).toEqual({ amount: 2, unit: "таблетки" });
    expect(parseDose("0,5 мг")).toEqual({ amount: 0.5, unit: "мг" });
  });

  it("returns nulls for empty or unit-less input", () => {
    expect(parseDose(null)).toEqual({ amount: null, unit: null });
    expect(parseDose("250")).toEqual({ amount: 250, unit: null });
  });
});
