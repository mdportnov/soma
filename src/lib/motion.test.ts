import { describe, expect, it } from "vitest";
import type { Journal } from "@/app/nav-journal";
import {
  MAX_ANIMATED_ITEMS,
  MOTION_MS,
  motionDuration,
  pageMotion,
  planListChange,
  prefersReducedMotion,
  staggerDelay,
} from "./motion";

const journal = (keys: string[], index: number): Journal => ({
  entries: keys.map((key) => ({ key, path: `/${key}`, search: "", drill: false })),
  index,
});
const visit = (key: string, drill = false) => ({ key, path: `/${key}`, search: "", drill });

describe("pageMotion", () => {
  it("drills in on a push that declared containment", () => {
    expect(pageMotion(journal(["a"], 0), visit("b", true), "PUSH")).toBe("drill");
  });

  it("hops laterally on a plain push (sidebar, search, notification)", () => {
    expect(pageMotion(journal(["a"], 0), visit("b"), "PUSH")).toBe("lateral");
  });

  it("comes back when popping to an entry behind the pointer", () => {
    expect(pageMotion(journal(["a", "b", "c"], 2), visit("a"), "POP")).toBe("back");
  });

  it("drills again when popping forward", () => {
    expect(pageMotion(journal(["a", "b", "c"], 0), visit("c"), "POP")).toBe("drill");
  });

  it("does not re-animate the entry already on screen", () => {
    expect(pageMotion(journal(["a", "b"], 1), visit("b"), "POP")).toBe("none");
  });

  it("gives a replace no entrance", () => {
    expect(pageMotion(journal(["a"], 0), visit("a2", true), "REPLACE")).toBe("none");
  });

  it("treats the very first visit and an unknown pop as lateral", () => {
    expect(pageMotion(journal([], -1), visit("a"), "POP")).toBe("lateral");
    expect(pageMotion(journal(["x"], 0), visit("gone"), "POP")).toBe("lateral");
  });
});

describe("staggerDelay", () => {
  it("steps by 20ms per item", () => {
    expect(staggerDelay(0)).toBe(0);
    expect(staggerDelay(1)).toBe(20);
    expect(staggerDelay(5)).toBe(100);
  });

  it("caps so a long list arrives as one block after the first dozen", () => {
    expect(staggerDelay(12)).toBe(240);
    expect(staggerDelay(13)).toBe(240);
    expect(staggerDelay(500)).toBe(240);
  });

  it("tolerates junk indexes", () => {
    expect(staggerDelay(-3)).toBe(0);
    expect(staggerDelay(Number.NaN)).toBe(0);
    expect(staggerDelay(2.9)).toBe(40);
  });

  it("honours custom steps and caps", () => {
    expect(staggerDelay(10, { stepMs: 30, cap: 4 })).toBe(120);
  });
});

describe("planListChange", () => {
  it("stages every item on the first render", () => {
    expect(planListChange([], ["a", "b"])).toEqual({
      kind: "initial",
      entering: ["a", "b"],
      staying: [],
    });
  });

  it("is a no-op when nothing moved", () => {
    expect(planListChange(["a", "b"], ["a", "b"]).kind).toBe("none");
    expect(planListChange([], []).kind).toBe("none");
  });

  it("recognises a pure sort", () => {
    const plan = planListChange(["a", "b", "c"], ["c", "a", "b"]);
    expect(plan.kind).toBe("reorder");
    expect(plan.entering).toEqual([]);
    expect(plan.staying).toEqual(["c", "a", "b"]);
  });

  it("separates newcomers from survivors on a filter change", () => {
    const plan = planListChange(["a", "b", "c"], ["b", "d", "c"]);
    expect(plan.kind).toBe("refilter");
    expect(plan.entering).toEqual(["d"]);
    expect(plan.staying).toEqual(["b", "c"]);
  });

  it("treats a removal as a refilter with no newcomers", () => {
    const plan = planListChange(["a", "b", "c"], ["a", "c"]);
    expect(plan.kind).toBe("refilter");
    expect(plan.entering).toEqual([]);
    expect(plan.staying).toEqual(["a", "c"]);
  });
});

describe("reduced motion", () => {
  it("is off where there is no window", () => {
    expect(prefersReducedMotion()).toBe(false);
  });

  it("collapses every duration to zero when reduced", () => {
    expect(motionDuration(MOTION_MS.slow, true)).toBe(0);
    expect(motionDuration(MOTION_MS.slow, false)).toBe(MOTION_MS.slow);
  });

  it("keeps the per-item budget bounded", () => {
    expect(staggerDelay(MAX_ANIMATED_ITEMS)).toBeLessThanOrEqual(MOTION_MS.slow);
  });
});
