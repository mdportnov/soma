import { Tooltip } from "@/components/ui/tooltip";
import { FlagBadge } from "@/components/app/FlagBadge";
import { pointDelta, sparklineLayout, type SparklinePoint } from "@/lib/sparkline";
import { cn, formatDate, formatValue } from "@/lib/utils";

export type SparklineReading = SparklinePoint & {
  unit?: string;
  flag?: string | null;
  outOfRange?: boolean;
  evaluated?: boolean;
};

/**
 * Inline trend for a record card: the optimal band (when known) shaded, the
 * line, and one hover/focus target per reading that opens a tooltip with the
 * date, value, change vs the previous reading and its flag. Plain SVG rather
 * than recharts: the parent is a grid of dozens of cards inside a `<Link>`,
 * so a measuring `ResponsiveContainer` per card and a second tooltip system
 * would cost more than they give. Hit targets are 16px, larger than the dots.
 *
 * The chart is announced as an image whose label lists every reading, so the
 * hover-only tooltips have a textual equivalent. With one reading a single
 * centered dot is drawn; with none, nothing — the caller reserves the slot.
 */
export function Sparkline({
  points,
  optimalLow,
  optimalHigh,
  lastOutOfRange = false,
  label,
  className = "h-8 w-24",
}: {
  points: SparklineReading[];
  optimalLow?: number | null;
  optimalHigh?: number | null;
  lastOutOfRange?: boolean;
  /** Accessible name prefix, e.g. the biomarker name. */
  label?: string;
  className?: string;
}) {
  if (points.length === 0) return null;
  const { coords, line, band } = sparklineLayout(points, { optimalLow, optimalHigh });
  const lastIndex = points.length - 1;
  const summary = points
    .map((p) => `${formatDate(p.date)}: ${formatValue(p.value)}${p.unit ? ` ${p.unit}` : ""}`)
    .join(", ");

  return (
    <div
      className={cn("group/spark relative shrink-0", className)}
      role="img"
      aria-label={label ? `${label}. ${summary}` : summary}
    >
      <svg
        className="absolute inset-0 h-full w-full overflow-visible"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        {band && (
          <rect
            x="0"
            width="100"
            y={band.y1}
            height={Math.max(band.y2 - band.y1, 0)}
            fill="var(--success)"
            fillOpacity={0.14}
          />
        )}
        {line && (
          <polyline
            points={line}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {coords.map((c) => {
        const last = c.index === lastIndex;
        const delta = pointDelta(points, c.index);
        const p = c.point;
        return (
          <Tooltip
            key={c.index}
            content={
              <span className="flex flex-col gap-0.5">
                <span className="text-muted-foreground">{formatDate(p.date)}</span>
                <span className="flex items-center gap-1.5 tabular-nums">
                  <span className="font-semibold text-foreground">
                    {formatValue(p.value)}
                    {p.unit ? ` ${p.unit}` : ""}
                  </span>
                  {delta && (
                    <span className="text-muted-foreground">
                      {delta.abs > 0 ? "+" : ""}
                      {formatValue(delta.abs)}
                      {delta.rel != null &&
                        ` (${delta.rel > 0 ? "+" : ""}${Math.round(delta.rel * 100)}%)`}
                    </span>
                  )}
                </span>
                {(p.outOfRange || p.evaluated === false) && (
                  <span>
                    <FlagBadge
                      flag={p.outOfRange ? (p.flag ?? null) : null}
                      evaluated={p.evaluated !== false}
                    />
                  </span>
                )}
              </span>
            }
          >
            <span
              className="absolute flex size-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
              style={{ left: `${c.x}%`, top: `${c.y}%` }}
            >
              <span
                className={cn(
                  "block rounded-full ring-1 ring-card",
                  last ? "size-2" : "size-1.5 opacity-0 group-hover/spark:opacity-70",
                )}
                style={{
                  backgroundColor: last && lastOutOfRange ? "var(--destructive)" : "var(--primary)",
                }}
              />
            </span>
          </Tooltip>
        );
      })}
    </div>
  );
}
