import { useEffect, useState } from "react";

/**
 * Returns `true` only after `active` has held continuously for `delayMs`.
 *
 * Queries here hit a local SQLite file and settle in single-digit milliseconds,
 * but React still paints one frame of whatever the pending branch renders. For a
 * spinner that reads as a flash plus a collapse/expand of the page height on
 * every navigation. Gating the spinner behind a short delay means a fast load
 * paints no spinner at all, and only a genuinely slow one gets an indicator.
 */
export function useDelayedFlag(active: boolean, delayMs = 180) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!active) {
      setOn(false);
      return;
    }
    const id = window.setTimeout(() => setOn(true), delayMs);
    return () => window.clearTimeout(id);
  }, [active, delayMs]);
  return on;
}
