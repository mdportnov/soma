import { describe, it, expect } from "vitest";
import {
  computeResultFlag,
  convertToDefaultUnit,
  parseResultInput,
  splitComparator,
  unitsEquivalent,
} from "./units";
import { changeBetween, type ValuePoint } from "./insights";
import { formatResult } from "./utils";
import { readResultValue } from "@/ai/import/validate";

const range = { refLow: 1, refHigh: 5 };

describe("threshold results (<x, >x) keep their meaning", () => {
  it("never calls a below-threshold result high, even when the bound is above range", () => {
    expect(computeResultFlag(5.6, "<", range)).toEqual({ outOfRange: false, flag: null });
    // The exact value 5.6 *would* be high — the operator is what changes it.
    expect(computeResultFlag(5.6, null, range).flag).toBe("high");
  });

  it("flags a threshold only when even its bound is past the limit", () => {
    expect(computeResultFlag(0.5, "<", range)).toEqual({ outOfRange: true, flag: "low" });
    expect(computeResultFlag(1, "<", range)).toEqual({ outOfRange: true, flag: "low" });
    expect(computeResultFlag(1, "<=", range)).toEqual({ outOfRange: false, flag: null });
    expect(computeResultFlag(90, ">", range).flag).toBe("high");
    expect(computeResultFlag(3, ">", range)).toEqual({ outOfRange: false, flag: null });
  });

  it("does not compute a change from or to a threshold", () => {
    const point = (value: number, comparator: ValuePoint["comparator"]): ValuePoint => ({
      value,
      unit: "mmol/L",
      date: "2026-01-01",
      outOfRange: false,
      flag: null,
      comparator,
    });
    const bio = { ...range, optimalLow: null, optimalHigh: null, direction: "range" as const };
    expect(changeBetween(point(0.5, "<"), point(3, null), bio)).toBeNull();
    expect(changeBetween(point(2, null), point(3, null), bio)).not.toBeNull();
  });

  it("formats and parses the operator", () => {
    expect(formatResult(0.5, "<")).toBe("<0.5");
    expect(formatResult(90, ">=")).toBe("≥90");
    expect(parseResultInput("≥ 90")).toEqual({ value: 90, comparator: ">=" });
    expect(parseResultInput("<0,5")).toEqual({ value: 0.5, comparator: "<" });
    expect(parseResultInput("4.2")).toEqual({ value: 4.2, comparator: null });
    expect(parseResultInput("<")).toBeNull();
    expect(splitComparator("менее 5")).toEqual({ comparator: "<", rest: "5" });
  });
});

describe("readResultValue — the importer keeps the operator", () => {
  it("uses the comparator field", () => {
    expect(readResultValue({ value: 5.6, comparator: "<", value_text: "<5.6" })).toEqual({
      value: 5.6,
      comparator: "<",
      valueText: "<5.6",
    });
  });

  it("recovers the operator when the model left it inside the value or the text", () => {
    expect(readResultValue({ value: "<0,100" })).toMatchObject({ value: 0.1, comparator: "<" });
    expect(readResultValue({ value: 1, value_text: "< 1" })).toMatchObject({
      value: 1,
      comparator: "<",
    });
  });

  it("leaves an exact measurement exact", () => {
    expect(readResultValue({ value: 1.015, value_text: "1.015" })).toMatchObject({
      value: 1.015,
      comparator: null,
    });
  });
});

describe("units printed on urinalysis and eGFR rows", () => {
  it("accepts the field-of-view spellings as /hpf", () => {
    for (const u of ["/HPF", "cells/hpf", "в п/зр", "кл. в п.зр.", "в поле зрения"]) {
      expect(unitsEquivalent(u, "/hpf")).toBe(true);
    }
    expect(unitsEquivalent("/LPF", "/hpf")).toBe(false);
  });

  it("accepts eGFR body-surface spellings", () => {
    for (const u of ["мл/мин/1,73 м²", "mL/min/1.73 m^2", "мл/мин/1,73кв.м", "ml/min/1.73 sq m"]) {
      expect(unitsEquivalent(u, "mL/min/1.73m²")).toBe(true);
    }
  });

  it("accepts a blank or density unit for specific gravity", () => {
    expect(unitsEquivalent("", "SG")).toBe(true);
    expect(unitsEquivalent("г/мл", "SG")).toBe(true);
    expect(unitsEquivalent("-", "pH")).toBe(true);
    expect(unitsEquivalent("", "mg/dL")).toBe(false);
  });

  it("converts urine glucose and ketones reported in mmol/L", () => {
    const glucose = { code: "5792-7", defaultUnit: "mg/dL" };
    expect(convertToDefaultUnit(5.6, "ммоль/л", glucose)).toEqual({
      ok: true,
      value: 100.89,
      unit: "mg/dL",
    });
    const ketones = { code: "5797-6", defaultUnit: "mg/dL" };
    expect(convertToDefaultUnit(0.5, "mmol/L", ketones)).toMatchObject({ ok: true, value: 5.105 });
  });
});
