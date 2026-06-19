import * as React from "react";
import { HeartPulse, Plus, Scale, Stethoscope, Target } from "lucide-react";
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useQuery } from "@/hooks/useQuery";
import { listBpLog, listSymptomLog, listWeightLog } from "@/db/repos";
import { Loading } from "@/components/app/Loading";
import { EmptyState } from "@/components/app/EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate, formatValue } from "@/lib/utils";
import { kgToLb, type UnitSystem } from "@/lib/units";
import { bpStageColor, isCrisis, isStage2 } from "@/lib/vitals";
import { buildWeightSeries, goalTs, type WeightGoal } from "@/lib/weightGoal";
import { useI18n } from "@/lib/i18n";

type FocusTab = "weight" | "bp" | "symptoms";
type RangeKey = "3m" | "6m" | "1y" | "all";

const RANGES: RangeKey[] = ["3m", "6m", "1y", "all"];
const RANGE_DAYS: Record<RangeKey, number> = { "3m": 90, "6m": 182, "1y": 365, all: Infinity };
const DAY = 86400000;
const SYS_C = "#dc2626";
const DIA_C = "#2563eb";
const SYNC = "journal-overview";
const PRIMARY = "var(--primary)";

function tsOf(iso: string): number {
  return new Date(`${iso.slice(0, 10)}T00:00:00`).getTime();
}

function minsOf(time: string | null): number {
  if (!time) return -1;
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function severityColor(s: number): string {
  if (s >= 7) return "#dc2626";
  if (s >= 4) return "#d97706";
  return "#16a34a";
}

const CHART_MARGIN = { top: 6, right: 14, bottom: 0, left: 0 };
const Y_WIDTH = 44;

/**
 * "Overview" tab of the Journal: weight, blood pressure and symptoms shown as
 * stacked panels sharing one time axis (recharts syncId → a synchronized
 * crosshair across all three), filtered by a single range control, with a
 * unified chronological activity log alongside.
 */
export function JournalOverview({
  profileId,
  unitSystem,
  targetWeightKg,
  goal,
  onOpenTab,
  onAdd,
  onEditGoal,
}: {
  profileId: number;
  unitSystem: UnitSystem;
  targetWeightKg: number | null;
  goal: WeightGoal | null;
  onOpenTab: (tab: FocusTab) => void;
  onAdd: (tab: FocusTab) => void;
  onEditGoal: () => void;
}) {
  const { t, lang } = useI18n();
  const { data, loading } = useQuery(async () => {
    const [weight, bp, symptoms] = await Promise.all([
      listWeightLog(profileId),
      listBpLog(profileId),
      listSymptomLog(profileId),
    ]);
    return { weight, bp, symptoms };
  }, [profileId]);
  const [range, setRange] = React.useState<RangeKey>("all");

  if (loading || !data) return <Loading />;
  const { weight, bp, symptoms } = data;

  const imperial = unitSystem === "imperial";
  const unitLabel = imperial ? "lb" : "kg";
  const toDisplay = (kg: number) => (imperial ? kgToLb(kg) : kg);

  if (weight.length === 0 && bp.length === 0 && symptoms.length === 0) {
    return (
      <EmptyState
        icon={Scale}
        title={t("journal.overview.emptyTitle")}
        description={t("journal.overview.emptyDescription")}
      />
    );
  }

  // Shared time window: every panel and the log are clamped to the same domain
  // so a given date lines up vertically across all of them.
  const allTs = [
    ...weight.map((r) => tsOf(r.date)),
    ...bp.map((r) => tsOf(r.date)),
    ...symptoms.map((r) => tsOf(r.date)),
  ];
  const maxTs = Math.max(...allTs);
  const minTs = Math.min(...allTs);
  // The selected range governs how far back we look (from the latest reading);
  // a dated weight goal extends the shared domain forward to its deadline so the
  // projection and target are in view. The synced panels stay aligned — the
  // other metrics simply have no data past "now".
  const dataEnd = maxTs;
  const windowStart = range === "all" ? minTs : Math.max(minTs, dataEnd - RANGE_DAYS[range] * DAY);
  const windowEnd = goal ? Math.max(dataEnd, goalTs(goal.targetDate)) : dataEnd;
  const domain: [number, number] = [
    windowStart,
    windowEnd === windowStart ? windowEnd + DAY : windowEnd,
  ];
  const inRange = (iso: string) => tsOf(iso) >= windowStart;

  const weightInRange = weight.filter((r) => inRange(r.date));
  const weightData = weightInRange
    .map((r) => ({ t: tsOf(r.date), date: r.date, value: toDisplay(r.weightKg) }))
    .sort((a, b) => a.t - b.t);
  // Actual weigh-ins + the goal's glide path drawn out to the (goal-extended)
  // domain end, i.e. the target deadline.
  const weightSeries = buildWeightSeries({
    actual: weightInRange,
    goal,
    toDisplay,
    planEndTs: domain[1],
  });
  const todayTs = goalTs(new Date().toISOString());
  // Include the goal's glide path (which descends to the target) in the y-range,
  // otherwise "auto" only spans recent weigh-ins and the projection is drawn
  // below the visible area.
  const weightYValues = weightSeries
    .flatMap((p) => [p.value, p.plan])
    .filter((v): v is number => v != null);
  const weightYDomain: [number | string, number | string] =
    goal && weightYValues.length
      ? (() => {
          const lo = Math.min(...weightYValues);
          const hi = Math.max(...weightYValues);
          const pad = Math.max((hi - lo) * 0.08, 0.5);
          return [Math.floor(lo - pad), Math.ceil(hi + pad)];
        })()
      : ["auto", "auto"];
  const bpData = bp
    .filter((r) => inRange(r.date))
    .map((r) => ({ t: tsOf(r.date), date: r.date, sys: r.systolic, dia: r.diastolic }))
    .sort((a, b) => a.t - b.t);
  const symptomData = symptoms
    .filter((r) => inRange(r.date))
    .map((r) => ({ t: tsOf(r.date), date: r.date, severity: r.severity, name: r.symptomName }));

  const targetDisplay = targetWeightKg != null ? toDisplay(targetWeightKg) : null;

  const xAxisProps = {
    dataKey: "t",
    type: "number" as const,
    domain,
    scale: "time" as const,
    allowDataOverflow: true,
    stroke: "var(--muted-foreground)",
    fontSize: 11,
    tickLine: false,
    minTickGap: 28,
  };
  // Compact month axis shown under every panel (e.g. "Jun 25" / "июн. 25").
  const monthFmt = (v: number) =>
    new Date(v).toLocaleDateString(lang === "ru" ? "ru-RU" : "en-GB", {
      month: "short",
      year: "2-digit",
    });

  // ── Weight summary: latest value + delta vs. previous in-range reading ──
  const wLast = weightData[weightData.length - 1];
  const wPrev = weightData[weightData.length - 2];
  const wDelta = wLast && wPrev ? wLast.value - wPrev.value : null;

  // ── Blood-pressure summary: latest reading + its stage badge ──
  const bpLastRow = bpData[bpData.length - 1];

  // ── Unified activity log (newest first) ──
  const logItems = [
    ...weight
      .filter((r) => inRange(r.date))
      .map((r) => ({
        key: `w${r.id}`,
        sort: tsOf(r.date),
        date: r.date,
        time: null as string | null,
        kind: "weight" as const,
        icon: Scale,
        color: PRIMARY,
        label: `${formatValue(toDisplay(r.weightKg), 1)} ${unitLabel}`,
        note: r.notes,
      })),
    ...bp
      .filter((r) => inRange(r.date))
      .map((r) => ({
        key: `b${r.id}`,
        sort: tsOf(r.date) + Math.max(0, minsOf(r.time)),
        date: r.date,
        time: r.time,
        kind: "bp" as const,
        icon: HeartPulse,
        color: bpStageColor(r.systolic, r.diastolic),
        label: `${r.systolic}/${r.diastolic}`,
        note:
          r.heartRateBpm != null
            ? t("journal.overview.pulse", { n: String(r.heartRateBpm) })
            : r.notes,
      })),
    ...symptoms
      .filter((r) => inRange(r.date))
      .map((r) => ({
        key: `s${r.id}`,
        sort: tsOf(r.date) + Math.max(0, minsOf(r.time)),
        date: r.date,
        time: r.time,
        kind: "symptom" as const,
        icon: Stethoscope,
        color: severityColor(r.severity),
        label: `${r.symptomName} · ${r.severity}`,
        note: r.notes,
      })),
  ].sort((a, b) => b.sort - a.sort);

  const logGroups: { date: string; items: typeof logItems }[] = [];
  for (const item of logItems) {
    const last = logGroups[logGroups.length - 1];
    if (last && last.date === item.date) last.items.push(item);
    else logGroups.push({ date: item.date, items: [item] });
  }

  const noData = <PanelEmpty text={t("journal.overview.noData")} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <div className="flex rounded-lg border p-0.5">
          {RANGES.map((r) => (
            <Button
              key={r}
              variant={range === r ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2.5"
              onClick={() => setRange(r)}
            >
              {t(`journal.overview.ranges.${r}`)}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {/* Weight */}
          <Panel
            title={t("journal.tabs.weight")}
            accent={PRIMARY}
            onOpen={() => onOpenTab("weight")}
            onAdd={() => onAdd("weight")}
            summary={
              <span className="flex items-center gap-2">
                {wLast && (
                  <span className="tabular-nums text-sm">
                    <span className="font-semibold">
                      {formatValue(wLast.value, 1)} {unitLabel}
                    </span>
                    {wDelta != null && wDelta !== 0 && (
                      <span
                        className={cn(
                          "ml-1.5 text-xs",
                          wDelta > 0 && "text-amber-600 dark:text-amber-500",
                        )}
                        style={wDelta < 0 ? { color: "var(--success)" } : undefined}
                      >
                        {wDelta < 0 ? "▼" : "▲"} {formatValue(Math.abs(wDelta), 1)}
                      </span>
                    )}
                  </span>
                )}
                <button
                  type="button"
                  onClick={onEditGoal}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Target className="size-3.5" />
                  {goal
                    ? `${formatValue(toDisplay(goal.targetKg), 1)} ${unitLabel}`
                    : t("weightGoal.set")}
                </button>
              </span>
            }
          >
            {weightData.length === 0 && !goal ? (
              noData
            ) : (
              <div className="h-[148px]">
                <ResponsiveContainer>
                  <LineChart
                    data={weightSeries}
                    margin={CHART_MARGIN}
                    syncId={SYNC}
                    syncMethod="value"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis {...xAxisProps} tickFormatter={monthFmt} axisLine={false} />
                    <YAxis
                      domain={weightYDomain}
                      allowDataOverflow
                      stroke="var(--muted-foreground)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      width={Y_WIDTH}
                      tickFormatter={(v) => formatValue(v)}
                    />
                    {!goal && targetDisplay != null && (
                      <ReferenceLine
                        y={targetDisplay}
                        stroke="var(--success)"
                        strokeDasharray="5 4"
                      />
                    )}
                    <Tooltip
                      cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0].payload as (typeof weightSeries)[number];
                        if (p.value == null && p.plan == null) return null;
                        return (
                          <TooltipCard date={p.date}>
                            {p.value != null && (
                              <span>
                                {formatValue(p.value, 1)} {unitLabel}
                              </span>
                            )}
                            {p.plan != null && (
                              <span style={{ color: "var(--success)" }}>
                                {p.value != null ? "  ·  " : ""}
                                {t("weightGoal.planLabel")} {formatValue(p.plan, 1)}
                              </span>
                            )}
                          </TooltipCard>
                        );
                      }}
                    />
                    {goal && (
                      <>
                        {todayTs > domain[0] && todayTs < domain[1] && (
                          <ReferenceLine
                            x={todayTs}
                            stroke="var(--muted-foreground)"
                            strokeDasharray="2 3"
                          />
                        )}
                        <Line
                          type="linear"
                          dataKey="plan"
                          stroke="var(--success)"
                          strokeWidth={1.5}
                          strokeDasharray="5 4"
                          dot={false}
                          connectNulls
                          isAnimationActive={false}
                        />
                        <ReferenceDot
                          x={goalTs(goal.targetDate)}
                          y={toDisplay(goal.targetKg)}
                          r={3.5}
                          fill="var(--success)"
                          stroke="var(--card)"
                          strokeWidth={2}
                        />
                      </>
                    )}
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={PRIMARY}
                      strokeWidth={2}
                      dot={{ r: 2.5 }}
                      connectNulls
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          {/* Blood pressure */}
          <Panel
            title={t("journal.tabs.bp")}
            accent={SYS_C}
            onOpen={() => onOpenTab("bp")}
            onAdd={() => onAdd("bp")}
            summary={
              bpLastRow && (
                <span className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums text-sm">
                    {bpLastRow.sys}/{bpLastRow.dia}
                  </span>
                  {isCrisis(bpLastRow.sys, bpLastRow.dia) ? (
                    <Badge variant="destructive">{t("bp.status.crisis")}</Badge>
                  ) : isStage2(bpLastRow.sys, bpLastRow.dia) ? (
                    <Badge variant="warning">{t("bp.status.stage2")}</Badge>
                  ) : null}
                </span>
              )
            }
          >
            {bpData.length === 0 ? (
              noData
            ) : (
              <div className="h-[148px]">
                <ResponsiveContainer>
                  <LineChart data={bpData} margin={CHART_MARGIN} syncId={SYNC} syncMethod="value">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis {...xAxisProps} tickFormatter={monthFmt} axisLine={false} />
                    <YAxis
                      domain={[40, 200]}
                      ticks={[40, 90, 140, 190]}
                      stroke="var(--muted-foreground)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      width={Y_WIDTH}
                    />
                    <ReferenceArea y1={140} y2={180} fill="#f59e0b" fillOpacity={0.08} />
                    <ReferenceArea y1={180} y2={200} fill="#dc2626" fillOpacity={0.1} />
                    <Tooltip
                      cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0].payload as (typeof bpData)[number];
                        return (
                          <TooltipCard date={p.date}>
                            {p.sys}/{p.dia}
                          </TooltipCard>
                        );
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="sys"
                      name={t("bp.systolic")}
                      stroke={SYS_C}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="dia"
                      name={t("bp.diastolic")}
                      stroke={DIA_C}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          {/* Symptoms */}
          <Panel
            title={t("journal.tabs.symptoms")}
            accent="#d97706"
            onOpen={() => onOpenTab("symptoms")}
            onAdd={() => onAdd("symptoms")}
            summary={
              symptomData.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {t("journal.overview.entries", { n: String(symptomData.length) })}
                </span>
              )
            }
          >
            {symptomData.length === 0 ? (
              noData
            ) : (
              <div className="h-[132px]">
                <ResponsiveContainer>
                  <ScatterChart margin={CHART_MARGIN} syncId={SYNC} syncMethod="value">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      {...xAxisProps}
                      tickFormatter={monthFmt}
                      axisLine={{ stroke: "var(--border)" }}
                    />
                    <YAxis
                      type="number"
                      dataKey="severity"
                      domain={[0, 10]}
                      ticks={[0, 5, 10]}
                      stroke="var(--muted-foreground)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      width={Y_WIDTH}
                    />
                    <Tooltip
                      cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0].payload as (typeof symptomData)[number];
                        return (
                          <TooltipCard date={p.date}>
                            {p.name} · {p.severity}
                          </TooltipCard>
                        );
                      }}
                    />
                    <Scatter data={symptomData} isAnimationActive={false}>
                      {symptomData.map((p, i) => (
                        <Cell key={i} fill={severityColor(p.severity)} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
        </div>

        {/* Activity log */}
        <aside className="lg:col-span-1">
          <div className="rounded-xl border bg-card">
            <div className="border-b px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("journal.overview.activity")}
            </div>
            {logGroups.length === 0 ? (
              <PanelEmpty text={t("journal.overview.noData")} />
            ) : (
              <div className="max-h-[460px] overflow-y-auto">
                {logGroups.map((g) => (
                  <div key={g.date}>
                    <div className="sticky top-0 z-10 bg-card/95 px-4 py-1.5 text-[11px] font-medium text-muted-foreground backdrop-blur">
                      {formatDate(g.date)}
                    </div>
                    <ul className="px-2 pb-1">
                      {g.items.map((item) => {
                        const Icon = item.icon;
                        return (
                          <li
                            key={item.key}
                            className="flex items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/50"
                          >
                            <span
                              className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full"
                              style={{
                                backgroundColor: `color-mix(in srgb, ${item.color} 16%, transparent)`,
                              }}
                            >
                              <Icon className="size-3" style={{ color: item.color }} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm tabular-nums">
                                <span className="font-medium">{item.label}</span>
                                {item.time && (
                                  <span className="ml-1.5 text-xs text-muted-foreground">
                                    {item.time}
                                  </span>
                                )}
                              </p>
                              {item.note && (
                                <p className="truncate text-xs text-muted-foreground">
                                  {item.note}
                                </p>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Panel({
  title,
  accent,
  onOpen,
  onAdd,
  summary,
  children,
}: {
  title: string;
  accent: string;
  onOpen: () => void;
  onAdd?: () => void;
  summary?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center gap-1.5 text-sm font-semibold transition-colors hover:text-primary"
        >
          <span className="size-2 rounded-full" style={{ backgroundColor: accent }} />
          {title}
        </button>
        <div className="flex items-center gap-2">
          {summary}
          {onAdd && (
            <button
              type="button"
              onClick={onAdd}
              aria-label={t("common.add")}
              title={t("common.add")}
              className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Plus className="size-4" />
            </button>
          )}
        </div>
      </div>
      <div className="px-2 pb-2 pt-1">{children}</div>
    </div>
  );
}

function PanelEmpty({ text }: { text: string }) {
  return (
    <div className="flex h-[120px] items-center justify-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}

function TooltipCard({ date, children }: { date: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-xs shadow-md">
      <p className="font-medium tabular-nums">{children}</p>
      <p className="text-muted-foreground">{formatDate(date)}</p>
    </div>
  );
}
