import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_BIOMARKER_LIST_PREFS,
  isDefaultBiomarkerListPrefs,
  loadBiomarkerListPrefs,
  saveBiomarkerListPrefs,
} from "./biomarker-list-prefs";

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
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

describe("biomarker list prefs", () => {
  it("defaults to attention sort, no status and no category filter", () => {
    expect(loadBiomarkerListPrefs()).toEqual(DEFAULT_BIOMARKER_LIST_PREFS);
    expect(isDefaultBiomarkerListPrefs(loadBiomarkerListPrefs())).toBe(true);
  });

  it("round-trips a saved selection", () => {
    saveBiomarkerListPrefs({ sort: "stale", status: "out_of_range", category: "Lipids" });
    expect(loadBiomarkerListPrefs()).toEqual({
      sort: "stale",
      status: "out_of_range",
      category: "Lipids",
    });
  });

  it("falls back field by field on unknown or malformed values", () => {
    localStorage.setItem(
      "soma.biomarkers.list",
      JSON.stringify({ sort: "by_mood", status: "optimal", category: "" }),
    );
    expect(loadBiomarkerListPrefs()).toEqual({
      sort: "attention",
      status: "optimal",
      category: null,
    });

    localStorage.setItem("soma.biomarkers.list", "not json");
    expect(loadBiomarkerListPrefs()).toEqual(DEFAULT_BIOMARKER_LIST_PREFS);

    localStorage.setItem("soma.biomarkers.list", JSON.stringify(42));
    expect(loadBiomarkerListPrefs()).toEqual(DEFAULT_BIOMARKER_LIST_PREFS);
  });

  it("survives a storage that throws", () => {
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem() {
        throw new Error("denied");
      },
      setItem() {
        throw new Error("denied");
      },
    } as unknown as Storage;
    expect(() =>
      saveBiomarkerListPrefs({ sort: "name", status: "all", category: null }),
    ).not.toThrow();
    expect(loadBiomarkerListPrefs()).toEqual(DEFAULT_BIOMARKER_LIST_PREFS);
  });
});
