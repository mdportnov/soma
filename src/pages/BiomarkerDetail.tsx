import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, Info, Lightbulb, LineChart, Pencil } from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import { useSeed, type BiomarkerSeed } from "@/app/seed";
import { getBiomarker, getBiomarkerSeries, listMedications, listSymptomLog } from "@/db/repos";
import { getBiomarkerInfo } from "@/content/biomarker-info";
import { PageHeader } from "@/components/app/PageHeader";
import { Loading } from "@/components/app/Loading";
import { EmptyState } from "@/components/app/EmptyState";
import { HintCard } from "@/components/app/HintCard";
import { FlagBadge } from "@/components/app/FlagBadge";
import { DeltaBadge } from "@/components/app/DeltaBadge";
import { AiInterpretation } from "@/components/app/AiInterpretation";
import { EditBiomarkerDialog } from "@/components/app/EditBiomarkerDialog";
import { changeBetween, type ValuePoint } from "@/lib/insights";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  const [editing, setEditing] = React.useState(false);
  // Opened from the list or a panel: the dictionary row came along with the
  // click, so the header, the reference badges and the explainer are on
  // screen at once and only the readings wait for the query.
  const seed = useSeed<BiomarkerSeed>("biomarker");

  const { data, loading, reload } = useQuery(async () => {
    const [bio, series, meds, symptoms] = await Promise.all([
      getBiomarker(biomarkerId),
      getBiomarkerSeries(profileId, biomarkerId),
      listMedications(profileId),
      listSymptomLog(profileId),
    ]);
    return { bio, series, meds, symptoms };
  }, [profileId, biomarkerId]);

  const bio = data ? data.bio : (seed?.biomarker ?? null);
  if (!bio) {
    if (loading || !data) return <Loading />;
    return <EmptyState icon={LineChart} title={t("biomarkerDetail.biomarkerNotFound")} />;
  }

  const info = getBiomarkerInfo(bio.canonicalName, lang);
  const settled = data && data.bio ? data : null;

  return (
    <>
      <PageHeader
        nav={{ leaf: bio.canonicalName, selectable: true }}
        title={bio.canonicalName}
        description={`${bio.category} · ${bio.defaultUnit}${bio.code ? ` · LOINC ${bio.code}` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            {bio.isCustom && <Badge variant="secondary">custom</Badge>}
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil /> {t("biomarkers.editDialog.action")}
            </Button>
          </div>
        }
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
              <AlertTriangle className="mt-0.5 size-3 shrink-0 text-warning-strong" />
              {t("biomarkerInfo.disclaimer")}
            </p>
          </CardContent>
        </Card>
      )}

      {!settled ? (
        <Loading />
      ) : settled.series.length === 0 ? (
        <EmptyState
          icon={LineChart}
          title={t("biomarkerDetail.emptyTitle")}
          description={t("biomarkerDetail.emptyDescription")}
        />
      ) : (
        <BiomarkerReadings
          bio={bio}
          series={settled.series}
          meds={settled.meds}
          symptoms={settled.symptoms}
          activeOverlays={activeOverlays}
          setActiveOverlays={setActiveOverlays}
          showSymptoms={showSymptoms}
          setShowSymptoms={setShowSymptoms}
        />
      )}

      <EditBiomarkerDialog
        open={editing}
        biomarker={bio}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          void reload();
        }}
      />
    </>
  );
}

/**
 * Everything below the header that needs the readings: chart with overlays,
 * the AI reading, the results table. Split out so the page above it can render
 * from the seed while this part is still loading.
 */
function BiomarkerReadings({
  bio,
  series,
  meds,
  symptoms,
  activeOverlays,
  setActiveOverlays,
  showSymptoms,
  setShowSymptoms,
}: {
  bio: NonNullable<Awaited<ReturnType<typeof getBiomarker>>>;
  series: Awaited<ReturnType<typeof getBiomarkerSeries>>;
  meds: Awaited<ReturnType<typeof listMedications>>;
  symptoms: Awaited<ReturnType<typeof listSymptomLog>>;
  activeOverlays: Set<number>;
  setActiveOverlays: React.Dispatch<React.SetStateAction<Set<number>>>;
  showSymptoms: boolean;
  setShowSymptoms: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const { t } = useI18n();

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
      {meds.length > 0 && (
        <HintCard
          id="biomarker-overlay"
          icon={Lightbulb}
          title={t("hints.overlayTitle")}
          className="mb-4"
        >
          {t("hints.overlayBody")}
        </HintCard>
      )}
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
                    "press inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
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
                      "press inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
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
          // Readings kept on another scale (or in an unrecognized unit)
          // carry their own unit, so the prompt never labels them with the
          // biomarker's default one.
          unit: p.unit,
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
                <TableHead numeric>{t("fields.value")}</TableHead>
                <TableHead numeric>{t("labPanelDetail.tableColumns.change")}</TableHead>
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
                    <TableCell numeric className="whitespace-nowrap font-medium">
                      {formatValue(p.value)} {p.unit}
                    </TableCell>
                    <TableCell numeric>
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
