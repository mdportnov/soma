import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Sparkles, TestTubes, Trash2, Pencil } from "lucide-react";
import { useQuery } from "@/hooks/useQuery";
import {
  createPanelFindings,
  createPanelWithResults,
  deleteFinding,
  deletePanel,
  getFindingsByPanel,
  getPanel,
  getPanelChanges,
  getPanelResults,
  getPanelSource,
  markPanelReviewed,
  markResultReviewed,
  updateFinding,
} from "@/db/repos";
import { SourceFileButton, SourcePageLink } from "@/components/app/SourceFile";
import { useToast } from "@/components/app/Toast";
import { PageHeader } from "@/components/app/PageHeader";
import { crumbs } from "@/app/nav";
import { Loading } from "@/components/app/Loading";
import { EmptyState } from "@/components/app/EmptyState";
import { FlagBadge } from "@/components/app/FlagBadge";
import { DeltaBadge } from "@/components/app/DeltaBadge";
import { NotableChanges } from "@/components/app/NotableChanges";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/app/Field";
import { Input } from "@/components/ui/input";
import type { LabFinding } from "@/db/schema";
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
  const [editFinding, setEditFinding] = React.useState<LabFinding | null>(null);
  const [editDraft, setEditDraft] = React.useState({ valueText: "", unit: "", refRangeText: "" });

  const { data, loading, reload } = useQuery(async () => {
    const [panel, results, changes, source, findings] = await Promise.all([
      getPanel(panelId),
      getPanelResults(panelId),
      getPanelChanges(panelId),
      getPanelSource(panelId),
      getFindingsByPanel(panelId),
    ]);
    return { panel, results, changes, source, findings };
  }, [panelId]);

  if (loading || !data) return <Loading />;
  if (!data.panel) return <EmptyState icon={TestTubes} title={t("labPanelDetail.panelNotFound")} />;

  const { panel, results, changes, source, findings } = data;
  const outOfRange = results.filter((r) => r.outOfRange).length;
  const changeByResult = new Map(changes.map((c) => [c.result.id, c]));
  const needsReview = results.filter((r) => r.reviewedAt == null);

  const panelLabel = `${formatDate(panel.date)}${panel.labName ? ` — ${panel.labName}` : ""}`;

  return (
    <>
      <PageHeader
        back="/labs"
        breadcrumbs={crumbs(
          { label: t("nav.labResults"), to: "/labs" },
          { label: panelLabel, selectable: true },
        )}
        title={panelLabel}
        description={[
          [panel.city, panel.country].filter(Boolean).join(", "),
          `${results.length} ${t("labs.tableColumns.results").toLowerCase()}`,
          outOfRange
            ? `${outOfRange} ${t("labPanelDetail.outOfRange")}`
            : t("labPanelDetail.allInRange"),
          panel.cost != null ? `$${panel.cost.toLocaleString()}` : null,
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
            {(panel.sampleTypes ?? []).map((s) => (
              <Badge key={s} variant="secondary">
                {t(`types.${s}`)}
              </Badge>
            ))}
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

      {findings.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>{t("labPanelDetail.findingsTitle")}</CardTitle>
            <CardDescription>{t("labPanelDetail.findingsDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableBody>
                {findings.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="max-w-64">
                      <p className="truncate text-sm" title={f.rawLabel}>
                        {f.rawLabel}
                      </p>
                      {f.nameEn && f.nameEn.toLowerCase() !== f.rawLabel.toLowerCase() && (
                        <p
                          className="truncate text-[10px] italic text-muted-foreground"
                          title={f.nameEn}
                        >
                          ≈ {f.nameEn}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {f.valueText}
                      {f.unit ? ` ${f.unit}` : ""}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{f.refRangeText ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <SourcePageLink attachment={source} page={f.sourcePage} />
                        <Button
                          variant="ghost"
                          size="iconSm"
                          aria-label={t("common.edit")}
                          onClick={() => {
                            setEditFinding(f);
                            setEditDraft({
                              valueText: f.valueText,
                              unit: f.unit ?? "",
                              refRangeText: f.refRangeText ?? "",
                            });
                          }}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="iconSm"
                          aria-label={t("common.delete")}
                          onClick={async () => {
                            await deleteFinding(f.id);
                            await reload();
                          }}
                        >
                          <Trash2 className="text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={editFinding != null}
        onClose={() => setEditFinding(null)}
        title={t("labPanelDetail.editFindingTitle")}
        description={editFinding?.rawLabel}
      >
        <div className="grid gap-3">
          <Field label={t("labPanelDetail.tableColumns.value")}>
            <Input
              value={editDraft.valueText}
              onChange={(e) => setEditDraft({ ...editDraft, valueText: e.target.value })}
            />
          </Field>
          <Field label={t("biomarkers.createDialog.unitLabel")}>
            <Input
              value={editDraft.unit}
              onChange={(e) => setEditDraft({ ...editDraft, unit: e.target.value })}
            />
          </Field>
          <Field label={t("labPanelDetail.tableColumns.reference")}>
            <Input
              value={editDraft.refRangeText}
              onChange={(e) => setEditDraft({ ...editDraft, refRangeText: e.target.value })}
            />
          </Field>
          <div className="mt-1 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditFinding(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={!editDraft.valueText.trim()}
              onClick={async () => {
                if (!editFinding) return;
                await updateFinding(editFinding.id, {
                  valueText: editDraft.valueText.trim(),
                  unit: editDraft.unit.trim() || null,
                  refRangeText: editDraft.refRangeText.trim() || null,
                });
                setEditFinding(null);
                await reload();
              }}
            >
              {t("common.save")}
            </Button>
          </div>
        </div>
      </Dialog>

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
              const findingInputs = findings.map(
                ({ id: _i, panelId: _p, createdAt: _c, ...f }) => f,
              );
              await deletePanel(panelId);
              setConfirmDelete(false);
              navigate("/labs");
              toast.showAction(t("labPanelDetail.deletedToast"), t("common.undo"), () => {
                void createPanelWithResults(panelData, resultInputs, biosById).then((newId) =>
                  createPanelFindings(newId, findingInputs),
                );
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
