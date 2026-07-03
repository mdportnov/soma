import { describe, it, expect } from "vitest";
import { extractJson } from "./prompts";

describe("extractJson — salvage imperfect model output", () => {
  it("parses clean JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips markdown fences and surrounding prose", () => {
    expect(extractJson('Here you go:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("tolerates a trailing comma (a common LLM artifact)", () => {
    expect(extractJson('[{"a":1},]')).toEqual([{ a: 1 }]);
  });

  it("extracts the first balanced object embedded in noise", () => {
    expect(extractJson('blah {"a":{"b":2}} trailing')).toEqual({ a: { b: 2 } });
  });

  it("throws when there is no JSON to find", () => {
    expect(() => extractJson("no json here")).toThrow();
  });

  it("salvages complete elements from a truncated array (hit the token cap)", () => {
    // Third object is cut off mid-way with no closing `]`.
    const truncated =
      '[{"analyte":"HGB","value":14},{"analyte":"WBC","value":6.1},{"analyte":"PLT","va';
    expect(extractJson(truncated)).toEqual([
      { analyte: "HGB", value: 14 },
      { analyte: "WBC", value: 6.1 },
    ]);
  });

  it("salvages a truncated array whose elements contain nested objects", () => {
    const truncated = '[{"a":{"b":1}},{"a":{"b":2}},{"a":{"b":';
    expect(extractJson(truncated)).toEqual([{ a: { b: 1 } }, { a: { b: 2 } }]);
  });

  it("still throws when not even one array element is complete", () => {
    expect(() => extractJson('[{"analyte":"HGB","value')).toThrow();
  });
});
