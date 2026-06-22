import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Animates its own height to match its content, so swapping children (a wizard
 * step) or reflowing them (a language change that lengthens the copy) eases
 * between sizes instead of snapping. Content height is tracked with a
 * ResizeObserver; the first measure is applied synchronously to avoid a flash.
 */
export function AutoHeight({
  children,
  className,
  duration = 300,
}: {
  children: React.ReactNode;
  className?: string;
  duration?: number;
}) {
  const inner = React.useRef<HTMLDivElement>(null);
  const [height, setHeight] = React.useState<number | null>(null);

  React.useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      className={cn("overflow-hidden transition-[height] ease-out", className)}
      style={{ height: height ?? undefined, transitionDuration: `${duration}ms` }}
    >
      <div ref={inner}>{children}</div>
    </div>
  );
}
