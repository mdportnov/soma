import { describe, it, expect, beforeEach } from "vitest";
import { loadInterests, saveInterests, isRouteEnabled, SECTION_GROUPS } from "./interests";

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

describe("section interests", () => {
  it("defaults to all groups enabled when nothing is stored", () => {
    const enabled = loadInterests();
    for (const g of SECTION_GROUPS) expect(enabled.has(g)).toBe(true);
  });

  it("round-trips a saved selection", () => {
    saveInterests(new Set(["meds", "ai"] as const));
    const enabled = loadInterests();
    expect(enabled.has("meds")).toBe(true);
    expect(enabled.has("ai")).toBe(true);
    expect(enabled.has("vaccines")).toBe(false);
    expect(enabled.has("imaging")).toBe(false);
  });

  it("stores the complement so a future new group is visible by default", () => {
    // An install that only knew to hide 'meds'. Any group NOT in the stored
    // hidden list — including a hypothetical new one — must stay enabled.
    localStorage.setItem("soma.sections.hidden", JSON.stringify(["meds"]));
    const enabled = loadInterests();
    expect(enabled.has("meds")).toBe(false);
    expect(enabled.has("vaccines")).toBe(true);
    expect(enabled.has("ai")).toBe(true);
  });

  it("gates only mapped routes; core routes are always enabled", () => {
    const enabled = new Set(["meds"] as const); // only meds on
    expect(isRouteEnabled("/medications", enabled)).toBe(true);
    expect(isRouteEnabled("/vaccines", enabled)).toBe(false);
    expect(isRouteEnabled("/", enabled)).toBe(true);
    expect(isRouteEnabled("/labs", enabled)).toBe(true);
    expect(isRouteEnabled("/report", enabled)).toBe(true);
  });

  it("groups visits and diagnoses under one toggle", () => {
    saveInterests(new Set(SECTION_GROUPS.filter((g) => g !== "conditions")));
    const enabled = loadInterests();
    expect(isRouteEnabled("/visits", enabled)).toBe(false);
    expect(isRouteEnabled("/diagnoses", enabled)).toBe(false);
  });

  it("falls back to all-enabled on corrupt JSON", () => {
    localStorage.setItem("soma.sections.hidden", "{not json");
    const enabled = loadInterests();
    for (const g of SECTION_GROUPS) expect(enabled.has(g)).toBe(true);
  });

  it("ignores unknown ids in the stored hidden list", () => {
    localStorage.setItem("soma.sections.hidden", JSON.stringify(["bogus", "meds"]));
    const enabled = loadInterests();
    expect(enabled.has("meds")).toBe(false);
    expect(enabled.has("ai")).toBe(true);
  });

  it("does not throw when storage is unavailable", () => {
    delete (globalThis as unknown as { localStorage?: Storage }).localStorage;
    expect(() => saveInterests(new Set(["ai"] as const))).not.toThrow();
    expect(loadInterests().size).toBeGreaterThan(0); // returns defaults
  });
});
