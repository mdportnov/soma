export type Rect = { left: number; top: number; right: number; bottom: number };
export type Size = { width: number; height: number };

export type TooltipPlacement = {
  /** Viewport-relative offset of the tooltip's top-left corner. */
  x: number;
  y: number;
  /** True when the tooltip sits under the anchor (flipped). */
  below: boolean;
};

/** Gap between the anchor and the tooltip. */
export const TOOLTIP_GAP = 6;
/** Minimum distance kept from every viewport edge. */
export const TOOLTIP_MARGIN = 8;

/**
 * Places an already-measured tooltip next to its anchor. Horizontal centering
 * is preferred; the box is then shifted (never shrunk) to stay inside the
 * viewport. Vertically it goes above the anchor and flips below when the space
 * above is insufficient — unless below is even tighter, in which case whichever
 * side has more room wins.
 */
export function placeTooltip(anchor: Rect, size: Size, viewport: Size): TooltipPlacement {
  const centerX = (anchor.left + anchor.right) / 2;
  const maxX = Math.max(TOOLTIP_MARGIN, viewport.width - TOOLTIP_MARGIN - size.width);
  const x = Math.min(Math.max(centerX - size.width / 2, TOOLTIP_MARGIN), maxX);

  const roomAbove = anchor.top - TOOLTIP_GAP - TOOLTIP_MARGIN;
  const roomBelow = viewport.height - anchor.bottom - TOOLTIP_GAP - TOOLTIP_MARGIN;
  const fitsAbove = size.height <= roomAbove;
  const fitsBelow = size.height <= roomBelow;
  const below = !fitsAbove && (fitsBelow || roomBelow > roomAbove);

  const rawY = below ? anchor.bottom + TOOLTIP_GAP : anchor.top - TOOLTIP_GAP - size.height;
  const maxY = Math.max(TOOLTIP_MARGIN, viewport.height - TOOLTIP_MARGIN - size.height);
  const y = Math.min(Math.max(rawY, TOOLTIP_MARGIN), maxY);

  return { x, y, below };
}
