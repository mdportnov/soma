import { describe, expect, it } from "vitest";
import { allTimeTimelineWidth, timelineTickStep } from "./timeline-layout";

describe("all-time timeline layout", () => {
  it("keeps a minimum scrollable plot width", () => {
    expect(allTimeTimelineWidth(12, 3)).toBe(1056);
  });

  it("grows with calendar span", () => {
    expect(allTimeTimelineWidth(120, 3)).toBe(2256);
    expect(allTimeTimelineWidth(302.2, 27)).toBe(5536);
  });

  it("grows with the densest point lane", () => {
    expect(allTimeTimelineWidth(12, 100)).toBe(4096);
  });

  it("normalizes invalid inputs", () => {
    expect(allTimeTimelineWidth(Number.NaN, Number.POSITIVE_INFINITY)).toBe(1056);
  });
});

describe("timeline tick spacing", () => {
  it("uses readable labels on the expanded all-time canvas", () => {
    expect(timelineTickStep(24, true)).toBe(1);
    expect(timelineTickStep(36, true)).toBe(2);
    expect(timelineTickStep(60, true)).toBe(3);
    expect(timelineTickStep(120, true)).toBe(6);
  });

  it("keeps compact labels on fixed responsive ranges", () => {
    expect(timelineTickStep(12, false)).toBe(1);
    expect(timelineTickStep(24, false)).toBe(3);
    expect(timelineTickStep(36, false)).toBe(6);
  });
});
