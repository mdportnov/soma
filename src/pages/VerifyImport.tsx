import { useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  Info,
  Pencil,
  TestTubes,
  LoaderCircle,
} from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import {
  findDuplicatePanelsForImport,
  getPanel,
  getPanelResults,
  getPanelSource,
  listBiomarkers,
  updateResultValue,
  markPanelReviewed,
  markResultReviewed,
  type ResultWithBiomarker,
} from "@/db/repos";
import {
  ConfidenceBadge as DuplicateConfidenceBadge,
  panelDuplicateLabel,
} from "@/components/app/ImportDuplicateNotice";
import { SourceDocPane, SourceFileButton } from "@/components/app/SourceFile";
import { PageHeader } from "@/components/app/PageHeader";
import { Loading } from "@/components/app/Loading";
import { EmptyState } from "@/components/app/EmptyState";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/app/Field";
import { resultReviewReason } from "@/lib/result-review";
import { cn, formatDate, formatValue } from "@/lib/utils";
import { useToast } from "@/components/app/Toast";
import { useI18n } from "@/lib/i18n";

function ResultEditor({
  result,
  options,
  busy,
  onSave,
  onCancel,
}: {
  result: ResultWithBiomarker;
  options: ComboboxOption[];
  busy: boolean;
  onSave: (patch: { value: number; unit: string; biomarkerId: number }) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(String(result.value));
  const [unit, setUnit] = useState(result.unit);
  const [biomarkerId, setBiomarkerId] = useState(String(result.biomarkerId));
  const valid = value.trim() !== "" && Number.isFinite(Number(value)) && unit.trim() !== "";
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid && !busy)
          void onSave({
            value: Number(value),
            unit: unit.trim(),
            biomarkerId: Number(biomarkerId),
          });
      }}
    >
      <Field label={t("verify.savedAs")}>
        <Combobox
          aria-label={t("verify.savedAs")}
          value={biomarkerId}
          onChange={setBiomarkerId}
          options={options}
          disabled={busy}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("labPanelDetail.tableColumns.value")}>
          <Input
            type="number"
            aria-label={t("labPanelDetail.tableColumns.value")}
            step="any"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            disabled={busy}
          />
        </Field>
        <Field label={t("biomarkers.createDialog.unitLabel")}>
          <Input
            aria-label={t("biomarkers.createDialog.unitLabel")}
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            disabled={busy}
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" size="sm" disabled={!valid || busy}>
          {busy ? <LoaderCircle className="animate-spin" /> : <Check />}{" "}
          {t(busy ? "verify.saving" : "verify.saveConfirm")}
        </Button>
      </div>
    </form>
  );
}

export function VerifyImport() {
  const { id } = useParams();
  const panelId = Number(id);
  const { t, lang } = useI18n();
  const { profileId } = useApp();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<number | null>(
    () => Number(searchParams.get("result")) || null,
  );
  const [onlyUncertain, setOnlyUncertain] = useState(true);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saving = useRef(false);
  const activeCard = useRef<HTMLDivElement>(null);

  const { data, reload } = useQuery(async () => {
    const [panel, results, source, biomarkers] = await Promise.all([
      getPanel(panelId),
      getPanelResults(panelId),
      getPanelSource(panelId),
      listBiomarkers(),
    ]);
    // The panel is already saved; if a same-day sibling overlaps it, this is
    // the last screen of the import and the right place to say so.
    const siblings = panel
      ? (
          await findDuplicatePanelsForImport(profileId, {
            date: panel.date,
            labName: panel.labName,
            biomarkerIds: results.map((r) => r.biomarkerId),
          })
        ).filter((d) => d.panelId !== panelId)
      : [];
    return { panel, results, source, siblings, biomarkers };
  }, [panelId, profileId]);

  if (!data) return <Loading />;
  if (!data.panel) return <EmptyState icon={TestTubes} title={t("labPanelDetail.panelNotFound")} />;

  const { panel, results, source, siblings, biomarkers } = data;
  const pending = results.filter((r) => r.reviewedAt == null);
  const sibling = siblings[0];
  const shown = onlyUncertain ? pending : results;

  const active = shown.find((result) => result.id === selectedId) ?? shown[0];
  const activePage = active?.sourcePage ?? null;
  const options = biomarkers.map((biomarker) => ({
    value: String(biomarker.id),
    label: biomarker.canonicalName,
    group: biomarker.category,
    keywords: biomarker.aliases ?? [],
  }));
  const completed = results.length - pending.length;

  const save = async (write: () => Promise<void>, advance = true) => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setSaveError(null);
    try {
      await write();
      await reload({ preserveOnError: true });
      setEditing(false);
      if (advance) {
        const index = pending.findIndex((result) => result.id === active?.id);
        const next =
          pending.slice(index + 1).find((result) => result.id !== active?.id) ??
          pending.find((result) => result.id !== active?.id);
        setSelectedId(next?.id ?? null);
        requestAnimationFrame(() => {
          activeCard.current?.scrollIntoView({ block: "nearest" });
          activeCard.current
            ?.querySelector<HTMLButtonElement>("button")
            ?.focus({ preventScroll: true });
        });
      }
      toast.show(t("needsReview.confirmedToast"));
    } catch {
      setSaveError(t("verify.saveError"));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  const panelLabel = `${formatDate(panel.date)}${panel.labName ? ` — ${panel.labName}` : ""}`;

  return (
    <>
      <PageHeader
        nav={{
          leaf: t("breadcrumb.verify"),
          labels: { [`/labs/${panelId}`]: panelLabel },
        }}
        title={t("verify.title")}
        description={panelLabel}
        actions={
          <Link
            to={`/labs/${panelId}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {t("verify.backToPanel")}
          </Link>
        }
      />

      {sibling && (
        <div
          role="status"
          className={
            "mb-4 flex items-start gap-2 rounded-lg border p-3 text-sm " +
            (sibling.confidence === "likely"
              ? "border-warning/40 bg-warning/5"
              : "border-border bg-muted/40")
          }
        >
          {sibling.confidence === "likely" ? (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-strong" aria-hidden />
          ) : (
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">
                {t(
                  sibling.confidence === "likely"
                    ? "importWizard.duplicates.title"
                    : "importWizard.duplicates.titlePossible",
                )}
              </p>
              <DuplicateConfidenceBadge confidence={sibling.confidence} />
            </div>
            <p className="mt-1 text-xs">
              {t("importWizard.duplicates.savedSibling", {
                date: formatDate(sibling.date),
                lab: sibling.labName?.trim() || t("importWizard.duplicates.unknownLab"),
                shared: panelDuplicateLabel(t, lang, sibling).split(" — ").pop() ?? "",
              })}{" "}
              <Link to={`/labs/${sibling.panelId}`} className="text-primary hover:underline">
                {t("importWizard.duplicates.openExisting")}
              </Link>
            </p>
          </div>
        </div>
      )}

      <div className="mb-5 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium" aria-live="polite">
            {pending.length === 0
              ? t("needsReview.allReviewed")
              : t("verify.progress", { done: String(completed), total: String(results.length) })}
          </p>
          {pending.length > 0 && (
            <Badge variant="warning">
              {t("needsReview.badge", { count: String(pending.length) })}
            </Badge>
          )}
        </div>
        <div
          role="progressbar"
          aria-label={t("verify.title")}
          aria-valuemin={0}
          aria-valuemax={results.length || 1}
          aria-valuenow={completed}
          className="my-3 h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${results.length ? (completed / results.length) * 100 : 100}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">{t("verify.description")}</p>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="min-w-0 lg:sticky lg:top-6">
          <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <p className="font-medium uppercase tracking-wide">{t("verify.sourcePane")}</p>
            <div className="flex items-center gap-2">
              {activePage != null && <span>{t("sourceFile.page", { n: String(activePage) })}</span>}
              <SourceFileButton attachment={source} page={activePage} size="sm" variant="ghost" />
            </div>
          </div>
          <SourceDocPane attachment={source} page={activePage} className="h-[55vh] lg:h-[72vh]" />
        </div>

        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("verify.resultsPane")}
            </p>
            <button
              type="button"
              disabled={editing || busy}
              onClick={() => setOnlyUncertain((value) => !value)}
              className="text-xs text-primary hover:underline disabled:opacity-50"
            >
              {onlyUncertain ? t("verify.showAll") : t("verify.onlyUncertain")}
            </button>
          </div>
          {saveError && (
            <p
              role="alert"
              className="mb-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
            >
              {saveError}
            </p>
          )}
          {shown.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border bg-card px-6 py-10 text-center">
              <Check className="size-8 text-success-strong" />
              <p className="font-medium">{t("needsReview.allReviewed")}</p>
              <p className="text-sm text-muted-foreground">{t("verify.empty")}</p>
              <Link to={`/labs/${panelId}`} className={buttonVariants({ size: "sm" })}>
                {t("verify.backToPanel")} <ArrowRight />
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {shown.map((result) => {
                const reviewed = result.reviewedAt != null;
                const selected = result.id === active?.id;
                return (
                  <div
                    key={result.id}
                    ref={selected ? activeCard : undefined}
                    aria-busy={selected && busy}
                    className={cn(
                      "overflow-hidden rounded-lg border bg-card",
                      selected && "border-primary/60 ring-1 ring-primary/15",
                    )}
                  >
                    <button
                      type="button"
                      aria-expanded={selected}
                      disabled={busy || (editing && !selected)}
                      onClick={() => {
                        setSelectedId(result.id);
                        setSaveError(null);
                      }}
                      className="flex w-full items-center gap-3 p-4 text-left hover:bg-muted/30 disabled:opacity-60"
                    >
                      {reviewed ? (
                        <Check className="size-4 shrink-0 text-success-strong" />
                      ) : (
                        <span className="size-2 shrink-0 rounded-full bg-warning" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{result.biomarker.canonicalName}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {reviewed ? t("needsReview.reviewed") : t(resultReviewReason(result))}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm tabular-nums">
                        {formatValue(result.value)} {result.unit}
                      </span>
                      <ChevronDown
                        className={cn(
                          "size-4 shrink-0 text-muted-foreground",
                          selected && "rotate-180",
                        )}
                      />
                    </button>
                    {selected && (
                      <div className="space-y-4 border-t p-4">
                        <div className="rounded-md bg-muted/40 p-3">
                          <p className="text-xs text-muted-foreground">
                            {t("verify.sourceLabel")}
                            {result.sourcePage != null
                              ? ` · ${t("sourceFile.page", { n: String(result.sourcePage) })}`
                              : ""}
                          </p>
                          <p className="mt-1 text-sm font-medium">{result.rawLabel ?? "—"}</p>
                        </div>
                        {editing ? (
                          <ResultEditor
                            key={result.id}
                            result={result}
                            options={options}
                            busy={busy}
                            onCancel={() => setEditing(false)}
                            onSave={(patch) => save(() => updateResultValue(result.id, patch))}
                          />
                        ) : (
                          <>
                            <div className="grid grid-cols-[1fr_auto] gap-3">
                              <div>
                                <p className="text-xs text-muted-foreground">
                                  {t("verify.savedAs")}
                                </p>
                                <p className="mt-1 text-sm font-medium">
                                  {result.biomarker.canonicalName}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {result.biomarker.category}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-muted-foreground">
                                  {t("labPanelDetail.tableColumns.value")}
                                </p>
                                <p className="mt-1 text-lg font-medium tabular-nums">
                                  {formatValue(result.value)} {result.unit}
                                </p>
                              </div>
                            </div>
                            {result.valueNormalized == null && (
                              <p className="rounded-md bg-warning/5 p-3 text-xs text-warning-strong">
                                {t("verify.unitHelp", {
                                  unit: result.unit,
                                  expected: result.biomarker.defaultUnit,
                                })}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground">{t("verify.checkHelp")}</p>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() => setEditing(true)}
                              >
                                <Pencil /> {t("verify.edit")}
                              </Button>
                              {!reviewed && (
                                <Button
                                  size="sm"
                                  disabled={busy}
                                  onClick={() => void save(() => markResultReviewed(result.id))}
                                >
                                  {busy ? <LoaderCircle className="animate-spin" /> : <Check />}{" "}
                                  {t(
                                    busy
                                      ? "verify.saving"
                                      : pending.length > 1
                                        ? "verify.confirmNext"
                                        : "verify.confirm",
                                  )}
                                </Button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {pending.length > 1 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <p className="text-xs text-muted-foreground">{t("verify.bulkHelp")}</p>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || editing}
                onClick={() => void save(() => markPanelReviewed(panelId), false)}
              >
                {t("verify.confirmAll")}
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
