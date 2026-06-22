import { describe, it, expect } from "vitest";
import { summarizeLifestyle } from "./lifestyle";
import type { LifestyleLog } from "@/db/schema";

const today = new Date("2026-06-21T12:00:00Z");

/** Build a lifestyle row `offset` days before `today`, with the given fields. */
function row(offset: number, fields: Partial<LifestyleLog> = {}): LifestyleLog {
  const d = new Date("2026-06-21T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + offset);
  return {
    id: Math.abs(offset) + 1,
    profileId: 1,
    date: d.toISOString().slice(0, 10),
    sleepHours: null,
    sleepQuality: null,
    trainingMinutes: null,
    trainingIntensity: null,
    steps: null,
    restingHeartRate: null,
    stressLevel: null,
    energyLevel: null,
    notes: null,
    source: "manual",
    createdAt: d.toISOString(),
    ...fields,
  };
}

describe("summarizeLifestyle — averages ignoring nulls", () => {
  it("averages only the days where a metric is present", () => {
    const rows = [
      row(0, { sleepHours: 8, sleepQuality: 4 }),
      row(-1, { sleepHours: 6 }), // no sleepQuality
      row(-2, { sleepQuality: 2 }), // no sleepHours
    ];
    const s = summarizeLifestyle(rows, 30, today);
    expect(s.avgSleepHours).toBe(7); // (8 + 6) / 2
    expect(s.avgSleepQuality).toBe(3); // (4 + 2) / 2
  });

  it("rounds sleep/quality/stress/energy to 1 decimal, steps/restingHr to integer", () => {
    const rows = [
      row(0, { sleepHours: 7, stressLevel: 2, energyLevel: 5, steps: 10001, restingHeartRate: 60 }),
      row(-1, {
        sleepHours: 8,
        stressLevel: 3,
        energyLevel: 4,
        steps: 10000,
        restingHeartRate: 61,
      }),
    ];
    const s = summarizeLifestyle(rows, 30, today);
    expect(s.avgSleepHours).toBe(7.5);
    expect(s.avgStress).toBe(2.5);
    expect(s.avgEnergy).toBe(4.5);
    expect(s.avgSteps).toBe(10001); // 10000.5 → integer
    expect(s.avgRestingHr).toBe(61); // 60.5 → integer
  });
});

describe("summarizeLifestyle — window filter", () => {
  it("excludes rows outside the trailing window", () => {
    const rows = [
      row(0, { sleepHours: 8 }),
      row(-29, { sleepHours: 6 }), // last day still inside a 30-day window
      row(-40, { sleepHours: 2 }), // out of window — ignored
    ];
    const s = summarizeLifestyle(rows, 30, today);
    expect(s.days).toBe(2);
    expect(s.avgSleepHours).toBe(7); // (8 + 6) / 2, the -40 row dropped
  });
});

describe("summarizeLifestyle — training", () => {
  it("totals minutes and counts only days with training > 0", () => {
    const rows = [
      row(0, { trainingMinutes: 45 }),
      row(-1, { trainingMinutes: 0 }), // logged zero → not a training day
      row(-2, { trainingMinutes: 30 }),
      row(-3, {}), // null → not a training day
    ];
    const s = summarizeLifestyle(rows, 30, today);
    expect(s.trainingMinutesTotal).toBe(75);
    expect(s.trainingDays).toBe(2);
  });
});

describe("summarizeLifestyle — empty", () => {
  it("returns nulls and zeros when there is no data", () => {
    const s = summarizeLifestyle([], 30, today);
    expect(s).toEqual({
      days: 0,
      windowDays: 30,
      avgSleepHours: null,
      avgSleepQuality: null,
      trainingMinutesTotal: 0,
      trainingDays: 0,
      avgStress: null,
      avgEnergy: null,
      avgRestingHr: null,
      avgSteps: null,
    });
  });
});
