/**
 * Pure summary math over `lifestyle_log` rows.
 *
 * Kept free of any DB/React import so it is unit-testable directly. Rows are
 * filtered to a trailing calendar-day window, then each metric averages only the
 * days where it is present (nulls are ignored, never counted as 0). A metric with
 * no data in the window is `null`, so the UI can render a clean "—" instead of a
 * misleading zero. Dates may be a full ISO timestamp or a bare `YYYY-MM-DD` —
 * only the date portion is used.
 */
import type { LifestyleLog } from "@/db/schema";

export type LifestyleSummary = {
  /** Count of entries falling inside the window. */
  days: number;
  windowDays: number;
  avgSleepHours: number | null;
  avgSleepQuality: number | null;
  trainingMinutesTotal: number;
  /** Days with trainingMinutes > 0. */
  trainingDays: number;
  avgStress: number | null;
  avgEnergy: number | null;
  avgRestingHr: number | null;
  avgSteps: number | null;
};

/** Average of the defined values only; null when none are present. */
function average(values: (number | null | undefined)[], digits: number): number | null {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return null;
  const mean = nums.reduce((sum, v) => sum + v, 0) / nums.length;
  const factor = 10 ** digits;
  return Math.round(mean * factor) / factor;
}

export function summarizeLifestyle(
  rows: LifestyleLog[],
  windowDays = 30,
  today: Date = new Date(),
): LifestyleSummary {
  const todayDay = today.toISOString().slice(0, 10);
  const cutoff = new Date(`${todayDay}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - (windowDays - 1));
  const since = cutoff.toISOString().slice(0, 10);

  const inWindow = rows.filter((r) => {
    const day = r.date.slice(0, 10);
    return day >= since && day <= todayDay;
  });

  return {
    days: inWindow.length,
    windowDays,
    avgSleepHours: average(
      inWindow.map((r) => r.sleepHours),
      1,
    ),
    avgSleepQuality: average(
      inWindow.map((r) => r.sleepQuality),
      1,
    ),
    trainingMinutesTotal: inWindow.reduce((sum, r) => sum + (r.trainingMinutes ?? 0), 0),
    trainingDays: inWindow.filter((r) => (r.trainingMinutes ?? 0) > 0).length,
    avgStress: average(
      inWindow.map((r) => r.stressLevel),
      1,
    ),
    avgEnergy: average(
      inWindow.map((r) => r.energyLevel),
      1,
    ),
    avgRestingHr: average(
      inWindow.map((r) => r.restingHeartRate),
      0,
    ),
    avgSteps: average(
      inWindow.map((r) => r.steps),
      0,
    ),
  };
}
