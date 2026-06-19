import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Sparkles, TestTubes, Trash2 } from "lucide-react";
import { useQuery } from "@/hooks/useQuery";
import {
  createPanelWithResults,
  deletePanel,
  getPanel,
  getPanelChanges,
  getPanelResults,
  getPanelSource,
  markPanelReviewed,
  markResultReviewed,
} from "@/db/repos";
import { SourceFileButton, SourcePageLink } from "@/components/app/SourceFile";
import { useToast } from "@/components/app/Toast";
import { PageHeader } from "@/components/app/PageHeader";
import { Loading } from "@/components/app/Loading";
import { EmptyState } from "@/components/app/EmptyState";
import { FlagBadge } from "@/components/app/FlagBadge";
import { DeltaBadge } from "@/components/app/DeltaBadge";
import { NotableChanges } from "@/components/app/NotableChanges";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatValue } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export function LabPanelDetail() {
  const { id } = useParams();
  const panelId = Number(id);
  const navigate = useNavigate();
  const { t } = useI18n();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const { data, loading, reload } = useQuery(async () => {
    const [panel, results, changes, source] = await Promise.all([
      getPanel(panelId),
      getPanelResults(panelId),
      getPanelChanges(panelId),
      getPanelSource(panelId),
    ]);
    return { panel, results, changes, source };
  }, [panelId]);

  if (loading || !data) return <Loading />;
  if (!data.panel) return <EmptyState icon={TestTubes} title={t("labPanelDetail.panelNotFound")} />;

  const { panel, results, changes, source } = data;
  const outOfRange = results.filter((r) => r.outOfRange).length;
  const changeByResult = new Map(changes.map((c) => [c.result.id, c]));
  const needsReview = results.filter((r) => r.reviewedAt == null);

  return (
    <>
      <Link
        to="/labs"
        className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> {t("labPanelDetail.backToLabs")}
      </Link>
      <PageHeader
        title={`${formatDate(panel.date)}${panel.labName ? ` — ${panel.labName}` : ""}`}
        description={[
          [panel.city, panel.country].filter(Boolean).join(", "),
          `${results.length} ${t("labs.tableColumns.results").toLowerCase()}`,
          outOfRange
            ? `${outOfRange} ${t("labPanelDetail.outOfRange")}`
            : t("labPanelDetail.allInRange"),
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            {panel.importMethod === "ai" && (
              <Badge>
                <Sparkles className="size-3" /> {t("labPanelDetail.aiImported")}
              </Badge>
            )}
            <Badge variant="secondary">{t(`types.${panel.panelType}`)}</Badge>
            <SourceFileButton attachment={source} />
            <Button
              variant="outline"
              size="icon"
              onClick={() => setConfirmDelete(true)}
              aria-label={t("labPanelDetail.deletePanel")}
            >
              <Trash2 className="text-destructive" />
            </Button>
          </>
        }
      />

      {(panel.collectionTime ||
        panel.fasting != null ||
        panel.menstrualCycleDay != null ||
        panel.notes) && (
        <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {panel.collectionTime && (
            <span>
              {t("labPanelNew.fields.collectionTime")}: {panel.collectionTime}
            </span>
          )}
          {panel.fasting != null && (
            <span>
              {t("labPanelNew.fields.fasting")}:{" "}
              {t(panel.fasting ? "labPanelNew.fasting.yes" : "labPanelNew.fasting.no")}
            </span>
          )}
          {panel.menstrualCycleDay != null && (
            <span>
              {t("labPanelNew.fields.cycleDay")}: {panel.menstrualCycleDay}
            </span>
          )}
          {panel.notes && <span className="basis-full text-foreground/80">{panel.notes}</span>}
        </div>
      )}

      <div className="mb-4">
        <NotableChanges changes={changes} />
      </div>

      {needsReview.length > 0 && (
        <div className="mb-4 rounded-lg border border-warning/40 bg-warning/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{t("needsReview.panelTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("needsReview.panelDescription")}</p>
            </div>
            <div className="flex items-center gap-2">
              <Link to={`/labs/${panelId}/verify`} className="text-xs text-primary hover:underline">
                {t("needsReview.verifyAction")}
              </Link>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await markPanelReviewed(panelId);
                  await reload();
                  toast.show(t("needsReview.confirmedToast"));
                }}
              >
                {t("needsReview.confirmAll")}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("labPanelDetail.tableColumns.biomarker")}</TableHead>
                <TableHead>{t("labPanelDetail.tableColumns.value")}</TableHead>
                <TableHead>{t("labPanelDetail.tableColumns.change")}</TableHead>
                <TableHead>{t("labPanelDetail.tableColumns.normalized")}</TableHead>
                <TableHead>{t("labPanelDetail.tableColumns.reference")}</TableHead>
                <TableHead>{t("labPanelDetail.tableColumns.status")}</TableHead>
                <TableHead>{t("labPanelDetail.tableColumns.sourceLabel")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((r) => (
                <TableRow key={r.id} className={r.reviewedAt == null ? "bg-warning/5" : undefined}>
                  <TableCell>
                    <Link
                      to={`/biomarkers/${r.biomarkerId}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {r.biomarker.canonicalName}
                    </Link>
                    <p className="text-[11px] text-muted-foreground">{r.biomarker.category}</p>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatValue(r.value)} {r.unit}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const pc = changeByResult.get(r.id);
                      if (pc?.change)
                        return <DeltaBadge change={pc.change} unit={r.unitNormalized ?? r.unit} />;
                      // Has a prior reading but no change = units weren't comparable.
                      if (pc?.previous)
                        return (
                          <span
                            className="text-[11px] text-muted-foreground"
                            title={t("insights.unitChanged")}
                          >
                            {t("insights.unitChangedShort")}
                          </span>
                        );
                      return <span className="text-xs text-muted-foreground">—</span>;
                    })()}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {r.valueNormalized != null && r.unitNormalized !== r.unit
                      ? `${formatValue(r.valueNormalized)} ${r.unitNormalized}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.biomarker.refLow != null || r.biomarker.refHigh != null
                      ? `${r.biomarker.refLow != null ? formatValue(r.biomarker.refLow) : ""}–${r.biomarker.refHigh != null ? formatValue(r.biomarker.refHigh) : ""} ${r.biomarker.defaultUnit}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <FlagBadge
                      flag={r.outOfRange ? r.flag : null}
                      evaluated={r.valueNormalized != null}
                    />
                  </TableCell>
                  <TableCell className="max-w-52 text-xs text-muted-foreground">
                    <div className="flex flex-col gap-0.5">
                      <span className="truncate" title={r.rawLabel ?? undefined}>
                        {r.rawLabel ?? "—"}
                      </span>
                      <div className="flex items-center gap-1">
                        {/* Trusted rows (exact/manual) carry no badge — the absence
                            is the signal; only uncertain mappings are flagged. */}
                        {r.confidence === "translated" || r.confidence === "fuzzy" ? (
                          <Badge variant="warning" className="text-[10px]">
                            {r.confidence}
                          </Badge>
                        ) : r.confidence === "ai" ? (
                          <Badge className="text-[10px]">AI</Badge>
                        ) : null}
                        <SourcePageLink attachment={source} page={r.sourcePage} />
                      </div>
                      {r.reviewedAt == null && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-5 px-1 text-[10px]"
                          onClick={async () => {
                            await markResultReviewed(r.id);
                            await reload();
                            toast.show(t("needsReview.confirmedToast"));
                          }}
                        >
                          {t("needsReview.confirm")}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t("labPanelDetail.deletePanelTitle")}
        description={t("labPanelDetail.deletePanelDescription")}
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmDelete(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={async () => {
              // Capture before delete so Undo can re-create the panel + results.
              const { id: _id, createdAt: _c, ...panelData } = panel;
              const resultInputs = results.map((r) => ({
                biomarkerId: r.biomarkerId,
                value: r.value,
                unit: r.unit,
                rawLabel: r.rawLabel,
                sourcePage: r.sourcePage,
                confidence: r.confidence,
                reviewedAt: r.reviewedAt,
              }));
              const biosById = new Map(results.map((r) => [r.biomarkerId, r.biomarker]));
              await deletePanel(panelId);
              setConfirmDelete(false);
              navigate("/labs");
              toast.showAction(t("labPanelDetail.deletedToast"), t("common.undo"), () => {
                void createPanelWithResults(panelData, resultInputs, biosById);
              });
            }}
          >
            {t("labPanelDetail.deletePanel")}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
