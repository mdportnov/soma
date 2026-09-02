/**
 * Geometry for the card sparkline, in percent of a 100×100 box so the SVG can
 * stretch (`preserveAspectRatio="none"`) while dots — positioned in CSS percent
 * — stay perfectly round. Pure so the scaling rules are testable.
 */

export type SparklinePoint = { date: string; value: number };

export type SparklineCoord<P extends SparklinePoint = SparklinePoint> = {
  x: number;
  y: number;
  point: P;
  index: number;
};

export type SparklineLayout<P extends SparklinePoint = SparklinePoint> = {
  coords: SparklineCoord<P>[];
  /** Polyline `points` attribute; empty below two points. */
  line: string;
  /** Optimal band as a y-range in percent, when both bounds are known. */
  band: { y1: number; y2: number } | null;
};

/** Padding so the line never kisses the box edge and a flat series stays centered. */
const PAD_X = 6;
const PAD_Y = 10;

export function sparklineLayout<P extends SparklinePoint>(
  points: P[],
  opts: { optimalLow?: number | null; optimalHigh?: number | null } = {},
): SparklineLayout<P> {
  if (points.length === 0) return { coords: [], line: "", band: null };

  const values = points.map((p) => p.value);
  const lo = Math.min(...values, opts.optimalLow ?? Infinity);
  const hi = Math.max(...values, opts.optimalHigh ?? -Infinity);
  // A flat series (or a single point) still needs a non-zero span to map onto.
  const span = Math.max(hi - lo, Math.abs(hi) * 0.05, 1e-6);
  const yMin = lo - span * 0.1;
  const yMax = hi + span * 0.1;
  const yPct = (v: number) => PAD_Y + ((yMax - v) / (yMax - yMin)) * (100 - 2 * PAD_Y);

  const n = points.length;
  const xPct = (i: number) => (n === 1 ? 50 : PAD_X + (i / (n - 1)) * (100 - 2 * PAD_X));

  const coords = points.map((point, index) => ({
    x: xPct(index),
    y: yPct(point.value),
    point,
    index,
  }));
  const line = n >= 2 ? coords.map((c) => `${c.x},${c.y}`).join(" ") : "";
  const band =
    opts.optimalLow != null && opts.optimalHigh != null
      ? { y1: yPct(opts.optimalHigh), y2: yPct(opts.optimalLow) }
      : null;
  return { coords, line, band };
}

/** Signed change of `point` vs the previous one: absolute and relative (null when undefined). */
export function pointDelta(
  points: SparklinePoint[],
  index: number,
): { abs: number; rel: number | null } | null {
  if (index <= 0 || index >= points.length) return null;
  const prev = points[index - 1]!.value;
  const cur = points[index]!.value;
  return { abs: cur - prev, rel: prev === 0 ? null : (cur - prev) / Math.abs(prev) };
}
