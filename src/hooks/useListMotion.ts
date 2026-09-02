import * as React from "react";
import {
  EASE_OUT_SOFT,
  MAX_ANIMATED_ITEMS,
  MOTION_MS,
  planListChange,
  prefersReducedMotion,
  staggerDelay,
} from "@/lib/motion";

/** Attribute a keyed row or card carries so the hook can find and track it. */
export const MOTION_KEY_ATTR = "data-motion-key";

type Point = { x: number; y: number };

/**
 * Makes a keyed list's changes visible without a library: survivors of a sort
 * or filter slide from where they were to where they are (FLIP, transform
 * only), newcomers fade in with a capped stagger, and nothing animates when the
 * order is unchanged. The page does two things: put the returned ref on the
 * element that contains the rows, and give every row `data-motion-key`.
 *
 * Positions are re-measured after every commit — not only when keys change —
 * so a window resize between two sorts never leaves stale coordinates behind.
 * They are stored relative to the container, so scrolling between renders does
 * not read as movement. Lists past `MAX_ANIMATED_ITEMS` are left alone, and so
 * is everything when the user prefers reduced motion; the page-level entrance
 * still applies in both cases.
 */
export function useListMotion<T extends HTMLElement = HTMLDivElement>(keys: readonly string[]) {
  const ref = React.useRef<T | null>(null);
  const last = React.useRef<{ signature: string; keys: string[]; rects: Map<string, Point> }>({
    signature: "",
    keys: [],
    rects: new Map(),
  });
  const signature = keys.join(" ");

  React.useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>(`[${MOTION_KEY_ATTR}]`));
    const origin = root.getBoundingClientRect();
    const rects = new Map<string, Point>();
    for (const el of els) {
      const key = el.getAttribute(MOTION_KEY_ATTR);
      if (!key) continue;
      const r = el.getBoundingClientRect();
      rects.set(key, { x: r.left - origin.left, y: r.top - origin.top });
    }
    const prev = last.current;
    last.current = { signature, keys: [...keys], rects };
    if (prev.signature === signature) return;
    if (els.length > MAX_ANIMATED_ITEMS || prefersReducedMotion()) return;

    const plan = planListChange(prev.keys, keys);
    if (plan.kind === "none") return;
    const entering = new Set(plan.entering);
    let enterIndex = 0;
    for (const el of els) {
      const key = el.getAttribute(MOTION_KEY_ATTR);
      if (!key) continue;
      if (plan.kind === "initial" || entering.has(key)) {
        el.animate(
          [
            { opacity: 0, transform: "translateY(6px)" },
            { opacity: 1, transform: "none" },
          ],
          {
            duration: MOTION_MS.base,
            delay: staggerDelay(enterIndex++),
            easing: EASE_OUT_SOFT,
            fill: "backwards",
          },
        );
        continue;
      }
      const before = prev.rects.get(key);
      const after = rects.get(key);
      if (!before || !after) continue;
      const dx = before.x - after.x;
      const dy = before.y - after.y;
      // Sub-pixel jitter is not movement; a jump larger than a screen is a
      // re-layout (grouped ↔ flat) that would look like rows flying in from
      // nowhere — let those simply appear.
      if ((Math.abs(dx) < 1 && Math.abs(dy) < 1) || Math.abs(dx) > 2000 || Math.abs(dy) > 2000) {
        continue;
      }
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
        duration: MOTION_MS.slow,
        easing: EASE_OUT_SOFT,
      });
    }
  });

  return ref;
}
