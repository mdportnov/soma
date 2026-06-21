/**
 * Lab-report import module (§4) — the reference pipeline.
 *
 * Phase 1: structured extraction (analyte rows + panel metadata).
 * Phase 2: deterministic dictionary mapping (exact → alias → fuzzy → narrow AI
 *          disambiguation) via `pipeline/map.ts`.
 * Phase 3: the user confirms each mapping before anything reaches `lab_result`.
 *
 * This is the only module with a large dictionary "resolution"; the others use
 * the lighter enum resolver in `import/resolve.ts`.
 */

import * as React from "react";
import { AlertTriangle, Plus, TestTubes } from "lucide-react";
import type { Biomarker } from "@/db/schema";
import { EXTRACTION_PROMPT } from "../../prompts";
import type { LabExtraction, RawExtraction } from "../../types";
import {
  buildBiomarkerIndex,
  mapExtractions,
  markDuplicates,
  reconvertRow,
  type MappedRow,
} from "../../pipeline/map";
import type { DocTypeModule, ReviewProps } from "../registry";
import {
  asArray,
  asObject,
  boolOrNull,
  expectObject,
  isoDateOrNull,
  nullableStr,
  numberOrNull,
} from "../validate";
import { createAttachment, createPanelWithResults, updateAttachment } from "@/db/repos";
import { storeAttachmentFile, mimeFromPath } from "@/lib/attachments";
import { Field } from "@/components/app/Field";
import { AiDisclaimer } from "@/components/app/AiDisclaimer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { SelectMenu } from "@/components/ui/select-menu";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
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
import { CreateBiomarkerDialog } from "@/pages/Biomarkers";
import { formatValue, todayISO } from "@/lib/utils";
import { allKnownUnits } from "@/lib/units";
import { rememberUnit, recallUnit } from "@/lib/unit-memory";
import { useI18n } from "@/lib/i18n";

type PanelType = "blood" | "urine" | "other";

type ReviewRow = MappedRow & { include: boolean; key: number };

export type LabDraft = {
  rows: ReviewRow[];
  meta: { date: string; labName: string; city: string; country: string; panelType: PanelType };
  skipped: { label: string; rawValue: string }[];
  /** Collection date couldn't be read and we fell back to today — warn the user. */
  dateGuessed: boolean;
};

/** Hard cap on surfaced skipped rows — a runaway report shouldn't bloat state. */
const MAX_SKIPPED_ROWS = 50;

/**
 * Accepts the panel object `{collection_date, lab_name, fasting, results}` and,
 * for resilience, a bare `results` array from a model that ignored the schema.
 */
function validateLabExtraction(parsed: unknown): LabExtraction {
  const skipped: NonNullable<LabExtraction["skipped"]> = [];
  if (Array.isArray(parsed)) {
    return {
      collectionDate: null,
      labName: null,
      fasting: null,
      results: validateExtractions(parsed, skipped),
      skipped: skipped.length ? skipped : undefined,
    };
  }
  const o = expectObject(parsed, "Lab extraction");
  return {
    collectionDate: isoDateOrNull(o.collection_date),
    labName: nullableStr(o.lab_name),
    fasting: boolOrNull(o.fasting),
    results: validateExtractions(o.results, skipped),
    skipped: skipped.length ? skipped : undefined,
  };
}

/**
 * Validate analyte rows. Rows with a real label but a non-numeric result
 * (qualitative "positive"/"negative", titres) aren't silently dropped — they're
 * collected into `skipped` (capped) so the UI can disclose them.
 */
function validateExtractions(
  parsed: unknown,
  skipped: NonNullable<LabExtraction["skipped"]>,
): RawExtraction[] {
  const rows: RawExtraction[] = [];
  for (const item of asArray(parsed)) {
    const o = asObject(item);
    if (!o) continue;
    const rawLabel = typeof o.raw_label === "string" ? o.raw_label.trim().slice(0, 300) : "";
    if (!rawLabel) continue;
    const value = numberOrNull(o.value);
    if (value == null) {
      if (skipped.length < MAX_SKIPPED_ROWS) {
        const rawValue =
          typeof o.value === "string" || typeof o.value === "number" ? String(o.value) : "";
        skipped.push({ label: rawLabel, rawValue: rawValue.slice(0, 100) });
      }
      continue;
    }
    rows.push({
      raw_label: rawLabel,
      analyte_en:
        typeof o.analyte_en === "string" ? o.analyte_en.trim().slice(0, 120) || null : null,
      value,
      unit: typeof o.unit === "string" ? o.unit.trim().slice(0, 40) : "",
      ref_range_text:
        typeof o.ref_range_text === "string" ? o.ref_range_text.trim().slice(0, 120) : null,
      // Source page must be a positive integer — a 0/negative/NaN page would
      // break the "jump to source" verify workflow (a core safety feature).
      page: Number.isInteger(o.page) && (o.page as number) >= 1 ? (o.page as number) : null,
    });
  }
  return rows;
}

export const labModule: DocTypeModule<LabDraft> = {
  id: "lab",
  icon: TestTubes,
  i18nKey: "labReview",

  async prepare(doc, ctx): Promise<LabDraft> {
    const parsed = await ctx.provider.extractStructured(doc, EXTRACTION_PROMPT, 16384);
    const extraction = validateLabExtraction(parsed);
    const mapped = await mapExtractions(extraction.results, ctx.biomarkers, ctx.provider);
    // Per-lab unit memory: when this lab's report didn't print a unit for a marker
    // we've recorded from it before, default to the remembered unit and recompute
    // the conversion. Only fills an empty unit — never overrides a printed one.
    const memIndex = buildBiomarkerIndex(ctx.biomarkers);
    for (const m of mapped) {
      if (m.biomarkerId != null && !m.raw.unit) {
        const remembered = recallUnit(extraction.labName, m.biomarkerId);
        if (remembered) {
          m.raw.unit = remembered;
          reconvertRow(m, memIndex);
        }
      }
    }
    return {
      rows: mapped.map((m, i) => ({ ...m, include: m.biomarkerId != null, key: i })),
      meta: {
        // An old report imported today keeps its real collection date — essential
        // for the trend; fall back to today and flag it when illegible.
        date: extraction.collectionDate ?? todayISO(),
        labName: extraction.labName ?? "",
        city: "",
        country: "",
        panelType: "blood",
      },
      skipped: extraction.skipped ?? [],
      dateGuessed: extraction.collectionDate == null,
    };
  },

  isEmpty: (draft) => draft.rows.length === 0,

  Review: LabReview,

  async save(draft, ctx): Promise<string> {
    let sourceFileId: number | null = null;
    if (ctx.sourceFilePath) {
      const stored = await storeAttachmentFile(ctx.sourceFilePath);
      const mime = mimeFromPath(ctx.sourceFilePath);
      sourceFileId = await createAttachment({
        profileId: ctx.profileId,
        filePath: stored,
        mimeType: mime,
        kind: mime === "application/pdf" ? "lab_pdf" : "photo",
        linkedEntityType: "lab_panel",
      });
    }

    const byId = new Map<number, Biomarker>(ctx.biomarkers.map((b) => [b.id, b]));
    const included = draft.rows.filter((r) => r.include && r.biomarkerId != null);
    const results = included.map((r) => ({
      biomarkerId: r.biomarkerId!,
      value: r.raw.value,
      unit: r.raw.unit || byId.get(r.biomarkerId!)?.defaultUnit || "",
      rawLabel: r.raw.raw_label,
      sourcePage: r.raw.page,
      // "none" only survives here when the user hand-picked the biomarker for a
      // previously-unmatched row, so that selection is author-trusted.
      confidence: r.confidence === "none" ? ("manual" as const) : r.confidence,
    }));
    const panelId = await createPanelWithResults(
      {
        profileId: ctx.profileId,
        date: draft.meta.date,
        labName: draft.meta.labName.trim() || null,
        city: draft.meta.city.trim() || null,
        country: draft.meta.country.trim() || null,
        panelType: draft.meta.panelType,
        importMethod: "ai",
        sourceFileId,
      },
      results,
      byId,
    );
    // Remember each (lab, biomarker) → unit so the next import from this lab
    // defaults to the same unit — most useful when the document omits it.
    for (const res of results) rememberUnit(draft.meta.labName, res.biomarkerId, res.unit);
    if (sourceFileId != null) {
      await updateAttachment(sourceFileId, { linkedEntityId: panelId });
    }
    return `/labs/${panelId}`;
  },
};

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

function LabReview({ draft, setDraft, ctx, onSave }: ReviewProps<LabDraft>) {
  const { t } = useI18n();
  const [customForKey, setCustomForKey] = React.useState<number | null>(null);
  const [skippedDismissed, setSkippedDismissed] = React.useState(false);
  const [showSkipped, setShowSkipped] = React.useState(false);

  const index = React.useMemo(() => buildBiomarkerIndex(ctx.biomarkers), [ctx.biomarkers]);
  const { rows, meta, skipped, dateGuessed } = draft;

  const includedCount = rows.filter((r) => r.include && r.biomarkerId != null).length;
  const duplicates = rows.filter((r) => r.include && r.duplicate).length;

  const biomarkerOptions: ComboboxOption[] = React.useMemo(() => {
    const byCategory = new Map<string, Biomarker[]>();
    for (const b of ctx.biomarkers) {
      const list = byCategory.get(b.category) ?? [];
      list.push(b);
      byCategory.set(b.category, list);
    }
    return [...byCategory.entries()].flatMap(([category, items]) =>
      items.map((b) => ({
        value: String(b.id),
        label: b.canonicalName,
        group: category,
        keywords: b.aliases,
      })),
    );
  }, [ctx.biomarkers]);

  const updateRows = (mutate: (rs: ReviewRow[]) => void) => {
    const next = rows.map((r) => ({ ...r }));
    mutate(next);
    markDuplicates(next);
    setDraft({ ...draft, rows: next });
  };

  const customRow = customForKey != null ? rows.find((r) => r.key === customForKey) : undefined;
  const customRange = parseRefRange(customRow?.raw.ref_range_text ?? null);

  return (
    <>
      {skipped.length > 0 && !skippedDismissed && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p>{t("importErrors.droppedRows", { count: String(skipped.length) })}</p>
            <button
              type="button"
              className="mt-1 inline-flex cursor-pointer items-center gap-1 text-xs underline-offset-2 hover:underline"
              onClick={() => setShowSkipped((v) => !v)}
            >
              {t("importErrors.showDropped")}
            </button>
            {showSkipped && (
              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs opacity-90">
                {skipped.map((s, i) => (
                  <li key={i} className="truncate" title={`${s.label}: ${s.rawValue}`}>
                    {s.label}
                    {s.rawValue ? ` — ${s.rawValue}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            className="cursor-pointer text-warning/70 hover:text-warning"
            onClick={() => setSkippedDismissed(true)}
          >
            ✕
          </button>
        </div>
      )}
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
                        onChange={() =>
                          updateRows((rs) => {
                            const r = rs.find((x) => x.key === row.key)!;
                            r.include = !r.include && r.biomarkerId != null;
                          })
                        }
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
                        onChange={(v) =>
                          updateRows((rs) => {
                            const r = rs.find((x) => x.key === row.key)!;
                            r.biomarkerId = v ? Number(v) : null;
                            r.confidence = r.biomarkerId == null ? "none" : r.confidence;
                            r.include = r.biomarkerId != null ? r.include : false;
                            reconvertRow(r, index);
                          })
                        }
                        options={biomarkerOptions}
                        placeholder={t("importWizard.notMapped")}
                      />
                      {row.biomarkerId == null && (
                        <button
                          className="mt-1 inline-flex cursor-pointer items-center gap-1 text-[11px] text-primary hover:underline"
                          onClick={() => setCustomForKey(row.key)}
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
            <DateInput
              value={meta.date}
              onChange={(v) =>
                setDraft({ ...draft, meta: { ...meta, date: v }, dateGuessed: false })
              }
            />
            {dateGuessed && (
              <p className="mt-1 flex items-start gap-1 text-[11px] text-warning">
                <AlertTriangle className="mt-px size-3 shrink-0" />
                {t("importErrors.dateNotRecognized")}
              </p>
            )}
          </Field>
          <Field label={t("labPanelNew.fields.labName")}>
            <Input
              value={meta.labName}
              onChange={(e) => setDraft({ ...draft, meta: { ...meta, labName: e.target.value } })}
            />
          </Field>
          <Field label={t("fields.city")}>
            <Input
              value={meta.city}
              onChange={(e) => setDraft({ ...draft, meta: { ...meta, city: e.target.value } })}
            />
          </Field>
          <Field label={t("fields.country")}>
            <Input
              value={meta.country}
              onChange={(e) => setDraft({ ...draft, meta: { ...meta, country: e.target.value } })}
            />
          </Field>
          <Field label={t("fields.type")}>
            <SelectMenu
              value={meta.panelType}
              onChange={(v) => setDraft({ ...draft, meta: { ...meta, panelType: v as PanelType } })}
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
        <Button onClick={onSave} disabled={includedCount === 0 || !meta.date || duplicates > 0}>
          Confirm & save {includedCount} result{includedCount === 1 ? "" : "s"}
        </Button>
      </div>

      <CreateBiomarkerDialog
        open={customForKey != null}
        onClose={() => setCustomForKey(null)}
        initialName={customRow?.raw.analyte_en ?? customRow?.raw.raw_label ?? ""}
        initialUnit={customRow?.raw.unit ?? ""}
        initialRefLow={customRange.low}
        initialRefHigh={customRange.high}
        existingCategories={[...new Set(ctx.biomarkers.map((b) => b.category))]}
        unitCatalog={allKnownUnits(ctx.biomarkers.map((b) => b.defaultUnit))}
        onCreated={async (id) => {
          const key = customForKey;
          setCustomForKey(null);
          await ctx.reloadLookups();
          if (key != null) {
            updateRows((rs) => {
              const r = rs.find((x) => x.key === key);
              if (r) {
                r.biomarkerId = id;
                r.confidence = "exact";
                r.include = true;
              }
            });
          }
        }}
      />
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
  const [first, second] = text.replace(/,/g, ".").match(/\d+(?:\.\d+)?/g) ?? [];
  if (first && second) return { low: first, high: second };
  if (first) {
    if (/[<≤]/.test(text)) return { low: "", high: first };
    if (/[>≥]/.test(text)) return { low: first, high: "" };
  }
  return { low: "", high: "" };
}
