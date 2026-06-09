import { Link } from "react-router-dom";
import { Activity, AlertTriangle, CalendarRange, Pill, TestTubes } from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import { getTimeline, listMedications, listPanels } from "@/db/repos";
import { PageHeader } from "@/components/app/PageHeader";
import { Loading } from "@/components/app/Loading";
import { EmptyState } from "@/components/app/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

export function Dashboard() {
  const { profileId } = useApp();

  const { data, loading } = useQuery(async () => {
    const [panels, meds, timeline] = await Promise.all([
      listPanels(profileId),
      listMedications(profileId),
      getTimeline(profileId),
    ]);
    return { panels, meds, timeline };
  }, [profileId]);

  if (loading || !data) return <Loading />;

  const { panels, meds, timeline } = data;
  const latestPanel = panels[0] ?? null;
  const activeMeds = meds.filter((m) => !m.endDate);
  const recent = timeline.slice(0, 8);

  const stats = [
    { label: "Lab panels", value: panels.length, icon: TestTubes, to: "/labs" },
    {
      label: "Out of range (latest panel)",
      value: latestPanel ? latestPanel.outOfRangeCount : "—",
      icon: AlertTriangle,
      to: latestPanel ? `/labs/${latestPanel.id}` : "/labs",
      alert: !!latestPanel && latestPanel.outOfRangeCount > 0,
    },
    { label: "Active medications", value: activeMeds.length, icon: Pill, to: "/medications" },
    {
      label: "Last lab draw",
      value: latestPanel ? formatDate(latestPanel.date) : "—",
      icon: Activity,
      to: latestPanel ? `/labs/${latestPanel.id}` : "/labs",
    },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your health at a glance — local, private, yours."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} to={s.to}>
            <Card className="transition-colors hover:bg-muted/40">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
                  <s.icon className="size-4 text-secondary-foreground" />
                </div>
                <div className="min-w-0">
                  <p
                    className={
                      "truncate text-lg font-semibold " + (s.alert ? "text-destructive" : "")
                    }
                  >
                    {s.value}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Recent activity</CardTitle>
          <Link to="/timeline" className="text-xs font-medium text-primary hover:underline">
            Full timeline →
          </Link>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <EmptyState
              icon={CalendarRange}
              title="No records yet"
              description="Add your first lab panel, medication or doctor visit to get started."
              action={
                <Link to="/labs/new">
                  <Button size="sm">Add lab results</Button>
                </Link>
              }
            />
          ) : (
            <ul className="divide-y">
              {recent.map((e) => (
                <li key={`${e.kind}-${e.id}`} className="flex items-center gap-3 py-2.5">
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">
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
                  {e.subtitle && (
                    <span className="hidden truncate text-xs text-muted-foreground sm:block">
                      {e.subtitle}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
