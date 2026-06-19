import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import type { PanelShift, TimelineEvent } from "@/db/repos";
import { bpStageColor } from "@/lib/vitals";
import { useI18n } from "@/lib/i18n";
import { Tooltip } from "@/components/ui/tooltip";
import { OVERLAY_COLORS } from "./TrendChart";
import { cn, formatDate, formatValue } from "@/lib/utils";

/** Medications shown before the lane collapses behind a "show more" toggle. */
const MED_LIMIT = 5;

const DAY = 86400000;

function ts(iso: string): number {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime();
}

/** Toggleable timeline layers — each maps to a lane (or a set of lanes). */
export type TimelineLayer =
  | "lab_panel"
  | "medication"
  | "weight"
  | "bp"
  | "symptom"
  | "visit"
  | "diagnosis"
  | "vaccine"
  | "allergy"
  | "imaging";

export type WeightPoint = { date: string; weightKg: number };
export type BpPoint = { date: string; systolic: number; diastolic: number };

/** Lane accent colors, shared with the toggle chips. */
export const LAYER_COLOR: Record<TimelineLayer, string> = {
  lab_panel: "var(--primary)",
  medication: "#0ea5e9",
  weight: "#0d9488",
  bp: "#db2777",
  symptom: "#f97316",
  visit: "#2563eb",
  diagnosis: "#d97706",
  vaccine: "#7c3aed",
  allergy: "#e11d48",
  imaging: "#64748b",
};

/** Point-event lanes rendered as dots, in top-to-bottom order. */
const DOT_LANES: TimelineLayer[] = [
  "lab_panel",
  "visit",
  "diagnosis",
  "symptom",
  "vaccine",
  "imaging",
  "allergy",
];

/** Halo for a lab dot whose panel introduced a strong shift; null = no halo. */
function shiftHalo(severity: PanelShift["severity"]): { color: string; pulse: boolean } | null {
  if (severity === "alert") return { color: "var(--destructive)", pulse: true };
  if (severity === "watch") return { color: "#d97706", pulse: true };
  return null; // "info" moves are too minor to flag on the timeline
}

/**
 * The configurable, enriched health timeline. One shared time scale; the caller
 * decides which layers are visible. Point events render as dots, medications as
 * duration bars, and weight / blood-pressure as inline sparklines — so labs can
 * be read against "what I was taking" and "how my body was doing" at a glance.
 */
export function EnrichedTimeline({
  events,
  weight,
  bp,
  rangeMonths,
  enabled,
  weightTargetKg,
  shiftByPanel,
  labels,
}: {
  events: TimelineEvent[];
  weight: WeightPoint[];
  bp: BpPoint[];
  rangeMonths: number | null;
  enabled: Set<TimelineLayer>;
  weightTargetKg?: number | null;
  /** Per-panel strongest notable shift, keyed by panel id — highlights lab dots. */
  shiftByPanel?: Map<number, PanelShift>;
  /** Localized lane labels keyed by layer. */
  labels: Record<TimelineLayer, string>;
}) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [now] = useState(() => Date.now());
  const [medsExpanded, setMedsExpanded] = useState(false);

  const allTs = [
    ...events.map((e) => ts(e.date)),
    ...weight.map((w) => ts(w.date)),
    ...bp.map((b) => ts(b.date)),
  ];
  const dataMin = allTs.length ? Math.min(...allTs) : now - 180 * DAY;
  const start = rangeMonths ? now - rangeMonths * 30.44 * DAY : dataMin - 14 * DAY;
  const end = now + 14 * DAY;
  const span = end - start || DAY;
  const pos = (t: number) => ((t - start) / span) * 100;
  const visible = (t: number) => t >= start && t <= end;

  // Month tick marks, thinned out as the span grows.
  const ticks: { t: number; label: string }[] = [];
  const cursor = new Date(start);
  cursor.setUTCDate(1);
  cursor.setUTCMonth(cursor.getUTCMonth() + 1, 1);
  cursor.setUTCHours(0, 0, 0, 0);
  const monthSpan = span / (30.44 * DAY);
  const step = monthSpan > 30 ? 6 : monthSpan > 14 ? 3 : 1;
  while (cursor.getTime() < end) {
    if (cursor.getUTCMonth() % step === 0) {
      ticks.push({
        t: cursor.getTime(),
        label: cursor.toLocaleDateString("en-GB", {
          month: "short",
          ...(step >= 3 || cursor.getUTCMonth() === 0 ? { year: "2-digit" } : {}),
        }),
      });
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  const eventTarget = (e: TimelineEvent): string => {
    switch (e.kind) {
      case "lab_panel":
        return `/labs/${e.id}`;
      case "visit":
        return `/visits/${e.id}`;
      case "medication":
        return "/medications";
      case "diagnosis":
        return "/diagnoses";
      case "allergy":
        return "/allergies";
      case "vaccine":
        return "/vaccines";
      case "symptom":
        return "/journal?tab=symptoms";
      case "imaging":
        return `/imaging/${e.id}`;
    }
  };

  const nowX = visible(now) ? pos(now) : null;
  const hasShifts =
    enabled.has("lab_panel") &&
    !!shiftByPanel &&
    [...shiftByPanel.values()].some((s) => s.severity === "alert" || s.severity === "watch");

  const medsInRange = (
    enabled.has("medication")
      ? events.filter(
          (e): e is Extract<TimelineEvent, { kind: "medication" }> => e.kind === "medication",
        )
      : []
  ).filter((m) => {
    const mStart = ts(m.date);
    const mEnd = m.endDate ? ts(m.endDate) : now;
    return mEnd >= start && mStart <= end;
  });
  const shownMeds = medsExpanded ? medsInRange : medsInRange.slice(0, MED_LIMIT);

  const dotLanes = DOT_LANES.filter((kind) => enabled.has(kind)).map((kind) => ({
    kind,
    items: events.filter((e) => e.kind === kind && visible(ts(e.date))),
  }));

  const weightPts = enabled.has("weight")
    ? [...weight].filter((w) => visible(ts(w.date))).sort((a, b) => a.date.localeCompare(b.date))
    : [];
  const bpPts = enabled.has("bp")
    ? [...bp].filter((b) => visible(ts(b.date))).sort((a, b) => a.date.localeCompare(b.date))
    : [];

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {/* Tick header */}
      <div className="flex items-end border-b bg-muted/30">
        <div className="w-16 shrink-0 sm:w-24" />
        <div className="relative h-6 flex-1">
          {ticks.map((tick) => (
            <span
              key={tick.t}
              className="absolute bottom-1 -translate-x-1/2 text-[10px] font-medium text-muted-foreground"
              style={{ left: `${pos(tick.t)}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>
      </div>

      {/* Dot lanes (point events) */}
      {dotLanes.map(
        ({ kind, items }) =>
          items.length > 0 && (
            <LaneRow key={kind} label={labels[kind]} color={LAYER_COLOR[kind]}>
              <LaneGrid ticks={ticks} pos={pos} nowX={nowX} />
              {items.map((e) => {
                const x = pos(ts(e.date));
                const shift = e.kind === "lab_panel" ? shiftByPanel?.get(e.id) : undefined;
                const halo = shift ? shiftHalo(shift.severity) : null;
                const isAlert = shift?.severity === "alert";
                const outOfRange = e.kind === "lab_panel" && e.outOfRangeCount > 0;
                const dotColor = outOfRange ? "var(--destructive)" : LAYER_COLOR[kind];
                return (
                  <Tooltip
                    key={`${e.kind}-${e.id}`}
                    content={
                      <>
                        <span className="font-medium">{e.title}</span> — {formatDate(e.date)}
                        {e.subtitle && <div className="text-muted-foreground">{e.subtitle}</div>}
                        {shift && (
                          <div className="font-medium text-warning">
                            {t("timeline.shiftCount", { count: String(shift.count) })}
                          </div>
                        )}
                      </>
                    }
                  >
                    <button
                      aria-label={`${e.title} — ${formatDate(e.date)}`}
                      onClick={() => navigate(eventTarget(e))}
                      className="group absolute top-1/2 flex size-6 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center"
                      style={{ left: `${x}%` }}
                    >
                      {halo && (
                        <span
                          className={cn(
                            "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full",
                            isAlert ? "size-6" : "size-5",
                            halo.pulse && "motion-safe:animate-ping",
                          )}
                          style={{ backgroundColor: halo.color, opacity: 0.3 }}
                        />
                      )}
                      {halo && (
                        <span
                          className={cn(
                            "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full",
                            isAlert ? "size-5" : "size-4",
                          )}
                          style={{ backgroundColor: halo.color, opacity: 0.25 }}
                        />
                      )}
                      <span
                        className={cn(
                          "rounded-full ring-2 ring-card transition-transform group-hover:scale-150",
                          halo ? "size-3.5" : "size-3",
                        )}
                        style={{ backgroundColor: dotColor }}
                      />
                    </button>
                  </Tooltip>
                );
              })}
            </LaneRow>
          ),
      )}

      {/* Weight sparkline */}
      {weightPts.length > 0 && (
        <LaneRow
          label={labels.weight}
          color={LAYER_COLOR.weight}
          height={64}
          readout={`${formatValue(weightPts[weightPts.length - 1].weightKg, 1)} kg`}
        >
          <LaneGrid ticks={ticks} pos={pos} nowX={nowX} />
          <Sparkline
            points={weightPts.map((w) => ({ t: ts(w.date), v: w.weightKg }))}
            pos={pos}
            color={LAYER_COLOR.weight}
            target={weightTargetKg ?? null}
            tooltip={(p) => (
              <>
                <span className="font-medium">{formatValue(p.v, 1)} kg</span> ·{" "}
                {formatDate(new Date(p.t).toISOString())}
              </>
            )}
          />
        </LaneRow>
      )}

      {/* Blood pressure (systolic→diastolic candlesticks) */}
      {bpPts.length > 0 && (
        <LaneRow
          label={labels.bp}
          color={LAYER_COLOR.bp}
          height={64}
          readout={`${bpPts[bpPts.length - 1].systolic}/${bpPts[bpPts.length - 1].diastolic}`}
        >
          <LaneGrid ticks={ticks} pos={pos} nowX={nowX} />
          <BpLane points={bpPts} pos={pos} />
        </LaneRow>
      )}

      {/* Medication duration bars (collapsed past MED_LIMIT) */}
      {shownMeds.map((m, i) => {
        const mStart = ts(m.date);
        const mEnd = m.endDate ? ts(m.endDate) : now;
        const x1 = Math.max(pos(mStart), 0);
        const x2 = Math.min(pos(mEnd), 100);
        const color = OVERLAY_COLORS[i % OVERLAY_COLORS.length];
        const range = `${formatDate(m.date)} → ${m.endDate ? formatDate(m.endDate) : t("timeline.now")}`;
        return (
          <LaneRow key={`med-${m.id}`} label={m.title} color={color} compact height={28}>
            <LaneGrid ticks={ticks} pos={pos} nowX={nowX} />
            <Tooltip
              content={
                <>
                  <span className="font-medium">{m.title}</span>
                  {m.subtitle ? ` · ${m.subtitle}` : ""}
                  <div className="text-muted-foreground">{range}</div>
                </>
              }
            >
              <button
                aria-label={`${m.title} — ${range}`}
                onClick={() => navigate("/medications")}
                className="absolute top-1/2 h-2.5 -translate-y-1/2 cursor-pointer rounded-full ring-1 ring-card transition-opacity hover:opacity-80"
                style={{
                  left: `${x1}%`,
                  width: `${Math.max(x2 - x1, 0.6)}%`,
                  backgroundColor: color,
                  opacity: 0.8,
                }}
              />
            </Tooltip>
            {!m.endDate && (
              <span
                className="pointer-events-none absolute top-1/2 size-2 -translate-y-1/2 translate-x-1 rounded-full"
                style={{ left: `${x2}%`, backgroundColor: color }}
              />
            )}
          </LaneRow>
        );
      })}
      {medsInRange.length > MED_LIMIT && (
        <button
          onClick={() => setMedsExpanded((v) => !v)}
          className="flex w-full items-center gap-1.5 border-b border-dashed py-1.5 pl-2 text-[11px] font-medium text-muted-foreground last:border-0 hover:bg-muted/20"
        >
          <ChevronDown
            className={cn("size-3.5 transition-transform", medsExpanded && "rotate-180")}
          />
          {medsExpanded
            ? t("timeline.medsLess")
            : t("timeline.medsMore", { count: String(medsInRange.length - MED_LIMIT) })}
        </button>
      )}

      <TimelineLegend t={t} hasShifts={hasShifts} hasBp={bpPts.length > 0} />
    </div>
  );
}

/** Shared per-lane background: month gridlines + a "today" marker. */
function LaneGrid({
  ticks,
  pos,
  nowX,
}: {
  ticks: { t: number; label: string }[];
  pos: (t: number) => number;
  nowX: number | null;
}) {
  return (
    <>
      {ticks.map((tick) => (
        <span
          key={tick.t}
          className="absolute top-0 h-full w-px bg-border/50"
          style={{ left: `${pos(tick.t)}%` }}
        />
      ))}
      {nowX != null && (
        <span className="absolute top-0 h-full w-px bg-primary/40" style={{ left: `${nowX}%` }} />
      )}
    </>
  );
}

function LaneRow({
  label,
  color,
  children,
  height = 36,
  compact = false,
  readout,
}: {
  label: string;
  color: string;
  children: ReactNode;
  height?: number;
  compact?: boolean;
  readout?: string;
}) {
  return (
    <div className="flex items-center border-b border-dashed last:border-0 hover:bg-muted/20">
      <div className="flex w-16 shrink-0 items-center gap-1.5 pl-2 pr-2 sm:w-24">
        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[11px] font-medium text-muted-foreground",
            compact && "text-[10px]",
          )}
          title={label}
        >
          {label}
        </span>
      </div>
      <div className="relative flex-1" style={{ height }}>
        {children}
        {readout && (
          <span className="absolute right-1.5 top-1 rounded bg-card/80 px-1 text-[10px] font-semibold tabular-nums text-foreground/70">
            {readout}
          </span>
        )}
      </div>
    </div>
  );
}

type Pt = { t: number; v: number };

/** Smooth value sparkline: soft area + line (crisp) + crisp dot markers. */
function Sparkline({
  points,
  pos,
  color,
  target,
  tooltip,
}: {
  points: Pt[];
  pos: (t: number) => number;
  color: string;
  target: number | null;
  tooltip: (p: Pt) => ReactNode;
}) {
  const vals = [...points.map((p) => p.v), ...(target != null ? [target] : [])];
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const padY = Math.max((hi - lo) * 0.15, 0.5);
  const yLo = lo - padY;
  const yHi = hi + padY;
  const yPct = (v: number) => ((yHi - v) / (yHi - yLo || 1)) * 100;

  const coords = points.map((p) => ({ x: pos(p.t), y: yPct(p.v), p }));
  const line = coords.map((c) => `${c.x},${c.y}`).join(" ");
  const firstX = coords[0]?.x ?? 0;
  const lastX = coords[coords.length - 1]?.x ?? 100;
  const area = `${firstX},100 ${line} ${lastX},100`;

  return (
    <>
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {target != null && (
          <line
            x1="0"
            x2="100"
            y1={yPct(target)}
            y2={yPct(target)}
            stroke={color}
            strokeWidth={1}
            strokeDasharray="3 3"
            strokeOpacity={0.4}
            vectorEffect="non-scaling-stroke"
          />
        )}
        <polygon points={area} fill={color} fillOpacity={0.1} />
        <polyline
          points={line}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {coords.map((c, i) => (
        <Tooltip key={i} content={tooltip(c.p)}>
          <span
            className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-1 ring-card"
            style={{ left: `${c.x}%`, top: `${c.y}%`, backgroundColor: color }}
          />
        </Tooltip>
      ))}
    </>
  );
}

/** Collapsible color/shape key — the timeline relies on color, so explain it. */
function TimelineLegend({
  t,
  hasShifts,
  hasBp,
}: {
  t: (key: string) => string;
  hasShifts: boolean;
  hasBp: boolean;
}) {
  const dot = (color: string) => (
    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
  );
  return (
    <details className="group border-t bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 font-medium">
        <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
        {t("timeline.legend.title")}
      </summary>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
        <span className="inline-flex items-center gap-1.5">
          {dot("var(--destructive)")} {t("timeline.legend.outOfRange")}
        </span>
        {hasShifts && (
          <>
            <span className="inline-flex items-center gap-1.5">
              <ShiftSwatch color="#d97706" /> {t("timeline.legend.shiftWatch")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShiftSwatch color="var(--destructive)" /> {t("timeline.legend.shiftAlert")}
            </span>
          </>
        )}
        {hasBp && (
          <>
            <span className="inline-flex items-center gap-1.5">
              {dot("#0d9488")} {t("timeline.legend.bpNormal")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              {dot("#eab308")} {t("timeline.legend.bpStage1")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              {dot("#d97706")} {t("timeline.legend.bpStage2")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              {dot("var(--destructive)")} {t("timeline.legend.bpCrisis")}
            </span>
          </>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-px shrink-0 bg-primary/50" /> {t("timeline.legend.today")}
        </span>
      </div>
    </details>
  );
}

/** Mimics a halo'd lab dot: faint ring around a neutral center. */
function ShiftSwatch({ color }: { color: string }) {
  return (
    <span className="relative flex size-3.5 shrink-0 items-center justify-center">
      <span
        className="absolute inset-0 rounded-full"
        style={{ backgroundColor: color, opacity: 0.3 }}
      />
      <span className="size-1.5 rounded-full bg-foreground/60" />
    </span>
  );
}

/** Per-reading systolic→diastolic bars, colored by hypertension stage. */
function BpLane({ points, pos }: { points: BpPoint[]; pos: (t: number) => number }) {
  const maxSys = Math.max(...points.map((p) => p.systolic), 180);
  const yLo = 40;
  const yHi = Math.max(maxSys + 10, 190);
  const yPct = (v: number) => ((yHi - v) / (yHi - yLo)) * 100;
  return (
    <>
      {points.map((p, i) => {
        const top = yPct(p.systolic);
        const bottom = yPct(p.diastolic);
        return (
          <Tooltip
            key={i}
            content={
              <>
                <span className="font-medium">
                  {p.systolic}/{p.diastolic}
                </span>{" "}
                · {formatDate(p.date)}
              </>
            }
          >
            <span
              className="absolute w-[3px] -translate-x-1/2 rounded-full ring-1 ring-card/60"
              style={{
                left: `${pos(ts(p.date))}%`,
                top: `${top}%`,
                height: `${Math.max(bottom - top, 1.5)}%`,
                backgroundColor: bpStageColor(p.systolic, p.diastolic),
              }}
            />
          </Tooltip>
        );
      })}
    </>
  );
}
