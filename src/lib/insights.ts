import type { Biomarker } from "@/db/schema";
import { unitsEquivalent } from "@/lib/units";

/**
 * Change-analysis engine — the "what changed since last time" layer.
 *
 * Given two readings of the same biomarker (a previous and a current one,
 * both normalized to the biomarker's default unit), it classifies the move:
 * its size relative to the reference-range width, whether it crossed an
 * out-of-range boundary, and — direction-aware — whether the patient got
 * better or worse. Pure and deterministic: no DB, no clock, fully testable.
 */

export type Trajectory = "improved" | "worsened" | "neutral";

/** Surface priority: alert (boundary crossing) > watch (big move) > info. */
export type ChangeSeverity = "info" | "watch" | "alert";

/** Machine-readable reason codes; the UI maps them to localized sentences. */
export type ChangeReason =
  | "became_out_of_range"
  | "worsened_critical"
  | "back_in_range"
  | "large_move"
  | "moved_within_range";

export type ValuePoint = {
  /** Value in the biomarker's default unit (normalized). */
  value: number;
  unit: string;
  date: string;
  outOfRange: boolean;
  flag: "low" | "high" | "critical" | null;
};

export type BiomarkerChange = {
  /** current − previous, in default units. */
  absChange: number;
  /** Signed fraction (0.23 = +23%); null when the previous value is 0. */
  pctChange: number | null;
  /** |absChange| as a fraction of the reference-range width; null if no width. */
  rangeFraction: number | null;
  direction: "up" | "down" | "flat";
  trajectory: Trajectory;
  /** True when the change is worth showing as an insight. */
  notable: boolean;
  severity: ChangeSeverity;
  /** Most important reason first. */
  reasons: ChangeReason[];
};

type RangeBounds = Pick<
  Biomarker,
  "refLow" | "refHigh" | "optimalLow" | "optimalHigh" | "direction"
>;

const SEVERITY_RANK: Record<ChangeSeverity, number> = { info: 0, watch: 1, alert: 2 };

/** Below this relative move the two readings are treated as unchanged. */
const FLAT_PCT = 0.005;

function raise(current: ChangeSeverity, candidate: ChangeSeverity): ChangeSeverity {
  return SEVERITY_RANK[candidate] > SEVERITY_RANK[current] ? candidate : current;
}

/** How far a value sits outside [refLow, refHigh]; 0 when inside. */
function outsideDistance(value: number, refLow: number | null, refHigh: number | null): number {
  if (refLow != null && value < refLow) return refLow - value;
  if (refHigh != null && value > refHigh) return value - refHigh;
  return 0;
}

type MoveSize = "small" | "moderate" | "big";
const SIZE_RANK: Record<MoveSize, number> = { small: 0, moderate: 1, big: 2 };
const biggerOf = (a: MoveSize, b: MoveSize): MoveSize => (SIZE_RANK[b] > SIZE_RANK[a] ? b : a);

/**
 * Buckets the move size. When the reference-range width is known it is the
 * primary signal (clinical significance is relative to the interval), but an
 * extreme relative move — a halving or doubling — is promoted regardless, so a
 * big swing inside a wide range is never silently dropped. Without a width, the
 * percent change alone drives the bucket, with a more sensitive threshold.
 */
function moveSize(rangeFraction: number | null, pctChange: number | null): MoveSize {
  if (rangeFraction != null) {
    const byRange: MoveSize =
      rangeFraction >= 0.75 ? "big" : rangeFraction >= 0.4 ? "moderate" : "small";
    const a = pctChange != null ? Math.abs(pctChange) : 0;
    const byPct: MoveSize = a >= 1 ? "big" : a >= 0.5 ? "moderate" : "small";
    return biggerOf(byRange, byPct);
  }
  if (pctChange != null) {
    const a = Math.abs(pctChange);
    if (a >= 0.3) return "big";
    if (a >= 0.15) return "moderate";
  }
  return "small";
}

/**
 * Direction-aware verdict for two in-range readings. Uses the biomarker's
 * `direction` (and optimal band where relevant) to decide whether a move that
 * never left the reference range is still a good or bad sign.
 */
function inRangeTrajectory(prev: number, cur: number, bio: RangeBounds): Trajectory {
  if (cur === prev) return "neutral";
  if (bio.direction === "higher_better") return cur > prev ? "improved" : "worsened";
  if (bio.direction === "lower_better") return cur < prev ? "improved" : "worsened";
  // "range": only call it a move toward/away from the optimal band, if defined.
  const { optimalLow, optimalHigh } = bio;
  const dPrev = outsideDistance(prev, optimalLow, optimalHigh);
  const dCur = outsideDistance(cur, optimalLow, optimalHigh);
  if (dCur < dPrev) return "improved";
  if (dCur > dPrev) return "worsened";
  return "neutral";
}

/**
 * Classifies the change between two consecutive readings of one biomarker.
 * Both values must already be in the biomarker's default unit.
 */
export function analyzeChange(
  prev: ValuePoint,
  cur: ValuePoint,
  bio: RangeBounds,
): BiomarkerChange {
  const absChange = round(cur.value - prev.value);
  const pctChange = prev.value !== 0 ? (cur.value - prev.value) / Math.abs(prev.value) : null;
  const width =
    bio.refLow != null && bio.refHigh != null && bio.refHigh > bio.refLow
      ? bio.refHigh - bio.refLow
      : null;
  const rangeFraction = width != null ? Math.abs(cur.value - prev.value) / width : null;

  const direction: BiomarkerChange["direction"] =
    pctChange != null && Math.abs(pctChange) < FLAT_PCT
      ? "flat"
      : cur.value > prev.value
        ? "up"
        : cur.value < prev.value
          ? "down"
          : "flat";

  const reasons: ChangeReason[] = [];
  let severity: ChangeSeverity = "info";
  let notable = false;
  let trajectory: Trajectory;

  const newlyCritical = cur.flag === "critical" && prev.flag !== "critical";
  const newlyOut = cur.outOfRange && !prev.outOfRange;
  const backIn = !cur.outOfRange && prev.outOfRange;

  if (newlyCritical) {
    reasons.push("worsened_critical");
    severity = "alert";
    notable = true;
    trajectory = "worsened";
  } else if (newlyOut) {
    reasons.push("became_out_of_range");
    severity = "alert";
    notable = true;
    trajectory = "worsened";
  } else if (backIn) {
    reasons.push("back_in_range");
    notable = true;
    trajectory = "improved";
  } else {
    // Still on the same side of every boundary — trajectory needs the direction.
    const dPrev = outsideDistance(prev.value, bio.refLow, bio.refHigh);
    const dCur = outsideDistance(cur.value, bio.refLow, bio.refHigh);
    if (dCur < dPrev) trajectory = "improved";
    else if (dCur > dPrev) trajectory = "worsened";
    else trajectory = inRangeTrajectory(prev.value, cur.value, bio);
  }

  const size = moveSize(rangeFraction, pctChange);
  if (size === "big") {
    reasons.push(cur.outOfRange || prev.outOfRange ? "large_move" : "moved_within_range");
    severity = raise(severity, "watch");
    notable = true;
  } else if (size === "moderate") {
    reasons.push(cur.outOfRange || prev.outOfRange ? "large_move" : "moved_within_range");
    severity = raise(severity, "info");
    notable = true;
  }

  return { absChange, pctChange, rangeFraction, direction, trajectory, notable, severity, reasons };
}

/**
 * Builds a ValuePoint from a stored lab-result row, preferring the normalized
 * value/unit. Returns null when there is nothing comparable.
 */
export function pointFromResult(r: {
  value: number;
  unit: string;
  valueNormalized: number | null;
  unitNormalized: string | null;
  outOfRange: boolean;
  flag: "low" | "high" | "critical" | null;
  date: string;
}): ValuePoint {
  return {
    value: r.valueNormalized ?? r.value,
    unit: r.unitNormalized ?? r.unit,
    date: r.date,
    outOfRange: r.outOfRange,
    flag: r.flag,
  };
}

/**
 * Computes a change only when the two readings are on the same unit basis —
 * comparing across an unknown unit conversion would be meaningless.
 */
export function changeBetween(
  prev: ValuePoint,
  cur: ValuePoint,
  bio: RangeBounds,
): BiomarkerChange | null {
  if (!unitsEquivalent(prev.unit, cur.unit)) return null;
  return analyzeChange(prev, cur, bio);
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
