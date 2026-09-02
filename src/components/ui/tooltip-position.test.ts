import { describe, expect, it } from "vitest";
import { placeTooltip, TOOLTIP_GAP, TOOLTIP_MARGIN } from "./tooltip-position";

const viewport = { width: 1000, height: 600 };
const size = { width: 300, height: 80 };
const anchorAt = (left: number, top: number) => ({
  left,
  top,
  right: left + 10,
  bottom: top + 10,
});

describe("placeTooltip", () => {
  it("centers over the anchor when there is room", () => {
    const p = placeTooltip(anchorAt(495, 300), size, viewport);
    expect(p.x).toBe(500 - 150);
    expect(p.y).toBe(300 - TOOLTIP_GAP - 80);
    expect(p.below).toBe(false);
  });

  it("shifts inside the right edge without shrinking", () => {
    const p = placeTooltip(anchorAt(985, 300), size, viewport);
    expect(p.x).toBe(viewport.width - TOOLTIP_MARGIN - size.width);
    expect(p.x + size.width).toBeLessThanOrEqual(viewport.width - TOOLTIP_MARGIN);
  });

  it("shifts inside the left edge", () => {
    const p = placeTooltip(anchorAt(2, 300), size, viewport);
    expect(p.x).toBe(TOOLTIP_MARGIN);
  });

  it("flips below when there is no room above", () => {
    const p = placeTooltip(anchorAt(500, 20), size, viewport);
    expect(p.below).toBe(true);
    expect(p.y).toBe(30 + TOOLTIP_GAP);
  });

  it("keeps the side with more room when it fits on neither", () => {
    const tall = { width: 300, height: 500 };
    const above = placeTooltip(anchorAt(500, 400), tall, viewport);
    expect(above.below).toBe(false);
    expect(above.y).toBe(TOOLTIP_MARGIN);
    const belowP = placeTooltip(anchorAt(500, 100), tall, viewport);
    expect(belowP.below).toBe(true);
    expect(belowP.y + tall.height).toBeLessThanOrEqual(viewport.height - TOOLTIP_MARGIN);
  });

  it("never depends on anchor position for width (only x moves)", () => {
    const xs = [0, 100, 500, 900, 999].map((l) => placeTooltip(anchorAt(l, 300), size, viewport));
    for (const p of xs) {
      expect(p.x).toBeGreaterThanOrEqual(TOOLTIP_MARGIN);
      expect(p.x + size.width).toBeLessThanOrEqual(viewport.width - TOOLTIP_MARGIN);
    }
  });
});
