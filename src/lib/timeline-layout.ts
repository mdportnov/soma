const LABEL_COLUMN_WIDTH = 96;
const MIN_ALL_TIME_PLOT_WIDTH = 960;
const PIXELS_PER_MONTH = 18;
const PIXELS_PER_POINT = 40;

export function allTimeTimelineWidth(monthSpan: number, maxLanePoints: number): number {
  const months = Number.isFinite(monthSpan) ? Math.max(monthSpan, 1) : 1;
  const points = Number.isFinite(maxLanePoints) ? Math.max(Math.ceil(maxLanePoints), 0) : 0;
  const plotWidth = Math.max(
    MIN_ALL_TIME_PLOT_WIDTH,
    Math.ceil(months * PIXELS_PER_MONTH),
    points * PIXELS_PER_POINT,
  );
  return LABEL_COLUMN_WIDTH + plotWidth;
}

export function timelineTickStep(monthSpan: number, allTime: boolean): number {
  if (allTime) {
    if (monthSpan > 96) return 6;
    if (monthSpan > 48) return 3;
    if (monthSpan > 24) return 2;
    return 1;
  }
  if (monthSpan > 30) return 6;
  if (monthSpan > 14) return 3;
  return 1;
}
