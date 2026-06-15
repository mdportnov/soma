/**
 * Blood-pressure staging (ACC/AHA cutoffs), in one place so every view — the
 * journal badges, the timeline lane, any future widget — classifies a reading
 * identically. Previously the timeline and journal each hard-coded their own
 * thresholds and could drift.
 */

export type BpStage = "normal" | "stage1" | "stage2" | "crisis";

export function bpStage(systolic: number, diastolic: number): BpStage {
  if (systolic > 180 || diastolic > 120) return "crisis";
  if (systolic >= 140 || diastolic >= 90) return "stage2";
  if (systolic >= 130 || diastolic >= 80) return "stage1";
  return "normal";
}

export function isCrisis(systolic: number, diastolic: number): boolean {
  return bpStage(systolic, diastolic) === "crisis";
}

/** True for stage-2 hypertension and the crisis range above it. */
export function isStage2(systolic: number, diastolic: number): boolean {
  const s = bpStage(systolic, diastolic);
  return s === "stage2" || s === "crisis";
}

/** Color for a reading on the timeline / charts, keyed by its stage. */
export function bpStageColor(systolic: number, diastolic: number): string {
  switch (bpStage(systolic, diastolic)) {
    case "crisis":
      return "#dc2626";
    case "stage2":
      return "#d97706";
    case "stage1":
      return "#eab308";
    default:
      return "#0d9488";
  }
}
