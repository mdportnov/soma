import * as React from "react";
import { CalendarRange, MoveHorizontal, Search, SlidersHorizontal } from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import {
  getPanelShiftSeverities,
  getProfile,
  getTimeline,
  listBpLog,
  listWeightLog,
} from "@/db/repos";
import { PageHeader } from "@/components/app/PageHeader";
import { Loading } from "@/components/app/Loading";
import { EmptyState } from "@/components/app/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  EnrichedTimeline,
  LAYER_COLOR,
  type TimelineLayer,
} from "@/components/charts/EnrichedTimeline";
import { cn, formatDate } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const ALL_LAYERS = Object.keys(LAYER_COLOR) as TimelineLayer[];
const LAYERS_KEY = "soma.timeline.layers";

function loadLayers(): Set<TimelineLayer> | null {
  try {
    const raw = localStorage.getItem(LAYERS_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw) as string[];
    return new Set(arr.filter((x): x is TimelineLayer => (ALL_LAYERS as string[]).includes(x)));
  } catch {
    return null;
  }
}

function useRanges(t: ReturnType<typeof useI18n>["t"]) {
  return React.useMemo(
    () =>
      [
        { label: t("timeline.ranges.sixMonths"), months: 6 },
        { label: t("timeline.ranges.oneYear"), months: 12 },
        { label: t("timeline.ranges.twoYears"), months: 24 },
        { label: t("timeline.ranges.all"), months: null },
      ] as const,
    [t],
  );
}

export function Timeline() {
  const { profileId } = useApp();
  const { t } = useI18n();
  const ranges = useRanges(t);
  const [range, setRange] = React.useState<number | null>(12);
  const [filter, setFilter] = React.useState("");
  const [allSymptoms, setAllSymptoms] = React.useState(false);
  const [enabled, setEnabled] = React.useState<Set<TimelineLayer>>(
    () => loadLayers() ?? new Set(ALL_LAYERS),
  );

  React.useEffect(() => {
    localStorage.setItem(LAYERS_KEY, JSON.stringify([...enabled]));
  }, [enabled]);

  const { data, loading } = useQuery(async () => {
    const [events, weight, bp, profile, shifts] = await Promise.all([
      getTimeline(profileId),
      listWeightLog(profileId),
      listBpLog(profileId),
      getProfile(profileId),
      getPanelShiftSeverities(profileId),
    ]);
    return { events, weight, bp, profile, shifts };
  }, [profileId]);

  // Daily symptom entries flood the timeline; show only severity ≥ 6 unless toggled.
  const filtered = React.useMemo(() => {
    if (!data) return [];
    const q = filter.trim().toLowerCase();
    return data.events.filter((e) => {
      if (!allSymptoms && e.kind === "symptom" && e.severity < 6) return false;
      if (!q) return true;
      return e.title.toLowerCase().includes(q) || (e.subtitle ?? "").toLowerCase().includes(q);
    });
  }, [data, filter, allSymptoms]);

  const hiddenSymptoms = React.useMemo(
    () => (data?.events ?? []).filter((e) => e.kind === "symptom" && e.severity < 6).length,
    [data],
  );

  if (loading || !data) return <Loading />;

  const { events, weight, bp, profile, shifts } = data;

  // A layer chip only appears when there is data behind it.
  const available = new Set<TimelineLayer>();
  for (const e of events) available.add(e.kind);
  if (weight.length) available.add("weight");
  if (bp.length) available.add("bp");
  const layerChips = ALL_LAYERS.filter((l) => available.has(l));

  const labels: Record<TimelineLayer, string> = {
    lab_panel: t("timeline.layers.lab_panel"),
    medication: t("timeline.layers.medication"),
    weight: t("timeline.layers.weight"),
    bp: t("timeline.layers.bp"),
    symptom: t("timeline.layers.symptom"),
    visit: t("timeline.layers.visit"),
    diagnosis: t("timeline.layers.diagnosis"),
    vaccine: t("timeline.layers.vaccine"),
    allergy: t("timeline.layers.allergy"),
    imaging: t("timeline.layers.imaging"),
  };

  const toggle = (layer: TimelineLayer) =>
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });

  const hasVisibleData = events.length > 0 || weight.length > 0 || bp.length > 0;

  return (
    <>
      <PageHeader
        title={t("timeline.title")}
        description={t("timeline.description")}
        actions={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t("search.timelineFilter")}
                className="h-7 w-44 pl-8 text-xs"
              />
            </div>
            <div className="flex rounded-lg border p-0.5">
              {ranges.map((r) => (
                <Button
                  key={r.label}
                  variant={range === r.months ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 px-2.5"
                  onClick={() => setRange(r.months)}
                >
                  {r.label}
                </Button>
              ))}
            </div>
          </>
        }
      />

      {!hasVisibleData ? (
        <EmptyState
          icon={CalendarRange}
          title={t("timeline.emptyTitle")}
          description={t("timeline.emptyDescription")}
        />
      ) : (
        <>
          {/* Layer toggles — the "build your own timeline" control. */}
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <SlidersHorizontal className="size-3.5" /> {t("timeline.layersTitle")}
            </span>
            {layerChips.map((layer) => {
              const on = enabled.has(layer);
              return (
                <button
                  key={layer}
                  onClick={() => toggle(layer)}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                    on ? "border-transparent text-white" : "text-muted-foreground hover:bg-muted",
                  )}
                  style={on ? { backgroundColor: LAYER_COLOR[layer] } : undefined}
                >
                  <span
                    className="size-2 rounded-full"
                    style={{
                      backgroundColor: on ? "rgba(255,255,255,0.9)" : LAYER_COLOR[layer],
                    }}
                  />
                  {labels[layer]}
                </button>
              );
            })}
          </div>

          {hiddenSymptoms > 0 && enabled.has("symptom") && (
            <p className="mb-2 text-xs text-muted-foreground">
              {allSymptoms ? (
                <button
                  className="text-primary hover:underline"
                  onClick={() => setAllSymptoms(false)}
                >
                  {t("timeline.hideMinorSymptoms")}
                </button>
              ) : (
                <>
                  {t("timeline.symptomThreshold", { count: String(hiddenSymptoms) })}{" "}
                  <button
                    className="text-primary hover:underline"
                    onClick={() => setAllSymptoms(true)}
                  >
                    {t("timeline.showAllSymptoms")}
                  </button>
                </>
              )}
            </p>
          )}

          {range === null && (
            <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <MoveHorizontal className="size-3.5" /> {t("timeline.scrollHint")}
            </p>
          )}

          <EnrichedTimeline
            events={filtered}
            weight={weight}
            bp={bp}
            rangeMonths={range}
            enabled={enabled}
            weightTargetKg={profile?.targetWeightKg ?? null}
            shiftByPanel={shifts}
            labels={labels}
          />

          {enabled.has("lab_panel") && [...shifts.values()].some((s) => s.severity !== "info") && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="inline-block size-2.5 rounded-full bg-destructive/30 ring-1 ring-destructive/50" />
              {t("timeline.shiftHint")}
            </p>
          )}

          <h2 className="mb-2 mt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("timeline.allEvents")}
          </h2>
          <div className="rounded-xl border bg-card">
            <ul className="divide-y">
              {filtered.map((e) => (
                <li key={`${e.kind}-${e.id}`} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">
                    {formatDate(e.date)}
                  </span>
                  <Badge
                    variant={
                      e.kind === "lab_panel"
                        ? "default"
                        : e.kind === "medication"
                          ? "success"
                          : e.kind === "diagnosis"
                            ? "warning"
                            : "secondary"
                    }
                  >
                    {e.kind === "lab_panel"
                      ? t("timeline.eventKinds.labs")
                      : t(`timeline.eventKinds.${e.kind}`)}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-sm">{e.title}</span>
                  {e.kind === "medication" && (
                    <span className="text-xs text-muted-foreground">
                      → {e.endDate ? formatDate(e.endDate) : t("timeline.now")}
                    </span>
                  )}
                  {e.kind === "lab_panel" && e.outOfRangeCount > 0 && (
                    <Badge variant="warning">
                      {e.outOfRangeCount} {t("timeline.outOfRange")}
                    </Badge>
                  )}
                  {e.subtitle && (
                    <span className="hidden max-w-48 truncate text-xs text-muted-foreground lg:block">
                      {e.subtitle}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </>
  );
}
