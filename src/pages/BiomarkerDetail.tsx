import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, LineChart } from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import { getBiomarker, getBiomarkerSeries, listMedications, listSymptomLog } from "@/db/repos";
import { PageHeader } from "@/components/app/PageHeader";
import { Loading } from "@/components/app/Loading";
import { EmptyState } from "@/components/app/EmptyState";
import { FlagBadge } from "@/components/app/FlagBadge";
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
  const { t } = useI18n();
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
      <Link
        to="/biomarkers"
        className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> All biomarkers
      </Link>
      <PageHeader
        title={bio.canonicalName}
        description={`${bio.category} · ${bio.defaultUnit}${bio.code ? ` · LOINC ${bio.code}` : ""}`}
        actions={bio.isCustom ? <Badge variant="secondary">custom</Badge> : undefined}
      />

      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {bio.refLow != null && bio.refHigh != null && (
          <Badge variant="outline">
            Reference: {formatValue(bio.refLow)}–{formatValue(bio.refHigh)} {bio.defaultUnit}
          </Badge>
        )}
        {bio.optimalLow != null && bio.optimalHigh != null && (
          <Badge variant="success">
            Optimal: {formatValue(bio.optimalLow)}–{formatValue(bio.optimalHigh)} {bio.defaultUnit}
          </Badge>
        )}
        {bio.direction !== "range" && (
          <Badge variant="secondary">
            {bio.direction === "higher_better" ? "higher is better" : "lower is better"}
          </Badge>
        )}
      </div>

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
              <CardDescription>
                Shaded bands: reference and optimal ranges. Toggle medications below to overlay
                intake periods and correlate them with shifts.
              </CardDescription>
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
                    <TableHead>{t("labPanelDetail.tableColumns.status")}</TableHead>
                    <TableHead>{t("labs.tableColumns.lab")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...series].reverse().map((p, i) => (
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
                        <FlagBadge flag={p.outOfRange ? p.flag : null} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{p.labName ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
