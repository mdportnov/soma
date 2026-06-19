import { Link } from "react-router-dom";
import { Activity, AlertTriangle, CalendarRange, HeartPulse, Pill, TestTubes } from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import { useI18n } from "@/lib/i18n";
import { getLatestPanelChanges, getTimeline, listMedications, listPanels } from "@/db/repos";
import { PageHeader } from "@/components/app/PageHeader";
import { Loading } from "@/components/app/Loading";
import { EmptyState } from "@/components/app/EmptyState";
import { NotableChanges } from "@/components/app/NotableChanges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

export function Dashboard() {
  const { t } = useI18n();
  const { profileId } = useApp();

  const { data, loading } = useQuery(async () => {
    const [panels, meds, timeline, latestChanges] = await Promise.all([
      listPanels(profileId),
      listMedications(profileId),
      getTimeline(profileId),
      getLatestPanelChanges(profileId),
    ]);
    return { panels, meds, timeline, latestChanges };
  }, [profileId]);

  if (loading || !data) return <Loading />;

  const { panels, meds, timeline, latestChanges } = data;
  const latestPanel = panels[0] ?? null;
  const activeMeds = meds.filter((m) => !m.endDate);
  const recent = timeline.slice(0, 8);
  const hasComparable = !!latestChanges?.changes.some((c) => c.change != null);

  const stats = [
    { label: t("dashboard.stats.labPanels"), value: panels.length, icon: TestTubes, to: "/labs" },
    {
      label: t("dashboard.stats.outOfRangeLatest"),
      value: latestPanel ? latestPanel.outOfRangeCount : "—",
      icon: AlertTriangle,
      to: latestPanel ? `/labs/${latestPanel.id}` : "/labs",
      alert: !!latestPanel && latestPanel.outOfRangeCount > 0,
    },
    {
      label: t("dashboard.stats.activeMedications"),
      value: activeMeds.length,
      icon: Pill,
      to: "/medications",
    },
    {
      label: t("dashboard.stats.lastLabDraw"),
      value: latestPanel ? formatDate(latestPanel.date) : "—",
      icon: Activity,
      to: latestPanel ? `/labs/${latestPanel.id}` : "/labs",
    },
  ];

  return (
    <>
      <PageHeader
        title={t("pages.dashboard.title")}
        description={t("pages.dashboard.description")}
        actions={
          <Link to="/emergency">
            <Button variant="outline">
              <HeartPulse /> {t("emergency.openCard")}
            </Button>
          </Link>
        }
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

      {hasComparable && (
        <div className="mt-6">
          <NotableChanges
            changes={latestChanges!.changes}
            title={t("insights.dashboardTitle")}
            description={t("insights.dashboardSince", {
              date: formatDate(latestChanges!.panel.date),
            })}
            limit={5}
          />
        </div>
      )}

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{t("dashboard.recentActivityTitle")}</CardTitle>
          <Link to="/timeline" className="text-xs font-medium text-primary hover:underline">
            {t("dashboard.fullTimeline")} →
          </Link>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <EmptyState
              icon={CalendarRange}
              title={t("dashboard.noRecordsTitle")}
              description={t("dashboard.recentActivity.description")}
              action={
                <Link to="/labs/new">
                  <Button size="sm">{t("dashboard.addLabResults")}</Button>
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
                    {e.kind === "lab_panel"
                      ? t("timeline.eventKinds.labs")
                      : t(`timeline.eventKinds.${e.kind}`)}
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
