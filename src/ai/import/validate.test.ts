import { describe, it, expect } from "vitest";
import {
  nullableStr,
  boundedStr,
  isoDateOrNull,
  boolOrNull,
  intOrNull,
  parseLocaleNumber,
  numberOrNull,
  asArray,
  asObject,
  expectObject,
  expectArray,
} from "./validate";
import { AIProviderError } from "../types";

describe("string coercion", () => {
  it("nullableStr trims, bounds and empties to null", () => {
    expect(nullableStr("  hi  ")).toBe("hi");
    expect(nullableStr("   ")).toBe(null);
    expect(nullableStr(42)).toBe(null);
    expect(nullableStr("abcdef", 3)).toBe("abc");
  });

  it("boundedStr never returns null", () => {
    expect(boundedStr(123)).toBe("");
    expect(boundedStr("  x ")).toBe("x");
  });
});

describe("date / boolean / int coercion", () => {
  it("accepts only well-formed ISO dates", () => {
    expect(isoDateOrNull("2024-03-15")).toBe("2024-03-15");
    expect(isoDateOrNull("15/03/2024")).toBe(null);
    expect(isoDateOrNull("2024-3-5")).toBe(null);
  });

  it("boolOrNull never coerces a non-boolean to false", () => {
    expect(boolOrNull(true)).toBe(true);
    expect(boolOrNull("true")).toBe(null);
    expect(boolOrNull(0)).toBe(null);
  });

  it("intOrNull truncates finite numbers only", () => {
    expect(intOrNull(3.9)).toBe(3);
    expect(intOrNull(NaN)).toBe(null);
    expect(intOrNull("5")).toBe(null);
  });
});

describe("parseLocaleNumber — locale-tolerant, no silent 1000× errors", () => {
  it("reads a European decimal comma with thousands dots", () => {
    expect(parseLocaleNumber("1.234,56")).toBeCloseTo(1234.56, 2);
  });

  it("reads a plain decimal comma", () => {
    expect(parseLocaleNumber("12,5")).toBeCloseTo(12.5, 5);
  });

  it("strips spaces and apostrophe groupers", () => {
    expect(parseLocaleNumber("1 234")).toBeCloseTo(1234, 5);
    expect(parseLocaleNumber("1'234")).toBeCloseTo(1234, 5);
  });

  it("reads an English thousands comma", () => {
    expect(parseLocaleNumber("1,234,567.0")).toBeCloseTo(1234567, 5);
  });
});

describe("numberOrNull", () => {
  it("passes finite numbers, rejects NaN", () => {
    expect(numberOrNull(3.14)).toBe(3.14);
    expect(numberOrNull(NaN)).toBe(null);
  });

  it("parses locale strings and rejects non-numeric text", () => {
    expect(numberOrNull("12,5")).toBeCloseTo(12.5, 5);
    expect(numberOrNull("abc")).toBe(null);
    expect(numberOrNull(null)).toBe(null);
  });
});

describe("shape guards", () => {
  it("asArray / asObject never throw on the wrong shape", () => {
    expect(asArray([1, 2])).toEqual([1, 2]);
    expect(asArray("x")).toEqual([]);
    expect(asObject({ a: 1 })).toEqual({ a: 1 });
    expect(asObject([1])).toBe(null);
    expect(asObject(null)).toBe(null);
  });

  it("expectObject / expectArray raise a bad_response AIProviderError otherwise", () => {
    expect(expectObject({ a: 1 }, "lab")).toEqual({ a: 1 });
    expect(expectArray([1], "lab")).toEqual([1]);
    try {
      expectObject([1], "lab");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(AIProviderError);
      expect((e as AIProviderError).kind).toBe("bad_response");
    }
    expect(() => expectArray({}, "lab")).toThrow(AIProviderError);
  });
});
