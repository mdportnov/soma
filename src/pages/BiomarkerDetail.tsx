import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, Info, LineChart } from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import { getBiomarker, getBiomarkerSeries, listMedications, listSymptomLog } from "@/db/repos";
import { getBiomarkerInfo } from "@/content/biomarker-info";
import { PageHeader } from "@/components/app/PageHeader";
import { crumbs } from "@/app/nav";
import { Loading } from "@/components/app/Loading";
import { EmptyState } from "@/components/app/EmptyState";
import { FlagBadge } from "@/components/app/FlagBadge";
import { DeltaBadge } from "@/components/app/DeltaBadge";
import { AiInterpretation } from "@/components/app/AiInterpretation";
import { changeBetween, type ValuePoint } from "@/lib/insights";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TrendChart,
  OVERLAY_COLORS,
  type MedOverlay,
  type SymptomOverlay,
} from "@/components/charts/TrendChart";
import { cn, formatDate, formatValue } from "@/lib/utils";

export function BiomarkerDetail() {
  const { id } = useParams();
  const { profileId } = useApp();
  const { t, lang } = useI18n();
  const biomarkerId = Number(id);
  const [activeOverlays, setActiveOverlays] = React.useState<Set<number>>(new Set());
  const [showSymptoms, setShowSymptoms] = React.useState(false);

  const { data, loading } = useQuery(async () => {
    const [bio, series, meds, symptoms] = await Promise.all([
      getBiomarker(biomarkerId),
      getBiomarkerSeries(profileId, biomarkerId),
      listMedications(profileId),
      listSymptomLog(profileId),
    ]);
    return { bio, series, meds, symptoms };
  }, [profileId, biomarkerId]);

  if (loading || !data) return <Loading />;
  if (!data.bio)
    return <EmptyState icon={LineChart} title={t("biomarkerDetail.biomarkerNotFound")} />;

  const { bio, series, meds, symptoms } = data;
  const info = getBiomarkerInfo(bio.canonicalName, lang);

  const toPoint = (p: (typeof series)[number]): ValuePoint => ({
    value: p.value,
    unit: p.unit,
    date: p.date,
    outOfRange: p.outOfRange,
    flag: p.flag as ValuePoint["flag"],
  });
  // change[i] = move from the prior reading into series[i] (null for the first).
  const seriesChanges = series.map((p, i) =>
    i === 0 ? null : changeBetween(toPoint(series[i - 1]), toPoint(p), bio),
  );

  const overlays: MedOverlay[] = meds
    .filter((m) => activeOverlays.has(m.id))
    .map((m, i) => ({
      id: m.id,
      name: m.name,
      start: m.startDate,
      end: m.endDate,
      color: OVERLAY_COLORS[i % OVERLAY_COLORS.length],
    }));

  const symptomOverlays: SymptomOverlay[] = showSymptoms
    ? symptoms
        .filter((s) => s.severity >= 3)
        .map((s) => ({
          date: s.date,
          name: s.symptomName,
          severity: s.severity,
          notes: s.notes,
        }))
    : [];

  return (
    <>
      <PageHeader
        back="/biomarkers"
        breadcrumbs={crumbs(
          { label: t("nav.biomarkers"), to: "/biomarkers" },
          { label: bio.canonicalName, selectable: true },
        )}
        title={bio.canonicalName}
        description={`${bio.category} · ${bio.defaultUnit}${bio.code ? ` · LOINC ${bio.code}` : ""}`}
        actions={bio.isCustom ? <Badge variant="secondary">custom</Badge> : undefined}
      />

      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {bio.refLow != null && bio.refHigh != null && (
          <Badge variant="outline">
            {t("biomarkerDetail.reference")}: {formatValue(bio.refLow)}–{formatValue(bio.refHigh)}{" "}
            {bio.defaultUnit}
          </Badge>
        )}
        {bio.optimalLow != null && bio.optimalHigh != null && (
          <Badge variant="success">
            {t("biomarkerDetail.optimal")}: {formatValue(bio.optimalLow)}–
            {formatValue(bio.optimalHigh)} {bio.defaultUnit}
          </Badge>
        )}
        {bio.direction !== "range" && (
          <Badge variant="secondary">
            {bio.direction === "higher_better"
              ? t("biomarkerDetail.higherBetter")
              : t("biomarkerDetail.lowerBetter")}
          </Badge>
        )}
      </div>

      {info && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Info className="size-4 text-muted-foreground" />
              {t("biomarkerInfo.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">{info.summary}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoBlock label={t("biomarkerInfo.highLabel")} accent="high" text={info.high} />
              <InfoBlock label={t("biomarkerInfo.lowLabel")} accent="low" text={info.low} />
            </div>
            <InfoBlock label={t("biomarkerInfo.affectsLabel")} text={info.affects} />
            <p className="flex items-start gap-1.5 border-t pt-3 text-[11px] text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3 shrink-0 text-warning" />
              {t("biomarkerInfo.disclaimer")}
            </p>
          </CardContent>
        </Card>
      )}

      {series.length === 0 ? (
        <EmptyState
          icon={LineChart}
          title={t("biomarkerDetail.emptyTitle")}
          description={t("biomarkerDetail.emptyDescription")}
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t("biomarkerDetail.trendTitle")}</CardTitle>
              <CardDescription>{t("biomarkerDetail.trendDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <TrendChart
                series={series}
                biomarker={bio}
                overlays={overlays}
                symptomOverlays={symptomOverlays}
              />
              {(meds.length > 0 || symptoms.length > 0) && (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t pt-3">
                  {symptoms.length > 0 && (
                    <button
                      onClick={() => setShowSymptoms((v) => !v)}
                      className={cn(
                        "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                        showSymptoms
                          ? "border-transparent bg-destructive text-white"
                          : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {t("biomarkerSymptoms.toggle")}
                    </button>
                  )}
                  {meds.map((m) => {
                    const active = activeOverlays.has(m.id);
                    const idx = overlays.findIndex((o) => o.id === m.id);
                    return (
                      <button
                        key={m.id}
                        onClick={() =>
                          setActiveOverlays((prev) => {
                            const next = new Set(prev);
                            if (next.has(m.id)) next.delete(m.id);
                            else next.add(m.id);
                            return next;
                          })
                        }
                        className={cn(
                          "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                          active
                            ? "border-transparent text-white"
                            : "text-muted-foreground hover:bg-muted",
                        )}
                        style={
                          active
                            ? { backgroundColor: OVERLAY_COLORS[idx % OVERLAY_COLORS.length] }
                            : undefined
                        }
                      >
                        {m.name}
                        {!m.endDate && <span className="opacity-70">· active</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <AiInterpretation
            bio={bio}
            points={series.map((p) => ({
              date: p.date,
              value: p.value,
              flag: p.outOfRange ? (p.flag ?? null) : null,
            }))}
            medications={meds.filter((m) => !m.endDate).map((m) => m.name)}
          />

          <Card className="mt-4">
            <CardHeader>
              <CardTitle>{t("biomarkerDetail.allResultsTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("fields.date")}</TableHead>
                    <TableHead>{t("fields.value")}</TableHead>
                    <TableHead>{t("labPanelDetail.tableColumns.change")}</TableHead>
                    <TableHead>{t("labPanelDetail.tableColumns.status")}</TableHead>
                    <TableHead>{t("labs.tableColumns.lab")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...series].reverse().map((p, i) => {
                    const change = seriesChanges[series.length - 1 - i];
                    return (
                      <TableRow key={i}>
                        <TableCell>
                          <Link to={`/labs/${p.panelId}`} className="text-primary hover:underline">
                            {formatDate(p.date)}
                          </Link>
                        </TableCell>
                        <TableCell className="font-medium tabular-nums">
                          {formatValue(p.value)} {p.unit}
                        </TableCell>
                        <TableCell>
                          {change ? (
                            <DeltaBadge change={change} unit={p.unit} />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <FlagBadge flag={p.outOfRange ? p.flag : null} evaluated={p.evaluated} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">{p.labName ?? "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}

function InfoBlock({
  label,
  text,
  accent,
}: {
  label: string;
  text: string;
  accent?: "high" | "low";
}) {
  return (
    <div>
      <p
        className={cn(
          "mb-0.5 text-xs font-semibold uppercase tracking-wide",
          accent === "high" && "text-destructive",
          accent === "low" && "text-primary",
          !accent && "text-muted-foreground",
        )}
      >
        {label}
      </p>
      <p className="text-sm leading-snug">{text}</p>
    </div>
  );
}
