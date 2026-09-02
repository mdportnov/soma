import { describe, it, expect } from "vitest";
import {
  assertAllergyDeletable,
  assertPrescriptionDeletable,
  ANAPHYLACTIC_DELETE_MESSAGE,
  PRESCRIPTION_HAS_MEDICATIONS_MESSAGE,
} from "./guards";

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

describe("assertPrescriptionDeletable", () => {
  it("blocks deleting a prescription that still has medications", () => {
    expect(() => assertPrescriptionDeletable(2, false)).toThrow(
      PRESCRIPTION_HAS_MEDICATIONS_MESSAGE,
    );
  });

  it("names the number of medications at risk so the prompt can say so", () => {
    expect(() => assertPrescriptionDeletable(3, false)).toThrow("(3)");
  });

  it("allows the delete once the caller explicitly chose to detach them", () => {
    expect(() => assertPrescriptionDeletable(2, true)).not.toThrow();
  });

  it("is a no-op when nothing is linked", () => {
    expect(() => assertPrescriptionDeletable(0, false)).not.toThrow();
  });
});
