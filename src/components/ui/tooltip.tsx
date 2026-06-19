import * as React from "react";
import { createPortal } from "react-dom";

/**
 * Lightweight, accessible tooltip. Wraps a single focusable/hoverable element
 * and shows `content` on hover AND keyboard focus (native `title` does neither
 * reliably). Rendered in a body portal so the timeline's `overflow-hidden`
 * never clips it; the floating layer is pointer-transparent and aria-hidden.
 */
export function Tooltip({
  content,
  children,
}: {
  content: React.ReactNode;
  children: React.ReactElement;
}) {
  const [coords, setCoords] = React.useState<{ x: number; y: number; below: boolean } | null>(null);

  const open = (e: React.SyntheticEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const below = r.top < 56; // not enough room above → flip under the element
    const x = Math.min(Math.max(r.left + r.width / 2, 92), window.innerWidth - 92);
    setCoords({ x, y: below ? r.bottom + 6 : r.top - 6, below });
  };
  const close = () => setCoords(null);

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
      {coords &&
        createPortal(
          <div
            role="tooltip"
            aria-hidden
            className="pointer-events-none fixed z-50 max-w-[16rem] -translate-x-1/2 whitespace-pre-line rounded-md border bg-card px-2 py-1 text-xs text-foreground shadow-lg"
            style={{
              left: coords.x,
              top: coords.y,
              transform: coords.below ? "translate(-50%, 0)" : "translate(-50%, -100%)",
            }}
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}
