import { describe, expect, it } from "vitest";
import { pluralForm } from "./plural";

describe("pluralForm", () => {
  it("uses one/many only for English", () => {
    expect(pluralForm("en", 0)).toBe("many");
    expect(pluralForm("en", 1)).toBe("one");
    expect(pluralForm("en", 2)).toBe("many");
    expect(pluralForm("en", 21)).toBe("many");
  });

  it("applies Russian one/few/many rules", () => {
    expect(pluralForm("ru", 1)).toBe("one");
    expect(pluralForm("ru", 21)).toBe("one");
    expect(pluralForm("ru", 101)).toBe("one");
    expect(pluralForm("ru", 2)).toBe("few");
    expect(pluralForm("ru", 4)).toBe("few");
    expect(pluralForm("ru", 23)).toBe("few");
    expect(pluralForm("ru", 5)).toBe("many");
    expect(pluralForm("ru", 0)).toBe("many");
    expect(pluralForm("ru", 100)).toBe("many");
  });

  it("keeps the 11-14 exception on many", () => {
    for (const n of [11, 12, 13, 14, 111, 112, 113, 114]) {
      expect(pluralForm("ru", n)).toBe("many");
    }
  });

  it("normalises negative and fractional counts", () => {
    expect(pluralForm("ru", -1)).toBe("one");
    expect(pluralForm("ru", 2.7)).toBe("few");
  });
});
