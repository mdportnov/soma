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
  Upload,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import {
  createAttachment,
  createPanelWithResults,
  listBiomarkers,
  updateAttachment,
} from "@/db/repos";
import { getConfiguredProvider } from "@/ai";
import type { AIProvider, RawExtraction } from "@/ai/types";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Select } from "@/components/ui/select";
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
import { formatValue, todayISO } from "@/lib/utils";
import { allKnownUnits } from "@/lib/units";
import { useI18n } from "@/lib/i18n";
import type { Biomarker } from "@/db/schema";

type Step =
  | { name: "pick" }
  | { name: "extracting" }
  | { name: "review"; rows: ReviewRow[] }
  | { name: "saving" };

type ReviewRow = MappedRow & { include: boolean; key: number };

export function ImportWizard() {
  const { profileId } = useApp();
  const { t } = useI18n();
  const navigate = useNavigate();

  const {
    data: boot,
    loading: booting,
    reload: reloadBoot,
  } = useQuery(async () => {
    const [provider, biomarkers] = await Promise.all([getConfiguredProvider(), listBiomarkers()]);
    return { provider, biomarkers };
  }, []);

  const [filePath, setFilePath] = React.useState<string | null>(null);
  const [step, setStep] = React.useState<Step>({ name: "pick" });
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
      // Phase 1: raw extraction (structure only, never written to lab_result).
      const raws: RawExtraction[] = await provider.extractFromDocument(doc);
      if (!raws.length) throw new Error("No quantitative results found in the document.");
      // Phase 2: deterministic mapping + narrow AI disambiguation.
      const mapped = await mapExtractions(raws, boot.biomarkers, provider);
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
                    Any language, any lab, any country — scans and photos included.
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Button variant="outline" onClick={pickFile}>
                      Choose another
                    </Button>
                    <Button onClick={() => runExtraction(boot.provider!)}>
                      <Sparkles /> Extract results
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">{t("importWizard.chooseLabReport")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">PDF, JPG, PNG or WebP</p>
                  <Button className="mt-4" onClick={pickFile}>
                    <Upload /> Choose file
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
              <p className="text-sm font-medium">Extracting and mapping…</p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                Phase 1: structured extraction. Phase 2: matching against your biomarker dictionary
                (exact → alias → fuzzy → AI disambiguation).
              </p>
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

        {step.name === "saving" && <Loading label={t("importWizard.savingPanel")} />}
      </div>

      <CreateBiomarkerDialog
        open={customForKey != null}
        onClose={() => setCustomForKey(null)}
        initialName={
          step.name === "review" && customForKey != null
            ? (step.rows.find((r) => r.key === customForKey)?.raw.raw_label ?? "")
            : ""
        }
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
  switch (confidence) {
    case "exact":
      return <Badge variant="success">exact</Badge>;
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
            Check each mapping before saving. Green = exact dictionary match, yellow = fuzzy match,
            blue = AI-suggested, red = unrecognized. Original labels are kept for audit.
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
            <Select
              value={meta.panelType}
              onChange={(e) => setMeta.setPanelType(e.target.value as "blood" | "urine" | "other")}
            >
              <option value="blood">{t("types.blood")}</option>
              <option value="urine">{t("types.urine")}</option>
              <option value="other">{t("types.other")}</option>
            </Select>
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
