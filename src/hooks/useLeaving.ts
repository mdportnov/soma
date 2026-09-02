import * as React from "react";
import { EASE_IN_FIRM, MOTION_MS, prefersReducedMotion } from "@/lib/motion";
import { MOTION_KEY_ATTR } from "@/hooks/useListMotion";

/**
 * Exit before removal. A delete handler today is `await remove(); reload()`,
 * and the row is simply not there on the next render — the user has to infer
 * from the toast that anything happened. Wrapping the write in `leave` lets
 * the row fade out first, so the disappearance itself confirms the action was
 * heard, and only then runs the write and the reload.
 *
 * The element is found by its `data-motion-key` (the attribute `useListMotion`
 * also uses), so pages need no extra refs. `collapse` additionally animates
 * the row's height to zero — a layout animation, justified for single-column
 * lists where the rows below would otherwise jump up the moment the element is
 * removed. In a grid the gap is closed by `useListMotion` instead, so cards
 * only fade. With reduced motion, or when the row is not on screen, the write
 * runs at once.
 */
export function useLeaving() {
  const [leaving, setLeaving] = React.useState<ReadonlySet<string>>(() => new Set());

  const leave = React.useCallback(
    async (
      key: string | number,
      commit: () => Promise<void> | void,
      opts?: { collapse?: boolean },
    ) => {
      const k = String(key);
      const el = document.querySelector<HTMLElement>(`[${MOTION_KEY_ATTR}="${CSS.escape(k)}"]`);
      if (!el || prefersReducedMotion()) {
        await commit();
        return;
      }
      setLeaving((prev) => new Set(prev).add(k));
      el.style.pointerEvents = "none";
      try {
        const fade = el.animate(
          [
            { opacity: 1, transform: "none" },
            { opacity: 0, transform: "scale(0.97)" },
          ],
          { duration: MOTION_MS.quick, easing: EASE_IN_FIRM, fill: "forwards" },
        ).finished;
        const collapse = opts?.collapse
          ? el.animate(
              [
                { height: `${el.offsetHeight}px`, marginBottom: getComputedStyle(el).marginBottom },
                { height: "0px", marginBottom: "0px" },
              ],
              { duration: MOTION_MS.slow, easing: EASE_IN_FIRM, fill: "forwards" },
            ).finished
          : null;
        await Promise.all([fade, collapse]);
      } catch {
        // A cancelled animation (the element was unmounted underneath us) is
        // not a reason to skip the write.
      }
      try {
        await commit();
      } catch (e) {
        // The write failed and the row is staying: bring it back rather than
        // leave a ghost the user can neither read nor click.
        if (el.isConnected) {
          for (const a of el.getAnimations()) a.cancel();
          el.style.pointerEvents = "";
        }
        throw e;
      } finally {
        setLeaving((prev) => {
          const next = new Set(prev);
          next.delete(k);
          return next;
        });
      }
    },
    [],
  );

  const isLeaving = React.useCallback(
    (key: string | number) => leaving.has(String(key)),
    [leaving],
  );

  return { leave, isLeaving };
}
