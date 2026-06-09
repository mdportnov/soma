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

const RANGES = [
  { label: "6M", months: 6 },
  { label: "1Y", months: 12 },
  { label: "2Y", months: 24 },
  { label: "All", months: null },
] as const;

export function Timeline() {
  const { profileId } = useApp();
  const [range, setRange] = React.useState<number | null>(12);
  const { data: events, loading } = useQuery(() => getTimeline(profileId), [profileId]);

  if (loading || !events) return <Loading />;

  return (
    <>
      <PageHeader
        title="Timeline"
        description="Labs, visits, diagnoses and medication periods on one time scale."
        actions={
          <div className="flex rounded-lg border p-0.5">
            {RANGES.map((r) => (
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
          title="Timeline is empty"
          description="Events appear here as you add labs, medications, visits and diagnoses."
        />
      ) : (
        <>
          <HorizontalTimeline events={events} rangeMonths={range} />

          <h2 className="mb-2 mt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            All events
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
                    {e.kind === "lab_panel" ? "labs" : e.kind}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-sm">{e.title}</span>
                  {e.kind === "medication" && (
                    <span className="text-xs text-muted-foreground">
                      → {e.endDate ? formatDate(e.endDate) : "now"}
                    </span>
                  )}
                  {e.kind === "lab_panel" && e.outOfRangeCount > 0 && (
                    <Badge variant="warning">{e.outOfRangeCount} out of range</Badge>
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
