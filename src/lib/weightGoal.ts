import type { Profile } from "@/db/schema";

/**
 * A weight goal is a fixed glide path: a straight line from a start anchor
 * (date + weight) to a target (date + weight). Keeping the start anchor fixed —
 * rather than re-deriving it from the latest weigh-in — is what lets the chart
 * show whether the user is ahead of or behind plan, instead of always sitting
 * on the line. All four fields must be present for a goal to exist.
 */
export type WeightGoal = {
  startDate: string;
  startKg: number;
  targetDate: string;
  targetKg: number;
};

function tsOf(iso: string): number {
  return new Date(`${iso.slice(0, 10)}T00:00:00`).getTime();
}

/**
 * YYYY-MM-DD from a local-midnight timestamp using LOCAL date parts. `tsOf`
 * anchors at local midnight, so deriving the label via `toISOString()` (UTC)
 * would shift it a day back for users behind UTC.
 */
function localISO(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Reads a valid, dated weight goal off a profile, or null if not fully set. */
export function readWeightGoal(p: Profile | null | undefined): WeightGoal | null {
  if (!p) return null;
  const { targetWeightKg, targetWeightDate, targetWeightStartDate, targetWeightStartKg } = p;
  if (
    targetWeightKg == null ||
    targetWeightStartKg == null ||
    !targetWeightDate ||
    !targetWeightStartDate
  ) {
    return null;
  }
  // A plan needs a forward horizon; ignore inverted/degenerate ranges.
  if (tsOf(targetWeightDate) <= tsOf(targetWeightStartDate)) return null;
  return {
    startDate: targetWeightStartDate,
    startKg: targetWeightStartKg,
    targetDate: targetWeightDate,
    targetKg: targetWeightKg,
  };
}

/** Planned weight (kg) at timestamp `ts`, or null outside the plan window. */
export function planKgAt(goal: WeightGoal, ts: number): number | null {
  const a = tsOf(goal.startDate);
  const b = tsOf(goal.targetDate);
  if (ts < a || ts > b) return null;
  const f = (ts - a) / (b - a);
  return goal.startKg + (goal.targetKg - goal.startKg) * f;
}

export type GoalStatus = {
  /** Where the glide path says you should be right now (kg). */
  plannedKg: number;
  /** Latest actual minus planned, in kg (signed). */
  deltaKg: number;
  state: "ahead" | "behind" | "onTrack" | "expired" | "upcoming";
};

/**
 * Direction-aware comparison of the latest actual weight against the plan at
 * `nowTs`. For a loss goal, being below plan is "ahead"; for a gain goal, above.
 * Returns "expired" past the deadline and "upcoming" before the start date.
 */
export function goalStatus(
  goal: WeightGoal,
  latestKg: number | null,
  nowTs: number,
): GoalStatus | null {
  if (latestKg == null) return null;
  const a = tsOf(goal.startDate);
  const b = tsOf(goal.targetDate);
  if (nowTs > b)
    return { plannedKg: goal.targetKg, deltaKg: latestKg - goal.targetKg, state: "expired" };
  if (nowTs < a)
    return { plannedKg: goal.startKg, deltaKg: latestKg - goal.startKg, state: "upcoming" };
  const planned = planKgAt(goal, nowTs);
  if (planned == null) return null;
  const delta = latestKg - planned;
  const losing = goal.targetKg < goal.startKg;
  let state: GoalStatus["state"];
  if (Math.abs(delta) < 0.3) state = "onTrack";
  else state = (losing ? delta < 0 : delta > 0) ? "ahead" : "behind";
  return { plannedKg: planned, deltaKg: delta, state };
}

export type WeightPoint = {
  t: number;
  date: string;
  value: number | null;
  plan: number | null;
};

/**
 * Merges actual weigh-ins with the goal's glide path into one series sorted by
 * time, so a single chart can draw both lines (actual + dashed plan).
 *
 * `planEndTs` clamps how far the plan line is drawn: the focused Weight tab
 * passes the target date (full glide path); the aligned Overview passes its
 * visible window end, so the plan never pushes the shared x-domain past where
 * the other panels stop.
 */
export function buildWeightSeries(opts: {
  actual: { date: string; weightKg: number }[];
  goal: WeightGoal | null;
  toDisplay: (kg: number) => number;
  planEndTs?: number;
}): WeightPoint[] {
  const { actual, goal, toDisplay, planEndTs } = opts;

  const byTs = new Map<number, WeightPoint>();
  const ensure = (ts: number): WeightPoint => {
    let row = byTs.get(ts);
    if (!row) {
      row = { t: ts, date: localISO(ts), value: null, plan: null };
      byTs.set(ts, row);
    }
    return row;
  };

  for (const a of actual) {
    const row = ensure(tsOf(a.date));
    row.value = toDisplay(a.weightKg);
  }

  if (goal) {
    const startTs = tsOf(goal.startDate);
    const targetTs = tsOf(goal.targetDate);
    const endTs = planEndTs != null ? Math.min(targetTs, planEndTs) : targetTs;
    if (endTs >= startTs) {
      // Emit a DENSE plan series (one point ~weekly) rather than just two end
      // anchors. A sparse two-point line renders in Chromium but not in the
      // app's WKWebView; a dense series draws reliably, exactly like the actual
      // weight line. Endpoints are pinned so the path reaches start and target.
      const STEP = 7 * 24 * 60 * 60 * 1000;
      const stamp = (ts: number) => {
        const v = planKgAt(goal, ts);
        if (v != null) ensure(ts).plan = toDisplay(v);
      };
      for (let ts = startTs; ts < endTs; ts += STEP) stamp(ts);
      stamp(startTs);
      stamp(endTs);
      // Also fill any existing actual-weigh-in rows inside the window.
      for (const row of byTs.values()) {
        if (row.t >= startTs && row.t <= endTs && row.plan == null) {
          const v = planKgAt(goal, row.t);
          if (v != null) row.plan = toDisplay(v);
        }
      }
    }
  }

  return [...byTs.values()].sort((a, b) => a.t - b.t);
}

export const goalTs = tsOf;
