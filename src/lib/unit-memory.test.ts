import { describe, it, expect, beforeEach } from "vitest";
import { rememberUnit, recallUnit, clearUnitMemory } from "./unit-memory";

/** Minimal in-memory Storage stand-in (vitest's node env has no localStorage). */
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.has(k) ? (this.m.get(k) ?? null) : null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  clear(): void {
    this.m.clear();
  }
  key(i: number): string | null {
    return [...this.m.keys()][i] ?? null;
  }
  get length(): number {
    return this.m.size;
  }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage =
    new MemStorage() as unknown as Storage;
});

describe("unit memory", () => {
  it("remembers and recalls a unit per lab + biomarker", () => {
    rememberUnit("Invitro", 42, "mg/dL");
    expect(recallUnit("Invitro", 42)).toBe("mg/dL");
  });

  it("is scoped per lab and per biomarker", () => {
    rememberUnit("Invitro", 42, "mg/dL");
    expect(recallUnit("Helix", 42)).toBeNull();
    expect(recallUnit("Invitro", 99)).toBeNull();
  });

  it("normalizes the lab name (case / spacing / punctuation insensitive)", () => {
    rememberUnit("  INVITRO-Lab  ", 42, "mmol/L");
    expect(recallUnit("invitro lab", 42)).toBe("mmol/L");
  });

  it("overwrites with the latest confirmed choice", () => {
    rememberUnit("Lab", 1, "mg/dL");
    rememberUnit("Lab", 1, "mmol/L");
    expect(recallUnit("Lab", 1)).toBe("mmol/L");
  });

  it("ignores blank units and unknown lookups", () => {
    rememberUnit("Lab", 1, "   ");
    expect(recallUnit("Lab", 1)).toBeNull();
    expect(recallUnit(null, 2)).toBeNull();
  });

  it("shares an unknown-lab bucket for null/empty lab names", () => {
    rememberUnit(null, 7, "ng/mL");
    expect(recallUnit("", 7)).toBe("ng/mL");
  });

  it("clearUnitMemory wipes everything", () => {
    rememberUnit("Lab", 1, "mg/dL");
    clearUnitMemory();
    expect(recallUnit("Lab", 1)).toBeNull();
  });

  it("is a no-op (never throws) when storage is unavailable", () => {
    delete (globalThis as unknown as { localStorage?: Storage }).localStorage;
    expect(() => rememberUnit("Lab", 1, "mg/dL")).not.toThrow();
    expect(recallUnit("Lab", 1)).toBeNull();
    expect(() => clearUnitMemory()).not.toThrow();
  });

  it("tolerates corrupt stored JSON", () => {
    localStorage.setItem("soma.unitMemory", "{not json");
    expect(recallUnit("Lab", 1)).toBeNull();
    rememberUnit("Lab", 1, "mg/dL");
    expect(recallUnit("Lab", 1)).toBe("mg/dL");
  });
});
