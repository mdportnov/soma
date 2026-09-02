import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Sparkles, TestTubes, Trash2, Pencil } from "lucide-react";
import { useQuery } from "@/hooks/useQuery";
import { useHighlight } from "@/hooks/useHighlight";
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
  getProfile,
  markPanelReviewed,
  markResultReviewed,
  updateFinding,
  updatePanel,
  updateResultValue,
  type ResultWithBiomarker,
} from "@/db/repos";
import { SourceFileButton, SourcePageLink } from "@/components/app/SourceFile";
import { useToast } from "@/components/app/Toast";
import { useConfirm } from "@/components/app/Confirm";
import { undoToastCaveat, type UndoCaveat } from "@/lib/undo-scope";
import { convertToAlternateScale } from "@/lib/units";
import { PageHeader } from "@/components/app/PageHeader";
import { crumbs } from "@/app/nav";
import { Loading } from "@/components/app/Loading";
import { EmptyState } from "@/components/app/EmptyState";
import { FlagBadge } from "@/components/app/FlagBadge";
import { DeltaBadge } from "@/components/app/DeltaBadge";
import { NotableChanges } from "@/components/app/NotableChanges";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/app/Field";
import { Input } from "@/components/ui/input";
import type { LabFinding, LabPanel, SampleType } from "@/db/schema";
import { SAMPLE_TYPES } from "@/db/schema";
import { useApp } from "@/app/AppContext";
import { DateInput } from "@/components/ui/date-input";
import { SelectMenu } from "@/components/ui/select-menu";
import { ChipSelect } from "@/components/ui/chip-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, formatDate, formatValue } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

/** Editable panel metadata, held as strings while the dialog is open. */
type PanelDraft = {
  date: string;
  labName: string;
  city: string;
  country: string;
  cost: string;
  sampleTypes: SampleType[];
  collectionTime: string;
  fasting: string;
  cycleDay: string;
  notes: string;
};

function toPanelDraft(p: LabPanel): PanelDraft {
  return {
    date: p.date.slice(0, 10),
    labName: p.labName ?? "",
    city: p.city ?? "",
    country: p.country ?? "",
    cost: p.cost != null ? String(p.cost) : "",
    sampleTypes: p.sampleTypes ?? ["blood"],
    collectionTime: p.collectionTime ?? "",
    fasting: p.fasting == null ? "" : p.fasting ? "yes" : "no",
    cycleDay: p.menstrualCycleDay != null ? String(p.menstrualCycleDay) : "",
    notes: p.notes ?? "",
  };
}

/** Parses the free-text USD cost field into a non-negative number, or null. */
function parseCostUsd(raw: string): number | null {
  const n = Number.parseFloat(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function LabPanelDetail() {
  const { id } = useParams();
  const { profileId } = useApp();
  const panelId = Number(id);
  const navigate = useNavigate();
  const { t } = useI18n();
  const toast = useToast();
  const { confirmDelete } = useConfirm();
  // ⌘K lands on a single measurement as /labs/<panel>?highlight=<row id> —
  // flash the result or finding the user searched for inside the panel.
  const highlight = useHighlight();
  const [editFinding, setEditFinding] = React.useState<LabFinding | null>(null);
  const [editDraft, setEditDraft] = React.useState({ valueText: "", unit: "", refRangeText: "" });
  const [editResult, setEditResult] = React.useState<ResultWithBiomarker | null>(null);
  const [resultDraft, setResultDraft] = React.useState({ valueText: "", unit: "" });
  const [editPanel, setEditPanel] = React.useState<PanelDraft | null>(null);

  const { data, loading, reload } = useQuery(async () => {
    const [panel, results, changes, source, findings, profile] = await Promise.all([
      getPanel(panelId),
      getPanelResults(panelId),
      getPanelChanges(panelId),
      getPanelSource(panelId),
      getFindingsByPanel(panelId),
      getProfile(profileId),
    ]);
    return { panel, results, changes, source, findings, profile };
  }, [panelId, profileId]);

  const resultDraftValid =
    resultDraft.valueText.trim() !== "" &&
    Number.isFinite(Number(resultDraft.valueText)) &&
    resultDraft.unit.trim() !== "";

  const removePanel = async () => {
    // Results and unrecognised lines go with the panel and come back with Undo
    // (re-created below). The source file is erased from disk the moment the
    // delete runs and never comes back — the one thing Undo cannot promise.
    const caveats: UndoCaveat[] = source ? ["file"] : [];
    const ok = await confirmDelete({
      entity: "labPanel",
      name: panel.labName,
      dateLabel: formatDate(panel.date),
      cascade: [
        { key: "labResult", count: results.length },
        { key: "labFinding", count: findings.length },
      ],
      undoable: true,
      undoCaveats: caveats,
    });
    if (!ok) return;
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
    const findingInputs = findings.map(({ id: _i, panelId: _p, createdAt: _c2, ...f }) => f);
    await deletePanel(panelId);
    navigate("/labs");
    // The erased source row must not travel with the snapshot: a re-created
    // panel pointing at a file id that no longer exists is a broken link.
    const restoredPanel = { ...panelData, sourceFileId: null };
    toast.showUndo(
      t("labPanelDetail.deletedToast"),
      async () => {
        const newId = await createPanelWithResults(restoredPanel, resultInputs, biosById);
        await createPanelFindings(newId, findingInputs);
      },
      { caveat: undoToastCaveat(t, caveats) },
    );
  };

  const saveFinding = async () => {
    if (!editFinding || !editDraft.valueText.trim()) return;
    await updateFinding(editFinding.id, {
      valueText: editDraft.valueText.trim(),
      unit: editDraft.unit.trim() || null,
      refRangeText: editDraft.refRangeText.trim() || null,
    });
    setEditFinding(null);
    await reload();
  };

  const savePanelMeta = async () => {
    if (!editPanel?.date) return;
    await updatePanel(panelId, {
      date: editPanel.date,
      labName: editPanel.labName.trim() || null,
      city: editPanel.city.trim() || null,
      country: editPanel.country.trim() || null,
      cost: parseCostUsd(editPanel.cost),
      sampleTypes: editPanel.sampleTypes.length ? editPanel.sampleTypes : ["blood"],
      collectionTime: editPanel.collectionTime.trim() || null,
      fasting: editPanel.fasting === "" ? null : editPanel.fasting === "yes",
      menstrualCycleDay: editPanel.cycleDay.trim() ? Number(editPanel.cycleDay) : null,
      notes: editPanel.notes.trim() || null,
    });
    setEditPanel(null);
    await reload();
    toast.show(t("labPanelDetail.panelUpdatedToast"));
  };

  const saveResultValue = async () => {
    if (!editResult || !resultDraftValid) return;
    await updateResultValue(editResult.id, {
      value: Number(resultDraft.valueText),
      unit: resultDraft.unit.trim(),
    });
    setEditResult(null);
    await reload();
    toast.show(t("labPanelDetail.resultUpdatedToast"));
  };

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
          results.length > 0
            ? `${results.length} ${t("labs.tableColumns.results").toLowerCase()}`
            : findings.length > 0
              ? `${findings.length} ${t("labPanelDetail.findingsTitle").toLowerCase()}`
              : null,
          // "all in range" only means something when something was measured.
          results.length === 0
            ? null
            : outOfRange
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
              onClick={() => setEditPanel(toPanelDraft(panel))}
              aria-label={t("labPanelDetail.editPanel")}
            >
              <Pencil />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => void removePanel()}
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
          {results.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">
              {t("labPanelDetail.noResults")}
              {findings.length > 0 ? ` ${t("labPanelDetail.findingsOnly")}` : ""}
            </p>
          ) : (
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
                  <TableRow
                    key={r.id}
                    ref={highlight.id === r.id ? highlight.ref : undefined}
                    className={cn(
                      r.reviewedAt == null && "bg-warning/5",
                      highlight.className(r.id),
                    )}
                  >
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
                          return (
                            <DeltaBadge change={pc.change} unit={r.unitNormalized ?? r.unit} />
                          );
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
                      {(() => {
                        // A result normalized onto an alternate scale (Lp(a) in
                        // mg/dL) was flagged against that scale's range, so the
                        // dictionary range in the default unit does not apply.
                        const alt =
                          r.unitNormalized != null && r.unitNormalized !== r.biomarker.defaultUnit
                            ? convertToAlternateScale(r.value, r.unit, r.biomarker)
                            : null;
                        const { refLow, refHigh, unit } = alt
                          ? { refLow: alt.refLow, refHigh: alt.refHigh, unit: alt.unit }
                          : {
                              refLow: r.biomarker.refLow,
                              refHigh: r.biomarker.refHigh,
                              unit: r.biomarker.defaultUnit,
                            };
                        if (refLow == null && refHigh == null) return "—";
                        return `${refLow != null ? formatValue(refLow) : ""}–${refHigh != null ? formatValue(refHigh) : ""} ${unit}`;
                      })()}
                    </TableCell>
                    <TableCell>
                      <FlagBadge
                        flag={r.outOfRange ? r.flag : null}
                        evaluated={r.valueNormalized != null}
                      />
                    </TableCell>
                    <TableCell className="max-w-52 text-xs text-muted-foreground">
                      <div className="flex flex-col gap-0.5">
                        <span className="block truncate" title={r.rawLabel ?? undefined}>
                          {r.rawLabel ?? "—"}
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="iconSm"
                            aria-label={t("common.edit")}
                            onClick={() => {
                              setEditResult(r);
                              setResultDraft({ valueText: String(r.value), unit: r.unit });
                            }}
                          >
                            <Pencil />
                          </Button>
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
          )}
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
                  <TableRow
                    key={f.id}
                    ref={highlight.id === f.id ? highlight.ref : undefined}
                    className={highlight.className(f.id)}
                  >
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
                            const ok = await confirmDelete({
                              entity: "finding",
                              name: f.rawLabel,
                            });
                            if (!ok) return;
                            await deleteFinding(f.id);
                            await reload();
                            toast.show(t("toasts.deleted", { name: f.rawLabel }));
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
        onSubmit={() => void saveFinding()}
        submitDisabled={!editDraft.valueText.trim()}
        guardUnsaved
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
          <DialogActions
            onClose={() => setEditFinding(null)}
            onSubmit={() => void saveFinding()}
            submitLabel={t("common.save")}
            disabled={!editDraft.valueText.trim()}
          />
        </div>
      </Dialog>

      <Dialog
        open={editResult != null}
        onClose={() => setEditResult(null)}
        title={t("labPanelDetail.editResultTitle")}
        description={editResult?.biomarker.canonicalName}
        onSubmit={() => void saveResultValue()}
        submitDisabled={!resultDraftValid}
        guardUnsaved
      >
        <div className="grid gap-3">
          <p className="text-xs text-muted-foreground">
            {t("labPanelDetail.editResultDescription")}
          </p>
          <Field label={t("labPanelDetail.tableColumns.value")}>
            <Input
              type="number"
              step="any"
              value={resultDraft.valueText}
              onChange={(e) => setResultDraft({ ...resultDraft, valueText: e.target.value })}
            />
          </Field>
          <Field label={t("biomarkers.createDialog.unitLabel")}>
            <Input
              value={resultDraft.unit}
              onChange={(e) => setResultDraft({ ...resultDraft, unit: e.target.value })}
            />
          </Field>
          <DialogActions
            onClose={() => setEditResult(null)}
            onSubmit={() => void saveResultValue()}
            submitLabel={t("common.save")}
            disabled={!resultDraftValid}
          />
        </div>
      </Dialog>

      <Dialog
        open={editPanel != null}
        onClose={() => setEditPanel(null)}
        title={t("labPanelDetail.editPanelTitle")}
        description={t("labPanelDetail.editPanelDescription")}
        onSubmit={() => void savePanelMeta()}
        submitDisabled={!editPanel?.date}
        guardUnsaved
      >
        {editPanel && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("fields.date")}>
              <DateInput
                value={editPanel.date}
                onChange={(v) => setEditPanel({ ...editPanel, date: v })}
              />
            </Field>
            <Field label={t("labPanelNew.fields.labName")}>
              <Input
                value={editPanel.labName}
                onChange={(e) => setEditPanel({ ...editPanel, labName: e.target.value })}
              />
            </Field>
            <Field label={t("fields.city")}>
              <Input
                value={editPanel.city}
                onChange={(e) => setEditPanel({ ...editPanel, city: e.target.value })}
              />
            </Field>
            <Field label={t("fields.country")}>
              <Input
                value={editPanel.country}
                onChange={(e) => setEditPanel({ ...editPanel, country: e.target.value })}
              />
            </Field>
            <Field label={t("fields.cost")} hint={t("fields.costHint")}>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-muted-foreground">
                  $
                </span>
                <Input
                  inputMode="decimal"
                  placeholder="0.00"
                  className="pl-6"
                  value={editPanel.cost}
                  onChange={(e) => setEditPanel({ ...editPanel, cost: e.target.value })}
                />
              </div>
            </Field>
            <Field label={t("labPanelNew.fields.collectionTime")}>
              <Input
                type="time"
                value={editPanel.collectionTime}
                onChange={(e) => setEditPanel({ ...editPanel, collectionTime: e.target.value })}
              />
            </Field>
            <Field label={t("fields.sampleTypes")} className="sm:col-span-2">
              <ChipSelect<SampleType>
                value={editPanel.sampleTypes}
                onChange={(next) => setEditPanel({ ...editPanel, sampleTypes: next })}
                options={SAMPLE_TYPES.map((s) => ({ value: s, label: t(`types.${s}`) }))}
              />
            </Field>
            <Field label={t("labPanelNew.fields.fasting")}>
              <SelectMenu
                value={editPanel.fasting}
                onChange={(v) => setEditPanel({ ...editPanel, fasting: v })}
                options={[
                  { value: "", label: t("labPanelNew.fasting.unknown") },
                  { value: "yes", label: t("labPanelNew.fasting.yes") },
                  { value: "no", label: t("labPanelNew.fasting.no") },
                ]}
              />
            </Field>
            {data.profile?.sex === "female" && (
              <Field label={t("labPanelNew.fields.cycleDay")}>
                <Input
                  type="number"
                  min={1}
                  max={45}
                  value={editPanel.cycleDay}
                  onChange={(e) => setEditPanel({ ...editPanel, cycleDay: e.target.value })}
                />
              </Field>
            )}
            <Field label={t("labPanelNew.fields.notes")} className="sm:col-span-2">
              <Input
                value={editPanel.notes}
                onChange={(e) => setEditPanel({ ...editPanel, notes: e.target.value })}
                placeholder={t("labPanelNew.notesPlaceholder")}
              />
            </Field>
            <div className="sm:col-span-2">
              <DialogActions
                onClose={() => setEditPanel(null)}
                onSubmit={() => void savePanelMeta()}
                submitLabel={t("common.save")}
                disabled={!editPanel.date}
              />
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
