import * as React from "react";
import { createPortal } from "react-dom";
import { placeTooltip, type Rect, type TooltipPlacement } from "./tooltip-position";

/**
 * Lightweight, accessible tooltip. Wraps a single focusable/hoverable element
 * and shows `content` on hover AND keyboard focus (native `title` does neither
 * reliably). Rendered in a body portal so the timeline's `overflow-hidden`
 * never clips it; the floating layer is pointer-transparent and aria-hidden.
 *
 * Positioning is two-phase: the box first renders invisible at the viewport
 * origin (so it lays out at its natural width, up to `max-w`), is measured,
 * and is then translated next to the anchor — shifted, never squeezed, to stay
 * inside the viewport. Anchoring with `left`/`right` alone would let a fixed
 * box near the edge shrink to the leftover width and wrap one word per line.
 */
export function Tooltip({
  content,
  children,
}: {
  content: React.ReactNode;
  children: React.ReactElement;
}) {
  const [anchor, setAnchor] = React.useState<Rect | null>(null);
  const [placement, setPlacement] = React.useState<TooltipPlacement | null>(null);
  const boxRef = React.useRef<HTMLDivElement>(null);

  const open = (e: React.SyntheticEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setAnchor({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  };
  const close = React.useCallback(() => {
    setAnchor(null);
    setPlacement(null);
  }, []);

  React.useLayoutEffect(() => {
    const box = boxRef.current;
    if (!anchor || !box) return;
    setPlacement(
      placeTooltip(
        anchor,
        { width: box.offsetWidth, height: box.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [anchor, content]);

  // The anchor moves under a scrolling track or a resize; hiding beats drifting.
  React.useEffect(() => {
    if (!anchor) return;
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [anchor, close]);

  const child = children as React.ReactElement<Record<string, unknown>>;
  const trigger = React.cloneElement(child, {
    onMouseEnter: open,
    onMouseLeave: close,
    onFocus: open,
    onBlur: close,
  });

  return (
    <>
      {trigger}
      {anchor &&
        createPortal(
          <div
            ref={boxRef}
            role="tooltip"
            aria-hidden
            className="pointer-events-none fixed left-0 top-0 z-50 w-max min-w-[8rem] max-w-[22rem] rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs leading-snug text-popover-foreground shadow-lg break-words whitespace-normal"
            style={{
              transform: placement ? `translate(${placement.x}px, ${placement.y}px)` : undefined,
              visibility: placement ? "visible" : "hidden",
            }}
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}
