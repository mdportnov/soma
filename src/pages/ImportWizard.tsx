import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  FileText,
  Loader2,
  Plus,
  Settings as SettingsIcon,
  Sparkles,
  Syringe,
  TestTubes,
  Upload,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import {
  createAttachment,
  createDiagnosis,
  createMedication,
  createPanelWithResults,
  createVaccine,
  createVisit,
  listBiomarkers,
  updateAttachment,
} from "@/db/repos";
import { getConfiguredProvider } from "@/ai";
import type { AIProvider, RawVaccineExtraction } from "@/ai/types";
import {
  buildBiomarkerIndex,
  mapExtractions,
  markDuplicates,
  reconvertRow,
  type MappedRow,
} from "@/ai/pipeline/map";
import { mimeFromPath, storeAttachmentFile, toBase64 } from "@/lib/attachments";
import { PageHeader } from "@/components/app/PageHeader";
import { Loading } from "@/components/app/Loading";
import { Field } from "@/components/app/Field";
import { AiDisclaimer } from "@/components/app/AiDisclaimer";
import { useToast } from "@/components/app/Toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { SelectMenu } from "@/components/ui/select-menu";
import { Combobox } from "@/components/ui/combobox";
import type { ComboboxOption } from "@/components/ui/combobox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreateBiomarkerDialog } from "./Biomarkers";
import { cn, formatValue, todayISO } from "@/lib/utils";
import { allKnownUnits } from "@/lib/units";
import { useI18n } from "@/lib/i18n";
import type { Biomarker } from "@/db/schema";

type DocType = "lab" | "vaccine" | "discharge";

type Step =
  | { name: "selectType" }
  | { name: "pick" }
  | { name: "extracting" }
  | { name: "review"; rows: ReviewRow[] }
  | { name: "vaccineReview"; rows: VaccineRow[] }
  | { name: "dischargeReview"; meta: DischargeMeta; rows: DischargeRow[] }
  | { name: "saving" };

type ReviewRow = MappedRow & { include: boolean; key: number };

type VaccineRow = RawVaccineExtraction & { include: boolean; key: number };

type DischargeMeta = { visitDate: string; clinic: string; doctorName: string; notes: string };

type DischargeRow =
  | { key: number; include: boolean; type: "diagnosis"; name: string; icdCode: string | null }
  | { key: number; include: boolean; type: "medication"; name: string; dose: string | null };

export function ImportWizard() {
  const { profileId } = useApp();
  const { t } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();

  const {
    data: boot,
    loading: booting,
    reload: reloadBoot,
  } = useQuery(async () => {
    const [provider, biomarkers] = await Promise.all([getConfiguredProvider(), listBiomarkers()]);
    return { provider, biomarkers };
  }, []);

  const [docType, setDocType] = React.useState<DocType | null>(null);
  const [filePath, setFilePath] = React.useState<string | null>(null);
  const [step, setStep] = React.useState<Step>({ name: "selectType" });
  const [error, setError] = React.useState<string | null>(null);
  const [customForKey, setCustomForKey] = React.useState<number | null>(null);

  // Panel meta (phase 3)
  const [date, setDate] = React.useState(todayISO());
  const [labName, setLabName] = React.useState("");
  const [city, setCity] = React.useState("");
  const [country, setCountry] = React.useState("");
  const [panelType, setPanelType] = React.useState<"blood" | "urine" | "other">("blood");

  if (booting || !boot) return <Loading />;

  // §5: stub everywhere an AI feature appears until a key is configured.
  if (!boot.provider) {
    return (
      <>
        <BackLink />
        <PageHeader title={t("importWizard.title")} />
        <Card className="mx-auto max-w-lg">
          <CardContent className="flex flex-col items-center py-10 text-center">
            <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-secondary">
              <Sparkles className="size-5 text-secondary-foreground" />
            </div>
            <p className="text-sm font-medium">{t("importWizard.aiDisabledTitle")}</p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              {t("importWizard.aiDisabledDescription")}
            </p>
            <Link to="/settings" className="mt-4">
              <Button>
                <SettingsIcon /> {t("importWizard.openSettings")}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </>
    );
  }

  const index = buildBiomarkerIndex(boot.biomarkers);

  // The review row behind the open "create custom biomarker" dialog, used to
  // pre-fill the new biomarker's name/unit/reference range from the document.
  const customRow =
    step.name === "review" && customForKey != null
      ? step.rows.find((r) => r.key === customForKey)
      : undefined;
  const customRange = parseRefRange(customRow?.raw.ref_range_text ?? null);

  const pickFile = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Lab report", extensions: ["pdf", "jpg", "jpeg", "png", "webp"] }],
    });
    if (typeof selected === "string") {
      setFilePath(selected);
      setError(null);
    }
  };

  const runExtraction = async (provider: AIProvider) => {
    if (!filePath) return;
    setStep({ name: "extracting" });
    setError(null);
    try {
      const bytes = await readFile(filePath);
      const doc = {
        base64: toBase64(bytes),
        mimeType: mimeFromPath(filePath),
        fileName: filePath.split(/[/\\]/).pop(),
      };

      if (docType === "vaccine") {
        const vaccines = await provider.extractVaccinesFromDocument(doc);
        if (!vaccines.length) throw new Error(t("importWizard.vaccineReview.empty"));
        // §8: vaccines have no dictionary fallback — every row starts UNCHECKED.
        setStep({
          name: "vaccineReview",
          rows: vaccines.map((v, i) => ({ ...v, include: false, key: i })),
        });
        return;
      }

      if (docType === "discharge") {
        const d = await provider.extractDischargeFromDocument(doc);
        const rows: DischargeRow[] = [
          ...d.diagnoses.map(
            (dx, i): DischargeRow => ({
              key: i,
              include: false,
              type: "diagnosis",
              name: dx.name,
              icdCode: dx.icdCode,
            }),
          ),
          ...d.medications.map(
            (m, i): DischargeRow => ({
              key: d.diagnoses.length + i,
              include: false,
              type: "medication",
              name: m.name,
              dose: m.dose,
            }),
          ),
        ];
        if (!rows.length && !d.visitDate && !d.clinic && !d.doctorName) {
          throw new Error(t("importWizard.dischargeReview.empty"));
        }
        setStep({
          name: "dischargeReview",
          meta: {
            visitDate: d.visitDate ?? "",
            clinic: d.clinic ?? "",
            doctorName: d.doctorName ?? "",
            notes: d.notes,
          },
          rows,
        });
        return;
      }

      // Lab report (default): Phase 1 raw extraction (never written to lab_result).
      const extraction = await provider.extractFromDocument(doc);
      if (!extraction.results.length) {
        throw new Error("No quantitative results found in the document.");
      }
      // Pre-fill panel metadata from the document so an old report imported
      // today keeps its real collection date — essential for the trend.
      if (extraction.collectionDate) setDate(extraction.collectionDate);
      if (extraction.labName && !labName) setLabName(extraction.labName);
      // Phase 2: deterministic mapping + narrow AI disambiguation.
      const mapped = await mapExtractions(extraction.results, boot.biomarkers, provider);
      setStep({
        name: "review",
        rows: mapped.map((m, i) => ({ ...m, include: m.biomarkerId != null, key: i })),
      });
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
      setStep({ name: "pick" });
    }
  };

  const saveVaccines = async (rows: VaccineRow[]) => {
    setStep({ name: "saving" });
    try {
      const attachmentId = await storeSourceAttachment("vaccination_cert", "vaccine");
      const included = rows.filter((r) => r.include && r.vaccineName.trim() && r.date);
      for (const r of included) {
        await createVaccine({
          profileId,
          vaccineName: r.vaccineName.trim(),
          date: r.date!,
          manufacturer: r.manufacturer?.trim() || null,
          batchNumber: r.batchNumber?.trim() || null,
          dose: r.doseNumber ?? null,
          expiresAt: r.expiresAt || null,
          attachmentId,
        });
      }
      toast.show(t("toasts.importSaved"));
      navigate("/vaccines");
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
      setStep({ name: "vaccineReview", rows });
    }
  };

  const saveDischarge = async (meta: DischargeMeta, rows: DischargeRow[]) => {
    setStep({ name: "saving" });
    try {
      const attachmentId = await storeSourceAttachment("discharge", "visit");
      const visitDate = meta.visitDate || null;
      const recordDate = visitDate ?? todayISO();
      let visitId: number | null = null;
      if (visitDate || meta.clinic.trim() || meta.doctorName.trim()) {
        visitId = await createVisit({
          profileId,
          date: recordDate,
          doctorName: meta.doctorName.trim() || null,
          clinic: meta.clinic.trim() || null,
          notes: meta.notes.trim() || null,
        });
        if (attachmentId != null) {
          await updateAttachment(attachmentId, {
            linkedEntityType: "visit",
            linkedEntityId: visitId,
          });
        }
      }

      const included = rows.filter((r) => r.include && r.name.trim());
      for (const r of included) {
        if (r.type === "diagnosis") {
          await createDiagnosis({
            profileId,
            name: r.name.trim(),
            icdCode: r.icdCode?.trim() || null,
            date: recordDate,
            visitId,
          });
        } else {
          const parsed = parseDose(r.dose);
          await createMedication({
            profileId,
            name: r.name.trim(),
            type: "drug",
            doseAmount: parsed.amount,
            doseUnit: parsed.unit,
            schedule: null,
            startDate: recordDate,
            endDate: null,
          });
        }
      }
      toast.show(t("toasts.importSaved"));
      navigate(visitId != null ? `/visits/${visitId}` : "/visits");
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
      setStep({ name: "dischargeReview", meta, rows });
    }
  };

  /** Stores the source file as an attachment; returns its id (or null). */
  const storeSourceAttachment = async (
    kind: "vaccination_cert" | "discharge",
    entityType: string,
  ): Promise<number | null> => {
    if (!filePath) return null;
    const stored = await storeAttachmentFile(filePath);
    return createAttachment({
      profileId,
      filePath: stored,
      mimeType: mimeFromPath(filePath),
      kind,
      linkedEntityType: entityType,
    });
  };

  const updateRows = (rows: ReviewRow[], mutate: (rs: ReviewRow[]) => void) => {
    const next = rows.map((r) => ({ ...r }));
    mutate(next);
    markDuplicates(next);
    setStep({ name: "review", rows: next });
  };

  const save = async (rows: ReviewRow[]) => {
    setStep({ name: "saving" });
    try {
      // Keep the source document as an attachment for full traceability.
      let sourceFileId: number | null = null;
      if (filePath) {
        const stored = await storeAttachmentFile(filePath);
        sourceFileId = await createAttachment({
          profileId,
          filePath: stored,
          mimeType: mimeFromPath(filePath),
          kind: mimeFromPath(filePath) === "application/pdf" ? "lab_pdf" : "photo",
          linkedEntityType: "lab_panel",
        });
      }

      const byId = new Map<number, Biomarker>(boot.biomarkers.map((b) => [b.id, b]));
      const included = rows.filter((r) => r.include && r.biomarkerId != null);
      // Phase 3 complete — only now do confirmed rows reach lab_result,
      // each keeping its raw_label for the mapping audit trail.
      const panelId = await createPanelWithResults(
        {
          profileId,
          date,
          labName: labName.trim() || null,
          city: city.trim() || null,
          country: country.trim() || null,
          panelType,
          importMethod: "ai",
          sourceFileId,
        },
        included.map((r) => ({
          biomarkerId: r.biomarkerId!,
          value: r.raw.value,
          unit: r.raw.unit || byId.get(r.biomarkerId!)?.defaultUnit || "",
          rawLabel: r.raw.raw_label,
        })),
        byId,
      );
      if (sourceFileId != null) {
        await updateAttachment(sourceFileId, { linkedEntityId: panelId });
      }
      toast.show(t("toasts.importSaved"));
      navigate(`/labs/${panelId}`);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
      setStep({ name: "review", rows });
    }
  };

  return (
    <>
      <BackLink />
      <PageHeader title={t("importWizard.title")} description={t("importWizard.description")} />

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      )}

      {/* key={step.name} re-mounts the stage so transitions slide in */}
      <div key={step.name} className="animate-step-in">
        {step.name === "selectType" && (
          <SelectTypeStep
            value={docType}
            onChange={setDocType}
            onContinue={() => setStep({ name: "pick" })}
          />
        )}

        {step.name === "pick" && (
          <Card className="mx-auto max-w-lg">
            <CardContent className="flex flex-col items-center py-10 text-center">
              <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-secondary">
                {filePath ? (
                  <FileText className="size-5 text-secondary-foreground" />
                ) : (
                  <Upload className="size-5 text-secondary-foreground" />
                )}
              </div>
              {filePath ? (
                <>
                  <p className="max-w-sm truncate text-sm font-medium">
                    {filePath.split(/[/\\]/).pop()}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("importWizard.anyLangHint")}
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Button variant="outline" onClick={pickFile}>
                      {t("importWizard.chooseAnother")}
                    </Button>
                    <Button onClick={() => runExtraction(boot.provider!)}>
                      <Sparkles /> {t("importWizard.extractResults")}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">
                    {docType === "vaccine"
                      ? t("importWizard.vaccineReview.choose")
                      : docType === "discharge"
                        ? t("importWizard.dischargeReview.choose")
                        : t("importWizard.chooseLabReport")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("importWizard.fileFormats")}
                  </p>
                  <Button className="mt-4" onClick={pickFile}>
                    <Upload /> {t("importWizard.chooseFile")}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {step.name === "extracting" && (
          <Card className="mx-auto max-w-lg">
            <CardContent className="flex flex-col items-center py-12 text-center">
              <Loader2 className="mb-3 size-6 animate-spin text-primary" />
              <p className="text-sm font-medium">
                {docType === "vaccine"
                  ? t("importWizard.vaccineReview.extracting")
                  : docType === "discharge"
                    ? t("importWizard.dischargeReview.extracting")
                    : t("importWizard.extractingMapping")}
              </p>
              {docType === "lab" && (
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                  {t("importWizard.extractingMappingDetail")}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {(step.name === "review" || step.name === "saving") && step.name === "review" && (
          <ReviewStep
            rows={step.rows}
            index={index}
            biomarkers={boot.biomarkers}
            onChangeRow={(key, biomarkerId) =>
              updateRows(step.rows, (rs) => {
                const row = rs.find((r) => r.key === key)!;
                row.biomarkerId = biomarkerId;
                row.confidence = biomarkerId == null ? "none" : row.confidence;
                row.include = biomarkerId != null ? row.include : false;
                reconvertRow(row, index);
              })
            }
            onToggleInclude={(key) =>
              updateRows(step.rows, (rs) => {
                const row = rs.find((r) => r.key === key)!;
                row.include = !row.include && row.biomarkerId != null;
              })
            }
            onCreateCustom={(key) => setCustomForKey(key)}
            meta={{ date, labName, city, country, panelType }}
            setMeta={{ setDate, setLabName, setCity, setCountry, setPanelType }}
            onSave={() => save(step.rows)}
          />
        )}

        {step.name === "vaccineReview" && (
          <VaccineReviewStep
            rows={step.rows}
            onChangeRow={(key, patch) =>
              setStep({
                name: "vaccineReview",
                rows: step.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)),
              })
            }
            onToggleInclude={(key) =>
              setStep({
                name: "vaccineReview",
                rows: step.rows.map((r) => (r.key === key ? { ...r, include: !r.include } : r)),
              })
            }
            onSave={() => saveVaccines(step.rows)}
          />
        )}

        {step.name === "dischargeReview" && (
          <DischargeReviewStep
            meta={step.meta}
            rows={step.rows}
            onChangeMeta={(patch) =>
              setStep({
                name: "dischargeReview",
                meta: { ...step.meta, ...patch },
                rows: step.rows,
              })
            }
            onChangeRow={(key, name) =>
              setStep({
                name: "dischargeReview",
                meta: step.meta,
                rows: step.rows.map((r) => (r.key === key ? { ...r, name } : r)),
              })
            }
            onToggleInclude={(key) =>
              setStep({
                name: "dischargeReview",
                meta: step.meta,
                rows: step.rows.map((r) => (r.key === key ? { ...r, include: !r.include } : r)),
              })
            }
            onSave={() => saveDischarge(step.meta, step.rows)}
          />
        )}

        {step.name === "saving" && <Loading label={t("importWizard.savingPanel")} />}
      </div>

      <CreateBiomarkerDialog
        open={customForKey != null}
        onClose={() => setCustomForKey(null)}
        initialName={customRow?.raw.analyte_en ?? customRow?.raw.raw_label ?? ""}
        initialUnit={customRow?.raw.unit ?? ""}
        initialRefLow={customRange.low}
        initialRefHigh={customRange.high}
        existingCategories={[...new Set(boot.biomarkers.map((b) => b.category))]}
        unitCatalog={allKnownUnits(boot.biomarkers.map((b) => b.defaultUnit))}
        onCreated={async (id) => {
          const key = customForKey;
          setCustomForKey(null);
          await reloadBoot();
          if (step.name === "review" && key != null) {
            updateRows(step.rows, (rs) => {
              const row = rs.find((r) => r.key === key);
              if (row) {
                row.biomarkerId = id;
                row.confidence = "exact";
                row.include = true;
              }
            });
          }
        }}
      />
    </>
  );
}

function BackLink() {
  return (
    <Link
      to="/labs"
      className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" /> Lab results
    </Link>
  );
}

function ConfidenceBadge({ confidence }: { confidence: MappedRow["confidence"] }) {
  const { t } = useI18n();
  switch (confidence) {
    case "exact":
      return <Badge variant="success">exact</Badge>;
    case "translated":
      return (
        <Badge variant="warning" title={t("importWizard.translatedHint")}>
          translated
        </Badge>
      );
    case "fuzzy":
      return <Badge variant="warning">fuzzy</Badge>;
    case "ai":
      return <Badge>AI</Badge>;
    case "none":
      return <Badge variant="destructive">unmatched</Badge>;
  }
}

function ReviewStep({
  rows,
  index,
  biomarkers,
  onChangeRow,
  onToggleInclude,
  onCreateCustom,
  meta,
  setMeta,
  onSave,
}: {
  rows: ReviewRow[];
  index: ReturnType<typeof buildBiomarkerIndex>;
  biomarkers: Biomarker[];
  onChangeRow: (key: number, biomarkerId: number | null) => void;
  onToggleInclude: (key: number) => void;
  onCreateCustom: (key: number) => void;
  meta: {
    date: string;
    labName: string;
    city: string;
    country: string;
    panelType: "blood" | "urine" | "other";
  };
  setMeta: {
    setDate: (v: string) => void;
    setLabName: (v: string) => void;
    setCity: (v: string) => void;
    setCountry: (v: string) => void;
    setPanelType: (v: "blood" | "urine" | "other") => void;
  };
  onSave: () => void;
}) {
  const { t } = useI18n();
  const includedCount = rows.filter((r) => r.include && r.biomarkerId != null).length;
  const duplicates = rows.filter((r) => r.include && r.duplicate).length;

  const byCategory = new Map<string, Biomarker[]>();
  for (const b of biomarkers) {
    const list = byCategory.get(b.category) ?? [];
    list.push(b);
    byCategory.set(b.category, list);
  }
  const biomarkerOptions: ComboboxOption[] = [...byCategory.entries()].flatMap(
    ([category, items]) =>
      items.map((b) => ({
        value: String(b.id),
        label: b.canonicalName,
        group: category,
        keywords: b.aliases,
      })),
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("importWizard.reviewExtractedResults")}</CardTitle>
          <CardDescription>
            Check each mapping before saving. Green = the printed label is an exact dictionary
            match; amber = matched via translation or fuzzy similarity (verify these); blue =
            AI-suggested; red = unrecognized. Original labels are kept for audit.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">{t("common.save")}</TableHead>
                <TableHead>{t("labPanelDetail.tableColumns.sourceLabel")}</TableHead>
                <TableHead>{t("fields.value")}</TableHead>
                <TableHead>{t("labPanelDetail.tableColumns.biomarker")}</TableHead>
                <TableHead>{t("importWizard.matchColumn")}</TableHead>
                <TableHead>{t("labPanelDetail.tableColumns.normalized")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const bio = row.biomarkerId != null ? index.byId.get(row.biomarkerId) : undefined;
                return (
                  <TableRow key={row.key}>
                    <TableCell>
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--primary)]"
                        checked={row.include}
                        disabled={row.biomarkerId == null}
                        onChange={() => onToggleInclude(row.key)}
                      />
                    </TableCell>
                    <TableCell className="max-w-44">
                      <p className="truncate text-sm" title={row.raw.raw_label}>
                        {row.raw.raw_label}
                      </p>
                      {row.raw.analyte_en &&
                        row.raw.analyte_en.toLowerCase() !== row.raw.raw_label.toLowerCase() && (
                          <p
                            className="truncate text-[10px] italic text-muted-foreground"
                            title={row.raw.analyte_en}
                          >
                            ≈ {row.raw.analyte_en}
                          </p>
                        )}
                      {row.raw.ref_range_text && (
                        <p className="text-[10px] text-muted-foreground">
                          ref: {row.raw.ref_range_text}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {formatValue(row.raw.value)} {row.raw.unit}
                    </TableCell>
                    <TableCell className="min-w-52">
                      <Combobox
                        value={row.biomarkerId != null ? String(row.biomarkerId) : null}
                        onChange={(v) => onChangeRow(row.key, v ? Number(v) : null)}
                        options={biomarkerOptions}
                        placeholder={t("importWizard.notMapped")}
                      />
                      {row.biomarkerId == null && (
                        <button
                          className="mt-1 inline-flex cursor-pointer items-center gap-1 text-[11px] text-primary hover:underline"
                          onClick={() => onCreateCustom(row.key)}
                        >
                          <Plus className="size-3" /> Create custom biomarker
                        </button>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <ConfidenceBadge confidence={row.confidence} />
                        {row.duplicate && row.include && (
                          <Badge variant="destructive">duplicate</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {row.conversion == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : row.conversion.ok ? (
                        <span className="tabular-nums text-muted-foreground">
                          {formatValue(row.conversion.value)} {row.conversion.unit}
                        </span>
                      ) : (
                        <Badge
                          variant="warning"
                          title={`No known conversion ${row.raw.unit} → ${bio?.defaultUnit}`}
                        >
                          unit?
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="px-5 pb-4">
            <AiDisclaimer />
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>{t("importWizard.panelDetailsTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label={t("fields.date")}>
            <DateInput value={meta.date} onChange={setMeta.setDate} />
          </Field>
          <Field label={t("labPanelNew.fields.labName")}>
            <Input value={meta.labName} onChange={(e) => setMeta.setLabName(e.target.value)} />
          </Field>
          <Field label={t("fields.city")}>
            <Input value={meta.city} onChange={(e) => setMeta.setCity(e.target.value)} />
          </Field>
          <Field label={t("fields.country")}>
            <Input value={meta.country} onChange={(e) => setMeta.setCountry(e.target.value)} />
          </Field>
          <Field label={t("fields.type")}>
            <SelectMenu
              value={meta.panelType}
              onChange={(v) => setMeta.setPanelType(v as "blood" | "urine" | "other")}
              options={[
                { value: "blood", label: t("types.blood") },
                { value: "urine", label: t("types.urine") },
                { value: "other", label: t("types.other") },
              ]}
            />
          </Field>
        </CardContent>
      </Card>

      <div className="mt-5 flex items-center justify-end gap-3">
        {duplicates > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertTriangle className="size-3.5" /> {duplicates} duplicate mapping
            {duplicates > 1 ? "s" : ""} selected
          </p>
        )}
        <Button onClick={onSave} disabled={includedCount === 0 || !meta.date}>
          Confirm & save {includedCount} result{includedCount === 1 ? "" : "s"}
        </Button>
      </div>
    </>
  );
}

/**
 * Best-effort parse of a printed reference-range string into low/high input
 * strings: "3.5 - 5.0" → {low:"3.5", high:"5.0"}, "< 5" → {high:"5"},
 * "> 1.0" → {low:"1.0"}, "0,9–1,3" → {low:"0.9", high:"1.3"}.
 */
function parseRefRange(text: string | null): { low: string; high: string } {
  if (!text) return { low: "", high: "" };
  // Comma decimals → dots; no leading minus (range hyphens aren't sign).
  const [first, second] = text.replace(/,/g, ".").match(/\d+(?:\.\d+)?/g) ?? [];
  if (first && second) return { low: first, high: second };
  if (first) {
    if (/[<≤]/.test(text)) return { low: "", high: first };
    if (/[>≥]/.test(text)) return { low: first, high: "" };
  }
  return { low: "", high: "" };
}

/** Best-effort dose split: "500 mg" → { amount: 500, unit: "mg" }. */
function parseDose(dose: string | null): { amount: number | null; unit: string | null } {
  if (!dose) return { amount: null, unit: null };
  const m = /^\s*([\d.,]+)\s*([^\d\s].*)?$/.exec(dose.trim());
  if (!m) return { amount: null, unit: dose.trim() || null };
  const amount = Number.parseFloat(m[1].replace(",", "."));
  return {
    amount: Number.isFinite(amount) ? amount : null,
    unit: m[2]?.trim() || null,
  };
}

function SelectTypeStep({
  value,
  onChange,
  onContinue,
}: {
  value: DocType | null;
  onChange: (v: DocType) => void;
  onContinue: () => void;
}) {
  const { t } = useI18n();
  const options: { type: DocType; icon: typeof TestTubes; label: string; description: string }[] = [
    {
      type: "lab",
      icon: TestTubes,
      label: t("importWizard.docTypes.lab"),
      description: t("importWizard.docTypes.labDescription"),
    },
    {
      type: "vaccine",
      icon: Syringe,
      label: t("importWizard.docTypes.vaccine"),
      description: t("importWizard.docTypes.vaccineDescription"),
    },
    {
      type: "discharge",
      icon: FileText,
      label: t("importWizard.docTypes.discharge"),
      description: t("importWizard.docTypes.dischargeDescription"),
    },
  ];

  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle>{t("importWizard.selectType.title")}</CardTitle>
        <CardDescription>{t("importWizard.selectType.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {options.map((o) => {
          const Icon = o.icon;
          const selected = value === o.type;
          return (
            <button
              key={o.type}
              type="button"
              onClick={() => onChange(o.type)}
              className={cn(
                "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                selected ? "border-primary bg-primary/5" : "hover:bg-muted/50",
              )}
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary">
                <Icon className="size-4.5 text-secondary-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">{o.label}</p>
                <p className="text-xs text-muted-foreground">{o.description}</p>
              </div>
            </button>
          );
        })}
        <Button className="mt-2 self-end" disabled={value == null} onClick={onContinue}>
          {t("importWizard.selectType.continue")}
        </Button>
      </CardContent>
    </Card>
  );
}

function ReviewBanner() {
  const { t } = useI18n();
  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-medium">{t("importWizard.reviewBanner.title")}</p>
        <p className="text-xs opacity-90">{t("importWizard.reviewBanner.description")}</p>
      </div>
    </div>
  );
}

function VaccineReviewStep({
  rows,
  onChangeRow,
  onToggleInclude,
  onSave,
}: {
  rows: VaccineRow[];
  onChangeRow: (key: number, patch: Partial<VaccineRow>) => void;
  onToggleInclude: (key: number) => void;
  onSave: () => void;
}) {
  const { t } = useI18n();
  const included = rows.filter((r) => r.include);
  const canSave = included.length > 0 && included.every((r) => r.vaccineName.trim() && r.date);

  return (
    <>
      <ReviewBanner />
      <Card>
        <CardHeader>
          <CardTitle>{t("importWizard.vaccineReview.title")}</CardTitle>
          <CardDescription>{t("importWizard.vaccineReview.description")}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">{t("common.save")}</TableHead>
                <TableHead>{t("importWizard.vaccineReview.columns.vaccine")}</TableHead>
                <TableHead>{t("fields.date")}</TableHead>
                <TableHead className="w-16">
                  {t("importWizard.vaccineReview.columns.dose")}
                </TableHead>
                <TableHead>{t("importWizard.vaccineReview.columns.manufacturer")}</TableHead>
                <TableHead>{t("importWizard.vaccineReview.columns.batch")}</TableHead>
                <TableHead>{t("importWizard.vaccineReview.columns.expires")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const missing = row.include && (!row.vaccineName.trim() || !row.date);
                return (
                  <TableRow key={row.key}>
                    <TableCell>
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--primary)]"
                        checked={row.include}
                        onChange={() => onToggleInclude(row.key)}
                      />
                    </TableCell>
                    <TableCell className="min-w-44">
                      <Input
                        value={row.vaccineName}
                        onChange={(e) => onChangeRow(row.key, { vaccineName: e.target.value })}
                        className={missing && !row.vaccineName.trim() ? "border-destructive" : ""}
                      />
                    </TableCell>
                    <TableCell className="min-w-36">
                      <DateInput
                        value={row.date ?? ""}
                        onChange={(v) => onChangeRow(row.key, { date: v || null })}
                        clearable
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={row.doseNumber != null ? String(row.doseNumber) : ""}
                        onChange={(e) => {
                          const n = Number.parseInt(e.target.value, 10);
                          onChangeRow(row.key, { doseNumber: Number.isFinite(n) ? n : null });
                        }}
                        inputMode="numeric"
                      />
                    </TableCell>
                    <TableCell className="min-w-36">
                      <Input
                        value={row.manufacturer ?? ""}
                        onChange={(e) =>
                          onChangeRow(row.key, { manufacturer: e.target.value || null })
                        }
                      />
                    </TableCell>
                    <TableCell className="min-w-28">
                      <Input
                        value={row.batchNumber ?? ""}
                        onChange={(e) =>
                          onChangeRow(row.key, { batchNumber: e.target.value || null })
                        }
                      />
                    </TableCell>
                    <TableCell className="min-w-36">
                      <DateInput
                        value={row.expiresAt ?? ""}
                        onChange={(v) => onChangeRow(row.key, { expiresAt: v || null })}
                        clearable
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="px-5 pb-4">
            <AiDisclaimer />
          </div>
        </CardContent>
      </Card>

      <div className="mt-5 flex justify-end">
        <Button onClick={onSave} disabled={!canSave}>
          {t("importWizard.vaccineReview.save", { count: String(included.length) })}
        </Button>
      </div>
    </>
  );
}

function DischargeReviewStep({
  meta,
  rows,
  onChangeMeta,
  onChangeRow,
  onToggleInclude,
  onSave,
}: {
  meta: DischargeMeta;
  rows: DischargeRow[];
  onChangeMeta: (patch: Partial<DischargeMeta>) => void;
  onChangeRow: (key: number, name: string) => void;
  onToggleInclude: (key: number) => void;
  onSave: () => void;
}) {
  const { t } = useI18n();
  const included = rows.filter((r) => r.include && r.name.trim());

  return (
    <>
      <ReviewBanner />
      <Card>
        <CardHeader>
          <CardTitle>{t("importWizard.dischargeReview.title")}</CardTitle>
          <CardDescription>{t("importWizard.dischargeReview.description")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Field label={t("fields.date")}>
            <DateInput
              value={meta.visitDate}
              onChange={(v) => onChangeMeta({ visitDate: v })}
              clearable
            />
          </Field>
          <Field label={t("visits.fields.clinic")}>
            <Input value={meta.clinic} onChange={(e) => onChangeMeta({ clinic: e.target.value })} />
          </Field>
          <Field label={t("visits.fields.doctor")}>
            <Input
              value={meta.doctorName}
              onChange={(e) => onChangeMeta({ doctorName: e.target.value })}
            />
          </Field>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">{t("common.save")}</TableHead>
                <TableHead className="w-28">
                  {t("importWizard.dischargeReview.typeColumn")}
                </TableHead>
                <TableHead>{t("fields.name")}</TableHead>
                <TableHead>{t("importWizard.dischargeReview.detailColumn")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell>
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--primary)]"
                      checked={row.include}
                      onChange={() => onToggleInclude(row.key)}
                    />
                  </TableCell>
                  <TableCell>
                    {row.type === "diagnosis" ? (
                      <Badge variant="secondary">
                        {t("importWizard.dischargeReview.diagnosisBadge")}
                      </Badge>
                    ) : (
                      <Badge>{t("importWizard.dischargeReview.medicationBadge")}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="min-w-52">
                    <Input
                      value={row.name}
                      onChange={(e) => onChangeRow(row.key, e.target.value)}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {row.type === "diagnosis" ? (row.icdCode ?? "—") : (row.dose ?? "—")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="px-5 pb-4">
            <AiDisclaimer />
          </div>
        </CardContent>
      </Card>

      <div className="mt-5 flex justify-end">
        <Button onClick={onSave} disabled={included.length === 0}>
          {t("importWizard.dischargeReview.save", { count: String(included.length) })}
        </Button>
      </div>
    </>
  );
}
