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
});
