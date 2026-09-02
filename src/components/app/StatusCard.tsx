import * as React from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/**
 * Compact record card with a fixed three-row anatomy so every card in a grid
 * lines up regardless of which data it has:
 *
 *   ┌ title ……………………………………………… [status] ┐   header — name truncates, status never wraps
 *   │ value  unit                 (aside)  │   body   — primary figure left, trend/visual right
 *   │ meta                    [tag]  (act) │   footer — date/context left, secondary tag right
 *   ├ children (optional, variable height) ┤   related links, notes — outside the link
 *   └ actions bar (optional, persistent)  ─┘   2+ actions, right-aligned, pinned to the bottom
 *
 * Rules the whole app follows with this card:
 * - Status lives next to the NAME (header right), never next to the value.
 * - The value row is reserved even without data — pass a placeholder — so
 *   cards never change height with content.
 * - ONE action → `action`: the footer's right corner, revealed on hover /
 *   focus, the footer reserving its width so nothing shifts.
 *   TWO OR MORE actions → `actions`: a persistent bar under the rows (hidden
 *   destructive actions are a discoverability trap). Never both.
 * - Anything of variable height (`children`) sits between the rows and the
 *   bar, outside the link: with `auto-rows-fr` on the grid the three rows
 *   align at the top and the bar at the bottom, so a row of cards still reads
 *   as one straight grid even when one card carries related links.
 * - The rows are one link and one tab stop (when `to` is given); the actions
 *   are the next ones. Interactive children must not be nested in the link —
 *   that is why `children` renders outside it.
 * - Grids: `grid auto-rows-fr gap-2`; the card fills its cell (`h-full`).
 */
export function StatusCard({
  to,
  title,
  status,
  value,
  aside,
  meta,
  tag,
  action,
  actions,
  children,
  muted = false,
  className,
  state,
  motionKey,
}: {
  /** Detail route; without it the rows are a plain block (e.g. allergies have no detail page). */
  to?: string;
  /** `<Link state>` passthrough: a seed for the detail page, the drill flag. */
  state?: unknown;
  /** Marks the card for `useListMotion` / `useLeaving` on the page. */
  motionKey?: string;
  title: React.ReactNode;
  status?: React.ReactNode;
  value: React.ReactNode;
  aside?: React.ReactNode;
  meta?: React.ReactNode;
  tag?: React.ReactNode;
  /** Single hover-revealed corner action. Mutually exclusive with `actions`. */
  action?: React.ReactNode;
  /** Persistent bottom bar for two or more actions. Mutually exclusive with `action`. */
  actions?: React.ReactNode;
  children?: React.ReactNode;
  /** Recede visually (e.g. dictionary entries without readings, resolved records). */
  muted?: boolean;
  className?: string;
}) {
  const rows = (
    <>
      <div className="flex h-5 items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium selectable">{title}</p>
        {status && <span className="flex shrink-0 items-center">{status}</span>}
      </div>
      <div className="flex h-8 items-center justify-between gap-2">
        <div className="min-w-0 flex-1 truncate">{value}</div>
        {aside}
      </div>
      <div
        className={cn(
          "flex h-6 items-center justify-between gap-2 text-[11px] text-muted-foreground",
          action && "pr-8",
        )}
      >
        <span className="min-w-0 truncate">{meta}</span>
        {tag && <span className="flex shrink-0 items-center">{tag}</span>}
      </div>
    </>
  );
  const rowsClass = cn(
    "flex flex-col gap-1.5 p-3",
    actions || children ? "rounded-t-[inherit]" : "rounded-[inherit]",
    to &&
      "press hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50",
  );

  return (
    <div
      className={cn(
        "group/card relative flex h-full flex-col rounded-xl border bg-card",
        muted && "border-dashed bg-transparent opacity-60 hover:opacity-100",
        className,
      )}
      data-motion-key={motionKey}
    >
      {to ? (
        <Link to={to} state={state} className={rowsClass}>
          {rows}
        </Link>
      ) : (
        <div className={rowsClass}>{rows}</div>
      )}
      {children && <div className="border-t px-3 py-2">{children}</div>}
      {actions && (
        <div className="mt-auto flex flex-wrap items-center justify-end gap-1.5 border-t px-2 py-2">
          {actions}
        </div>
      )}
      {action && !actions && (
        <div className="absolute bottom-2.5 right-2.5 flex items-center opacity-0 transition-opacity group-hover/card:opacity-100 focus-within:opacity-100">
          {action}
        </div>
      )}
    </div>
  );
}
