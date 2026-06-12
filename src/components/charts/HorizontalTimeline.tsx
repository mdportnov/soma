import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { TimelineEvent } from "@/db/repos";
import { OVERLAY_COLORS } from "./TrendChart";
import { cn, formatDate } from "@/lib/utils";

const DAY = 86400000;

function ts(iso: string): number {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime();
}

const LANES: { kind: TimelineEvent["kind"]; label: string; dot: string }[] = [
  { kind: "lab_panel", label: "Labs", dot: "bg-primary" },
  { kind: "visit", label: "Visits", dot: "bg-blue-500" },
  { kind: "diagnosis", label: "Diagnoses", dot: "bg-amber-500" },
  { kind: "allergy", label: "Allergies", dot: "bg-rose-500" },
  { kind: "vaccine", label: "Vaccines", dot: "bg-violet-500" },
  { kind: "symptom", label: "Symptoms", dot: "bg-orange-500" },
  { kind: "imaging", label: "Imaging", dot: "bg-slate-500" },
];

/**
 * All health events on a single horizontal time scale (§6):
 * dots for labs/visits/diagnoses, duration bars for medication periods.
 */
export function HorizontalTimeline({
  events,
  rangeMonths,
}: {
  events: TimelineEvent[];
  rangeMonths: number | null; // null = all time
}) {
  const navigate = useNavigate();
  // Captured once per mount: keeps render pure and positions stable.
  const [now] = useState(() => Date.now());

  const allTs = events.map((e) => ts(e.date));
  const dataMin = allTs.length ? Math.min(...allTs) : now - 180 * DAY;
  const start = rangeMonths ? now - rangeMonths * 30.44 * DAY : dataMin - 14 * DAY;
  const end = now + 14 * DAY;
  const span = end - start;

  const pos = (t: number) => ((t - start) / span) * 100;

  // Month tick marks
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

  const meds = events.filter((e) => e.kind === "medication");
  const visible = (t: number) => t >= start && t <= end;

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

  return (
    <div className="rounded-xl border bg-card p-4">
      {/* Tick row */}
      <div className="relative ml-24 h-5 border-b">
        {ticks.map((tick) => (
          <span
            key={tick.t}
            className="absolute -translate-x-1/2 text-[10px] text-muted-foreground"
            style={{ left: `${pos(tick.t)}%` }}
          >
            {tick.label}
          </span>
        ))}
      </div>

      {/* Event lanes */}
      {LANES.map((lane) => {
        const laneEvents = events.filter((e) => e.kind === lane.kind && visible(ts(e.date)));
        return (
          <div key={lane.kind} className="flex items-center border-b border-dashed last:border-0">
            <span className="w-24 shrink-0 py-3 pr-3 text-right text-[11px] font-medium text-muted-foreground">
              {lane.label}
            </span>
            <div className="relative h-9 flex-1">
              {ticks.map((tick) => (
                <span
                  key={tick.t}
                  className="absolute top-0 h-full w-px bg-border/60"
                  style={{ left: `${pos(tick.t)}%` }}
                />
              ))}
              {laneEvents.map((e) => (
                <button
                  key={`${e.kind}-${e.id}`}
                  title={`${e.title} — ${formatDate(e.date)}`}
                  onClick={() => navigate(eventTarget(e))}
                  className={cn(
                    "absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full ring-2 ring-card transition-transform hover:scale-150",
                    lane.dot,
                    e.kind === "lab_panel" && e.outOfRangeCount > 0 && "bg-destructive",
                  )}
                  style={{ left: `${pos(ts(e.date))}%` }}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* Medication duration bars */}
      {meds.map((m, i) => {
        if (m.kind !== "medication") return null;
        const mStart = ts(m.date);
        const mEnd = m.endDate ? ts(m.endDate) : now;
        if (mEnd < start || mStart > end) return null;
        const x1 = Math.max(pos(mStart), 0);
        const x2 = Math.min(pos(mEnd), 100);
        const color = OVERLAY_COLORS[i % OVERLAY_COLORS.length];
        return (
          <div key={`med-${m.id}`} className="flex items-center">
            <span
              className="w-24 shrink-0 truncate py-1.5 pr-3 text-right text-[11px] font-medium text-muted-foreground"
              title={m.title}
            >
              {m.title}
            </span>
            <div className="relative h-6 flex-1">
              <button
                title={`${m.title}${m.subtitle ? ` · ${m.subtitle}` : ""} — ${formatDate(m.date)} → ${m.endDate ? formatDate(m.endDate) : "now"}`}
                onClick={() => navigate("/medications")}
                className="absolute top-1/2 h-2.5 -translate-y-1/2 cursor-pointer rounded-full transition-opacity hover:opacity-80"
                style={{
                  left: `${x1}%`,
                  width: `${Math.max(x2 - x1, 0.6)}%`,
                  backgroundColor: color,
                  opacity: 0.75,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
