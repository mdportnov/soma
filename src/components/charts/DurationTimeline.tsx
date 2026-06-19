import * as React from "react";
import { Tooltip } from "@/components/ui/tooltip";
import { TimelinePanel } from "./TimelinePanel";
import { useI18n } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";

const DAY = 86400000;
const PX_PER_MONTH = 64;
const ROW_H = 30;
const AXIS_H = 24;
const LABEL_FONT = "600 11px ui-sans-serif, system-ui, -apple-system, sans-serif";

export type DurationItem = {
  id: number;
  label: string;
  /** ISO start date. */
  start: string;
  /** ISO end date, or null when still ongoing (bar runs to "now"). */
  end: string | null;
  color: string;
  tooltip: React.ReactNode;
};

function ts(iso: string): number {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime();
}

let _canvas: HTMLCanvasElement | null = null;
function measureLabel(text: string): number {
  if (typeof document === "undefined") return text.length * 6.5;
  _canvas ??= document.createElement("canvas");
  const ctx = _canvas.getContext("2d");
  if (!ctx) return text.length * 6.5;
  ctx.font = LABEL_FONT;
  return ctx.measureText(text).width;
}

/**
 * Horizontal duration timeline (Gantt): one bar per item spanning its period,
 * labels rendered on the bar when they fit and beside it when too narrow, full
 * details on hover. The track scrolls horizontally when the history is wider
 * than the viewport. Shared by the medications and diagnoses screens — anything
 * with a start, an optional end, and a label. Renders nothing when empty.
 */
export function DurationTimeline({
  title,
  items,
  legend,
  storageKey,
  onSelect,
}: {
  title: string;
  items: DurationItem[];
  legend?: { color: string; label: string }[];
  /** localStorage key to remember the collapsed state. */
  storageKey?: string;
  onSelect?: (id: number) => void;
}) {
  const { t, lang } = useI18n();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [trackPx, setTrackPx] = React.useState(0);
  const [now] = React.useState(() => Date.now());

  React.useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const update = () => setTrackPx(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rows = React.useMemo(
    () => [...items].sort((a, b) => ts(a.start) - ts(b.start) || a.label.localeCompare(b.label)),
    [items],
  );

  const { start, span, months } = React.useMemo(() => {
    const starts = rows.map((m) => ts(m.start));
    const ends = rows.map((m) => (m.end ? ts(m.end) : now));
    const min = Math.min(...starts, now);
    const max = Math.max(...ends, now);
    const s = min - 12 * DAY;
    const e = max + 12 * DAY;
    const sp = Math.max(e - s, DAY);
    return { start: s, span: sp, months: sp / (30.44 * DAY) };
  }, [rows, now]);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [trackPx, rows.length]);

  if (rows.length === 0) return null;

  const frac = (time: number) => (time - start) / span;
  const nowFrac = frac(now);

  const ticks: { time: number; label: string }[] = [];
  const cursor = new Date(start);
  cursor.setUTCDate(1);
  cursor.setUTCMonth(cursor.getUTCMonth() + 1, 1);
  cursor.setUTCHours(0, 0, 0, 0);
  const step = months > 36 ? 6 : months > 18 ? 3 : 1;
  const locale = lang === "ru" ? "ru-RU" : "en-GB";
  let i = 0;
  while (cursor.getTime() < start + span) {
    if (i % step === 0) {
      const m = cursor.getUTCMonth();
      ticks.push({
        time: cursor.getTime(),
        label:
          m === 0
            ? String(cursor.getUTCFullYear())
            : cursor.toLocaleDateString(locale, { month: "short", timeZone: "UTC" }),
      });
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    i++;
  }

  const trackWidth = `max(100%, ${Math.round(months * PX_PER_MONTH)}px)`;

  const legendNode =
    legend && legend.length > 0 ? (
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        {legend.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full" style={{ backgroundColor: l.color }} />
            {l.label}
          </span>
        ))}
      </div>
    ) : undefined;

  return (
    <TimelinePanel title={title} right={legendNode} storageKey={storageKey}>
      <div ref={scrollRef} className="overflow-x-auto">
        <div ref={trackRef} className="relative" style={{ width: trackWidth }}>
          {ticks.map((tick) => (
            <span
              key={tick.time}
              className="absolute bottom-0 w-px bg-border/60"
              style={{ left: `${frac(tick.time) * 100}%`, top: AXIS_H }}
            />
          ))}
          {nowFrac >= 0 && nowFrac <= 1 && (
            <span
              className="absolute bottom-0 w-px bg-primary/50"
              style={{ left: `${nowFrac * 100}%`, top: AXIS_H }}
            />
          )}

          <div className="relative" style={{ height: AXIS_H }}>
            {ticks.map((tick) => (
              <span
                key={tick.time}
                className="absolute top-1.5 -translate-x-1/2 text-[10px] tabular-nums text-muted-foreground"
                style={{ left: `${frac(tick.time) * 100}%` }}
              >
                {tick.label}
              </span>
            ))}
          </div>

          {rows.map((m) => {
            const leftFrac = frac(ts(m.start));
            const rightFrac = frac(m.end ? ts(m.end) : now);
            const widthPct = Math.max((rightFrac - leftFrac) * 100, 0);
            const barPx = (rightFrac - leftFrac) * trackPx;
            const labelInside = trackPx > 0 && barPx >= measureLabel(m.label) + 16;
            const range = `${formatDate(m.start)} → ${m.end ? formatDate(m.end) : t("timeline.now")}`;

            return (
              <div key={m.id} className="relative" style={{ height: ROW_H }}>
                <Tooltip content={m.tooltip}>
                  <button
                    type="button"
                    aria-label={`${m.label} — ${range}`}
                    onClick={() => onSelect?.(m.id)}
                    className={cn(
                      "absolute top-1/2 flex h-[18px] -translate-y-1/2 items-center overflow-hidden rounded-md ring-1 ring-card transition-opacity hover:opacity-100",
                      onSelect && "cursor-pointer",
                    )}
                    style={{
                      left: `${leftFrac * 100}%`,
                      width: `max(${widthPct}%, 6px)`,
                      backgroundColor: m.color,
                      opacity: 0.9,
                    }}
                  >
                    {labelInside && (
                      <span className="truncate px-1.5 text-[11px] font-semibold text-white">
                        {m.label}
                      </span>
                    )}
                  </button>
                </Tooltip>

                {!m.end && (
                  <span
                    className="pointer-events-none absolute top-1/2 size-1.5 -translate-y-1/2 translate-x-1 rounded-full"
                    style={{ left: `${rightFrac * 100}%`, backgroundColor: m.color }}
                  />
                )}
                {!labelInside && (
                  <span
                    className="pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap pl-2 text-[11px] font-medium text-foreground"
                    style={{ left: `${rightFrac * 100}%` }}
                  >
                    {m.label}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </TimelinePanel>
  );
}
