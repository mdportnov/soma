import * as React from "react";
import { CalendarRange } from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import { getTimeline } from "@/db/repos";
import { PageHeader } from "@/components/app/PageHeader";
import { Loading } from "@/components/app/Loading";
import { EmptyState } from "@/components/app/EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HorizontalTimeline } from "@/components/charts/HorizontalTimeline";
import { formatDate } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

function useRanges(t: ReturnType<typeof useI18n>["t"]) {
  return React.useMemo(() => [
    { label: t("timeline.ranges.sixMonths"), months: 6 },
    { label: t("timeline.ranges.oneYear"), months: 12 },
    { label: t("timeline.ranges.twoYears"), months: 24 },
    { label: t("timeline.ranges.all"), months: null },
  ] as const, [t]);
}

export function Timeline() {
  const { profileId } = useApp();
  const { t } = useI18n();
  const ranges = useRanges(t);
  const [range, setRange] = React.useState<number | null>(12);
  const { data: events, loading } = useQuery(() => getTimeline(profileId), [profileId]);

  if (loading || !events) return <Loading />;

  return (
    <>
      <PageHeader
        title={t("timeline.title")}
        description={t("timeline.description")}
        actions={
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
        }
      />

      {events.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title={t("timeline.emptyTitle")}
          description={t("timeline.emptyDescription")}
        />
      ) : (
        <>
          <HorizontalTimeline events={events} rangeMonths={range} />

          <h2 className="mb-2 mt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("timeline.allEvents")}
          </h2>
          <div className="rounded-xl border bg-card">
            <ul className="divide-y">
              {events.map((e) => (
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
                    {e.kind === "lab_panel" ? t("timeline.eventKinds.labs") : t(`timeline.eventKinds.${e.kind}`)}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-sm">{e.title}</span>
                  {e.kind === "medication" && (
                    <span className="text-xs text-muted-foreground">
                      → {e.endDate ? formatDate(e.endDate) : t("timeline.now")}
                    </span>
                  )}
                  {e.kind === "lab_panel" && e.outOfRangeCount > 0 && (
                    <Badge variant="warning">{e.outOfRangeCount} {t("timeline.outOfRange")}</Badge>
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
