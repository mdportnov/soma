import * as React from "react";
import type { Vaccine } from "@/db/schema";
import { Tooltip } from "@/components/ui/tooltip";
import { TimelinePanel } from "./TimelinePanel";
import { useI18n } from "@/lib/i18n";
import { OVERLAY_COLORS } from "./TrendChart";
import { cn, formatDate, formatDateObject, todayISO } from "@/lib/utils";

const DAY = 86400000;
const PX_PER_MONTH = 64;
const ROW_H = 30;
const AXIS_H = 24;
const GUTTER = "w-24 sm:w-32";

function ts(iso: string): number {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime();
}

type Lane = { name: string; color: string; records: Vaccine[] };

/**
 * Chronological vaccination history: one lane per vaccine, a dot per dose
 * (series connected), and a faded validity bar running to the certificate's
 * expiry so coverage windows — and lapses — are visible at a glance. The name
 * gutter stays fixed while the time track scrolls. Complements the WHO-schedule
 * coverage view (VaccineCalendar), which answers "what's due" rather than "what
 * I got, when". Renders nothing when there are no records.
 */
export function VaccineTimeline({
  vaccines,
  storageKey,
  onSelect,
}: {
  vaccines: Vaccine[];
  /** localStorage key to remember the collapsed state. */
  storageKey?: string;
  onSelect?: (v: Vaccine) => void;
}) {
  const { t, lang } = useI18n();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [now] = React.useState(() => Date.now());
  const today = todayISO();

  const lanes = React.useMemo<Lane[]>(() => {
    const byName = new Map<string, Vaccine[]>();
    for (const v of vaccines) {
      const list = byName.get(v.vaccineName) ?? [];
      list.push(v);
      byName.set(v.vaccineName, list);
    }
    return [...byName.entries()]
      .map(([name, records]) => ({
        name,
        records: [...records].sort((a, b) => ts(a.date) - ts(b.date)),
      }))
      .sort((a, b) => ts(a.records[0].date) - ts(b.records[0].date) || a.name.localeCompare(b.name))
      .map((lane, i) => ({ ...lane, color: OVERLAY_COLORS[i % OVERLAY_COLORS.length] }));
  }, [vaccines]);

  // Time domain spans the actual shots (not far-future expiries, which would
  // squash the history); validity bars clamp to the visible right edge.
  const { start, span, months } = React.useMemo(() => {
    const dates = vaccines.map((v) => ts(v.date));
    const min = Math.min(...dates, now);
    const max = Math.max(...dates, now);
    const s = min - 20 * DAY;
    const e = max + 20 * DAY;
    const sp = Math.max(e - s, DAY);
    return { start: s, span: sp, months: sp / (30.44 * DAY) };
  }, [vaccines, now]);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [lanes.length]);

  if (lanes.length === 0) return null;

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
            : formatDateObject(cursor, locale, { month: "short", timeZone: "UTC" }),
      });
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    i++;
  }

  const trackWidth = `max(100%, ${Math.round(months * PX_PER_MONTH)}px)`;

  return (
    <TimelinePanel title={t("vaccines.timeline.title")} storageKey={storageKey}>
      <div className="flex">
        {/* fixed name gutter */}
        <div className={cn("shrink-0 border-r", GUTTER)}>
          <div style={{ height: AXIS_H }} />
          {lanes.map((lane) => (
            <div
              key={lane.name}
              className="flex items-center gap-1.5 px-2"
              style={{ height: ROW_H }}
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: lane.color }}
              />
              <span
                className="min-w-0 flex-1 truncate text-[11px] font-medium text-muted-foreground"
                title={lane.name}
              >
                {lane.name}
              </span>
            </div>
          ))}
        </div>

        {/* scrolling time track */}
        <div ref={scrollRef} className="flex-1 overflow-x-auto">
          <div className="relative" style={{ width: trackWidth }}>
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

            {lanes.map((lane) => {
              const dots = lane.records.map((v) => frac(ts(v.date)) * 100);
              const lineLeft = Math.min(...dots);
              const lineRight = Math.max(...dots);
              return (
                <div key={lane.name} className="relative" style={{ height: ROW_H }}>
                  {/* series connector */}
                  {lane.records.length > 1 && (
                    <span
                      className="absolute top-1/2 h-px -translate-y-1/2"
                      style={{
                        left: `${lineLeft}%`,
                        width: `${lineRight - lineLeft}%`,
                        backgroundColor: lane.color,
                        opacity: 0.4,
                      }}
                    />
                  )}
                  {/* validity bars (date → expiry, clamped to view) */}
                  {lane.records.map((v) => {
                    if (!v.expiresAt) return null;
                    const x1 = frac(ts(v.date)) * 100;
                    const x2 = Math.min(frac(ts(v.expiresAt)) * 100, 100);
                    if (x2 <= x1) return null;
                    const expired = v.expiresAt < today;
                    return (
                      <span
                        key={`val-${v.id}`}
                        className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full"
                        style={{
                          left: `${x1}%`,
                          width: `${x2 - x1}%`,
                          backgroundColor: expired ? "var(--destructive)" : lane.color,
                          opacity: expired ? 0.3 : 0.18,
                        }}
                      />
                    );
                  })}
                  {/* dose dots */}
                  {lane.records.map((v) => {
                    const x = frac(ts(v.date)) * 100;
                    const expired = v.expiresAt != null && v.expiresAt < today;
                    const meta: { label: string; value: React.ReactNode }[] = [];
                    const lot = [v.manufacturer, v.batchNumber].filter(Boolean).join(" / ");
                    if (lot)
                      meta.push({ label: t("vaccines.table.manufacturerBatch"), value: lot });
                    if (v.administeredBy)
                      meta.push({
                        label: t("vaccines.table.administeredBy"),
                        value: v.administeredBy,
                      });
                    if (v.country)
                      meta.push({ label: t("vaccines.table.country"), value: v.country });
                    if (v.expiresAt)
                      meta.push({
                        label: t("vaccines.table.expires"),
                        value: (
                          <span className={cn("tabular-nums", expired && "text-destructive")}>
                            {formatDate(v.expiresAt)}
                            {expired && ` · ${t("vaccines.expired")}`}
                          </span>
                        ),
                      });
                    return (
                      <Tooltip
                        key={v.id}
                        content={
                          <div className="space-y-1">
                            <div className="font-semibold text-pretty">{v.vaccineName}</div>
                            <div className="text-muted-foreground tabular-nums">
                              {formatDate(v.date)}
                              {v.dose != null &&
                                ` · ${t("vaccines.calendar.doseN", { n: String(v.dose) })}`}
                            </div>
                            {meta.length > 0 && (
                              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 border-t border-border pt-1">
                                {meta.map((row) => (
                                  <React.Fragment key={row.label}>
                                    <dt className="whitespace-nowrap text-muted-foreground">
                                      {row.label}
                                    </dt>
                                    <dd className="min-w-0">{row.value}</dd>
                                  </React.Fragment>
                                ))}
                              </dl>
                            )}
                          </div>
                        }
                      >
                        <button
                          type="button"
                          aria-label={`${v.vaccineName} — ${formatDate(v.date)}`}
                          onClick={() => onSelect?.(v)}
                          className={cn(
                            "absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card transition-transform hover:scale-125",
                            onSelect && "cursor-pointer",
                          )}
                          style={{ left: `${x}%`, backgroundColor: lane.color }}
                        />
                      </Tooltip>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </TimelinePanel>
  );
}
