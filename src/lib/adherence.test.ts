import { describe, it, expect } from "vitest";
import { adherenceStats, hasIntakeOn, type AdherenceEntry } from "./adherence";

const today = new Date("2026-06-21T12:00:00Z");
const day = (offset: number, taken = true): AdherenceEntry => {
  const d = new Date("2026-06-21T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + offset);
  return { takenAt: d.toISOString(), taken };
};

describe("adherenceStats — window percentage", () => {
  it("is 0 for an empty log", () => {
    expect(adherenceStats([], 30, today)).toMatchObject({
      takenDays: 0,
      adherencePct: 0,
      streak: 0,
    });
  });

  it("counts distinct adhered days within the trailing window", () => {
    const entries = [day(0), day(-1), day(-2), day(-40)]; // 3 in last 30, 1 outside
    const s = adherenceStats(entries, 30, today);
    expect(s.takenDays).toBe(3);
    expect(s.adherencePct).toBe(10); // 3/30
  });

  it("ignores skipped (taken=false) entries", () => {
    const s = adherenceStats([day(0, false), day(-1, false)], 30, today);
    expect(s.takenDays).toBe(0);
    expect(s.streak).toBe(0);
  });

  it("dedupes multiple entries on the same day", () => {
    const s = adherenceStats([day(0), day(0), day(0)], 30, today);
    expect(s.takenDays).toBe(1);
  });
});

describe("adherenceStats — streak", () => {
  it("counts consecutive days ending today", () => {
    expect(adherenceStats([day(0), day(-1), day(-2)], 30, today).streak).toBe(3);
  });

  it("grants a one-day grace when today is not yet logged", () => {
    expect(adherenceStats([day(-1), day(-2)], 30, today).streak).toBe(2);
  });

  it("breaks on a gap", () => {
    expect(adherenceStats([day(0), day(-1), day(-3)], 30, today).streak).toBe(2);
  });

  it("is 0 when neither today nor yesterday is logged", () => {
    expect(adherenceStats([day(-2), day(-3)], 30, today).streak).toBe(0);
  });
});

describe("hasIntakeOn", () => {
  it("detects an adhered entry for a given day", () => {
    expect(hasIntakeOn([day(0)], "2026-06-21")).toBe(true);
    expect(hasIntakeOn([day(0, false)], "2026-06-21")).toBe(false);
    expect(hasIntakeOn([day(-1)], "2026-06-21")).toBe(false);
  });
});
