import { describe, it, expect } from "vitest";
import { pointDelta, sparklineLayout } from "./sparkline";

const pts = (...values: number[]) =>
  values.map((value, i) => ({ date: `2026-01-0${i + 1}`, value }));

describe("sparklineLayout", () => {
  it("returns nothing for an empty series", () => {
    expect(sparklineLayout([])).toEqual({ coords: [], line: "", band: null });
  });

  it("centers a single reading and draws no line", () => {
    const l = sparklineLayout(pts(5));
    expect(l.coords).toHaveLength(1);
    expect(l.coords[0]!.x).toBe(50);
    expect(l.line).toBe("");
  });

  it("spreads readings left to right and maps higher values upward", () => {
    const l = sparklineLayout(pts(1, 3, 2));
    const [a, b, c] = l.coords;
    expect(a!.x).toBeLessThan(b!.x);
    expect(b!.x).toBeLessThan(c!.x);
    expect(b!.y).toBeLessThan(a!.y);
    expect(c!.y).toBeLessThan(a!.y);
    expect(l.line.split(" ")).toHaveLength(3);
  });

  it("keeps a flat series inside the box instead of dividing by zero", () => {
    const l = sparklineLayout(pts(4, 4, 4));
    for (const c of l.coords) {
      expect(Number.isFinite(c.y)).toBe(true);
      expect(c.y).toBeGreaterThan(0);
      expect(c.y).toBeLessThan(100);
    }
  });

  it("extends the value domain to include the optimal band and reports it top-down", () => {
    const l = sparklineLayout(pts(10, 12), { optimalLow: 0, optimalHigh: 5 });
    expect(l.band).not.toBeNull();
    expect(l.band!.y1).toBeLessThan(l.band!.y2);
    // Band top (optimalHigh=5) sits below every reading (10, 12).
    for (const c of l.coords) expect(c.y).toBeLessThan(l.band!.y1);
  });

  it("omits the band when a bound is missing", () => {
    expect(sparklineLayout(pts(1, 2), { optimalLow: 1 }).band).toBeNull();
  });
});

describe("pointDelta", () => {
  it("is null for the first point and out-of-range indexes", () => {
    expect(pointDelta(pts(1, 2), 0)).toBeNull();
    expect(pointDelta(pts(1, 2), 2)).toBeNull();
  });
  it("reports signed absolute and relative change", () => {
    expect(pointDelta(pts(4, 3), 1)).toEqual({ abs: -1, rel: -0.25 });
    expect(pointDelta(pts(-2, -1), 1)).toEqual({ abs: 1, rel: 0.5 });
  });
  it("has no relative change from zero", () => {
    expect(pointDelta(pts(0, 3), 1)).toEqual({ abs: 3, rel: null });
  });
});
