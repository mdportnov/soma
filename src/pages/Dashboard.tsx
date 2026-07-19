import * as React from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  CalendarRange,
  ChevronRight,
  ClipboardCheck,
  HeartPulse,
  LayoutDashboard,
  Pill,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Stethoscope,
  Syringe,
  TestTubes,
  TrendingDown,
} from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import { useI18n } from "@/lib/i18n";
import {
  countPanelsNeedingReview,
  getLatestPanelChanges,
  getProfile,
  getTimeline,
  listAllergies,
  listDiagnoses,
  listMedications,
  listPanels,
  listVaccines,
} from "@/db/repos";
import { buildDashboardDigest, type AttentionType } from "@/lib/dashboard-digest";
import { loadDashboardWidgets } from "@/lib/dashboard-prefs";
import {
  computeAntigen,
  countActionable,
  isGradedTier,
  VACCINE_SCHEDULE,
} from "@/lib/vaccine-schedule";
import { getConfiguredProvider } from "@/ai";
import { PageHeader } from "@/components/app/PageHeader";
import { Loading } from "@/components/app/Loading";
import { EmptyState } from "@/components/app/EmptyState";
import { GettingStarted } from "@/components/app/GettingStarted";
import { NotableChanges } from "@/components/app/NotableChanges";
import { HealthVerdict } from "@/components/app/HealthVerdict";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, todayISO } from "@/lib/utils";
import { settingsPath } from "@/lib/settings-navigation";

const ATTENTION_ICON: Record<AttentionType, typeof Activity> = {
  biomarker: TrendingDown,
  diagnosis: Stethoscope,
  medication: Pill,
  vaccine: Syringe,
  review: ClipboardCheck,
};

export function Dashboard() {
  const { t } = useI18n();
  const { profileId } = useApp();

  const { data, loading } = useQuery(async () => {
    const [
      panels,
      meds,
      diagnoses,
      allergies,
      vaccines,
      profile,
      timeline,
      latestChanges,
      reviewCount,
      aiProvider,
    ] = await Promise.all([
      listPanels(profileId),
      listMedications(profileId),
      listDiagnoses(profileId),
      listAllergies(profileId),
      listVaccines(profileId),
      getProfile(profileId),
      getTimeline(profileId),
      getLatestPanelChanges(profileId),
      countPanelsNeedingReview(profileId),
      getConfiguredProvider(),
    ]);
    return {
      panels,
      meds,
      diagnoses,
      allergies,
      vaccines,
      profile,
      timeline,
      latestChanges,
      reviewCount,
      aiConfigured: !!aiProvider,
    };
  }, [profileId]);

  // Dashboard layout prefs — re-read each mount (the page re-mounts on every
  // navigation), so a toggle in Settings reflects the next time it's opened.
  const widgets = React.useMemo(() => loadDashboardWidgets(), []);

  if (loading || !data) return <Loading />;

  const {
    panels,
    meds,
    diagnoses,
    allergies,
    vaccines,
    profile,
    timeline,
    latestChanges,
    reviewCount,
    aiConfigured,
  } = data;
  const latestPanel = panels[0] ?? null;
  const activeMeds = meds.filter((m) => !m.endDate);
  const recent = timeline.slice(0, 8);
  const isEmpty = timeline.length === 0;
  const hasComparable = !!latestChanges?.changes.some((c) => c.change != null);

  const today = todayISO();
  const vaccineViews = VACCINE_SCHEDULE.map((entry) =>
    computeAntigen(entry, profile?.birthDate ?? null, vaccines, today, isGradedTier(entry.tier)),
  );
  const vaccineActionable = countActionable(vaccineViews, vaccines, today);

  const digest = buildDashboardDigest(
    {
      today,
      latestChanges,
      diagnoses,
      medications: meds,
      allergies,
      reviewCount,
      vaccineActionable,
    },
    {
      biomarkers: (count) =>
        count === 1
          ? t("dashboard.attention.biomarkersOne")
          : t("dashboard.attention.biomarkersMany", { count: String(count) }),
      diagnoses: (count, names) =>
        count === 1
          ? t("dashboard.attention.diagnosesOne", { names })
          : t("dashboard.attention.diagnosesMany", { count: String(count), names }),
      medicationsEnding: (count, names) =>
        count === 1
          ? t("dashboard.attention.medsEndingOne", { names })
          : t("dashboard.attention.medsEndingMany", { count: String(count), names }),
      vaccines: (count) =>
        count === 1
          ? t("dashboard.attention.vaccinesOne")
          : t("dashboard.attention.vaccinesMany", { count: String(count) }),
      review: (count) =>
        count === 1
          ? t("dashboard.attention.reviewOne")
          : t("dashboard.attention.reviewMany", { count: String(count) }),
    },
  );

  const verdictMessage =
    digest.status === "calm"
      ? t("dashboard.verdict.calm")
      : digest.attentionCount === 1
        ? t("dashboard.verdict.attentionOne")
        : t("dashboard.verdict.attentionMany", { count: String(digest.attentionCount) });

  // The review queue keeps its dedicated card (with a CTA) below; it still counts
  // toward the verdict, so we drop only its row from the inline attention list.
  const attentionRows = digest.attention.filter((a) => a.type !== "review");

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

      {widgets.has("safetyBanner") && digest.severeAllergies.length > 0 && (
        <Link to="/allergies" className="mb-6 block">
          <div className="flex items-center gap-3 rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-destructive transition-colors hover:bg-destructive/15">
            <ShieldAlert className="size-5 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-semibold">{t("dashboard.safety.label")}:</span>
              {digest.severeAllergies.map((a) => (
                <span key={a.id} className="text-sm font-medium">
                  {a.allergen}
                  <span className="text-xs font-normal opacity-80">
                    {" "}
                    · {t(`allergySeverity.${a.severity}`)}
                  </span>
                </span>
              ))}
            </div>
            <ChevronRight className="size-4 shrink-0 opacity-60" />
          </div>
        </Link>
      )}

      <GettingStarted
        hasLabs={panels.length > 0}
        hasMeds={meds.length > 0}
        aiEnabled={aiConfigured}
      />

      {/* Floor for an over-customized dashboard: hiding every card would leave a
          blank screen, so point the way back to the toggles instead. */}
      {widgets.size === 0 && (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon={LayoutDashboard}
              title={t("dashboard.empty.title")}
              description={t("dashboard.empty.description")}
              action={
                <Link to={settingsPath("dashboard")}>
                  <Button size="sm" variant="outline">
                    <SlidersHorizontal /> {t("dashboard.empty.cta")}
                  </Button>
                </Link>
              }
            />
          </CardContent>
        </Card>
      )}

      {/* On a brand-new (empty) account the checklist is the hero — a green
          "all calm" verdict there is hollow, so show it only once data exists. */}
      {widgets.has("verdict") && !isEmpty && (
        <HealthVerdict status={digest.status} message={verdictMessage} className="mb-6" />
      )}

      {widgets.has("stats") && (
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
      )}

      {widgets.has("attention") && attentionRows.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t("dashboard.attention.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {attentionRows.map((item) => {
                const Icon = ATTENTION_ICON[item.type];
                return (
                  <li key={item.type}>
                    <Link
                      to={item.route}
                      className="flex items-center gap-3 py-2.5 transition-colors hover:bg-muted/40"
                    >
                      <div
                        className={
                          "flex size-9 shrink-0 items-center justify-center rounded-lg " +
                          (item.severity === "alert"
                            ? "bg-destructive/10 text-destructive"
                            : item.severity === "watch"
                              ? "bg-warning/15 text-warning"
                              : "bg-secondary text-secondary-foreground")
                        }
                      >
                        <Icon className="size-4" />
                      </div>
                      <span className="min-w-0 flex-1 truncate text-sm">{item.label}</span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {widgets.has("review") && reviewCount > 0 && (
        <Card className="mt-6 border-warning/40">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning/10">
              <ClipboardCheck className="size-4 text-warning" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t("needsReview.globalTitle")}</p>
              <p className="text-xs text-muted-foreground">
                {reviewCount === 1
                  ? t("needsReview.globalOne")
                  : t("needsReview.globalMany", { count: String(reviewCount) })}
              </p>
            </div>
            <Link to="/labs">
              <Button variant="outline" size="sm">
                {t("needsReview.globalCta")}
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {widgets.has("changes") && hasComparable && (
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

      {widgets.has("activity") && (
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
                  <div className="flex flex-wrap justify-center gap-2">
                    <Link to="/labs/import">
                      <Button size="sm">
                        <Sparkles /> {t("dashboard.importLab")}
                      </Button>
                    </Link>
                    <Link to="/labs/new">
                      <Button size="sm" variant="outline">
                        {t("dashboard.addLabResults")}
                      </Button>
                    </Link>
                  </div>
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
      )}
    </>
  );
}
