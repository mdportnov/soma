import { describe, it, expect, beforeEach } from "vitest";
import { getInterpretation, interpretationKey, setInterpretation } from "./interpretation-cache";

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? (this.m.get(k) ?? null) : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  get length() {
    return this.m.size;
  }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage =
    new MemStorage() as unknown as Storage;
});

const base = {
  name: "LDL cholesterol",
  direction: "lower" as string | null,
  referenceRange: "0–3 mmol/L",
  optimalRange: null,
  points: [
    { date: "2026-01-01", value: 3.2 },
    { date: "2026-04-01", value: 2.4 },
  ],
  medications: ["Rosuvastatin"],
};

describe("interpretationKey", () => {
  it("is stable for identical inputs", () => {
    expect(interpretationKey(base)).toBe(interpretationKey({ ...base }));
  });

  it("is order-insensitive for medications but sensitive to point values", () => {
    expect(interpretationKey({ ...base, medications: ["Rosuvastatin"] })).toBe(
      interpretationKey({ ...base, medications: ["Rosuvastatin"] }),
    );
    const changed = interpretationKey({
      ...base,
      points: [
        { date: "2026-01-01", value: 3.2 },
        { date: "2026-04-01", value: 2.9 },
      ],
    });
    expect(changed).not.toBe(interpretationKey(base));
  });
});

describe("interpretation cache", () => {
  it("round-trips a stored interpretation", () => {
    const key = interpretationKey(base);
    expect(getInterpretation(key)).toBeNull();
    setInterpretation(key, "Your LDL is trending down.");
    expect(getInterpretation(key)).toBe("Your LDL is trending down.");
  });
});
