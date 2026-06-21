import { describe, it, expect } from "vitest";
import { assertAllergyDeletable, ANAPHYLACTIC_DELETE_MESSAGE } from "./guards";

describe("assertAllergyDeletable", () => {
  it("blocks deleting an anaphylactic allergy", () => {
    expect(() => assertAllergyDeletable("anaphylactic")).toThrow(ANAPHYLACTIC_DELETE_MESSAGE);
  });

  it("allows deleting non-anaphylactic severities", () => {
    for (const severity of ["mild", "moderate", "severe"]) {
      expect(() => assertAllergyDeletable(severity)).not.toThrow();
    }
  });

  it("is a no-op for a missing row (null/undefined severity)", () => {
    expect(() => assertAllergyDeletable(null)).not.toThrow();
    expect(() => assertAllergyDeletable(undefined)).not.toThrow();
  });
});
