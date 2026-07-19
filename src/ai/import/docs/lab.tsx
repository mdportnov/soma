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
import { AlertTriangle, ArrowLeftRight, CornerDownRight, Plus, TestTubes, X } from "lucide-react";
import type { Biomarker, SampleType } from "@/db/schema";
import { SAMPLE_TYPES } from "@/db/schema";
import { EXTRACTION_PROMPT, buildCustomBiomarkerPrompt, extractJson } from "../../prompts";
import type {
  LabExtraction,
  RawExtraction,
  RawQualitativeExtraction,
  SuggestedBiomarker,
} from "../../types";
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
import { createAttachment, createPanelFindings, createPanelWithResults, updateAttachment } from "@/db/repos";
import { storeAttachmentFile, mimeFromPath } from "@/lib/attachments";
import { Field } from "@/components/app/Field";
import { AiDisclaimer } from "@/components/app/AiDisclaimer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { ChipSelect } from "@/components/ui/chip-select";
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

type ReviewRow = MappedRow & {
  include: boolean;
  key: number;
  /** Unmapped rows default to being kept as panel findings; mapping the row or
   *  creating a custom biomarker takes it out of the findings set. */
  saveAsFinding: boolean;
};

/** A qualitative / non-dictionary finding staged for save with the panel. */
export type FindingDraft = {
  key: number;
  rawLabel: string;
  nameEn: string | null;
  valueText: string;
  valueNumeric: number | null;
  unit: string | null;
  refRangeText: string | null;
  sourcePage: number | null;
  include: boolean;
};

export type LabDraft = {
  rows: ReviewRow[];
  /** Qualitative results from the report (editable on review). Unmapped numeric
   *  rows join at save time via their `saveAsFinding` flag instead. */
  findings: FindingDraft[];
  meta: {
    date: string;
    labName: string;
    city: string;
    country: string;
    /** A check-up can mix specimens (blood + urine + stool). */
    sampleTypes: SampleType[];
    /** Raw cost input (USD) kept as a string so the field can be empty/partial. */
    cost: string;
  };
  skipped: { label: string; rawValue: string }[];
  /** Collection date couldn't be read and we fell back to today — warn the user. */
  dateGuessed: boolean;
};

/** Parses the free-text cost field into a non-negative USD number, or null. */
function parseCost(raw: string): number | null {
  const n = Number.parseFloat(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Trust order for picking the survivor when rows collide on one biomarker. */
const CONFIDENCE_RANK: Record<MappedRow["confidence"], number> = {
  exact: 0,
  translated: 1,
  fuzzy: 2,
  ai: 3,
  none: 4,
};

/** The strongest row in a same-biomarker group: best confidence, then candidate
 *  score, then a row whose unit actually converts cleanly. */
function bestRowKey(group: ReviewRow[]): number {
  return [...group].sort((a, b) => {
    const rank = CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence];
    if (rank !== 0) return rank;
    const score = (b.candidates[0]?.score ?? 0) - (a.candidates[0]?.score ?? 0);
    if (score !== 0) return score;
    return Number(b.conversion?.ok ?? false) - Number(a.conversion?.ok ?? false);
  })[0].key;
}

/** Groups mapped rows by biomarker; only collisions (size > 1) are returned. */
function duplicateGroups(rows: ReviewRow[]): Map<number, ReviewRow[]> {
  const byBio = new Map<number, ReviewRow[]>();
  for (const r of rows) {
    if (r.biomarkerId == null) continue;
    (byBio.get(r.biomarkerId) ?? byBio.set(r.biomarkerId, []).get(r.biomarkerId)!).push(r);
  }
  return new Map([...byBio].filter(([, g]) => g.length > 1));
}

/** Default the duplicate decision: keep only the strongest row of each colliding
 *  group selected, so the user starts from a clean, save-ready state. */
function autoResolveDuplicates(rows: ReviewRow[]): void {
  for (const [, group] of duplicateGroups(rows)) {
    const keep = bestRowKey(group);
    for (const r of group) r.include = r.key === keep && r.biomarkerId != null;
  }
}

/** Review-need order for the table: unmatched first, then rows whose unit
 *  won't convert, then declining mapping trust; exact matches sink to the
 *  bottom so everything needing eyes sits at the top. */
const REVIEW_PRIORITY: Record<MappedRow["confidence"], number> = {
  none: 0,
  fuzzy: 2,
  ai: 3,
  translated: 4,
  exact: 5,
};

function reviewPriority(r: Pick<ReviewRow, "confidence" | "biomarkerId" | "conversion">): number {
  const p = REVIEW_PRIORITY[r.confidence];
  // A matched row with a broken unit conversion needs attention almost as
  // much as an unmatched one.
  return r.biomarkerId != null && r.conversion != null && !r.conversion.ok
    ? Math.min(p, 1)
    : p;
}

/** Render order: by review priority (neediest first), with duplicate clusters
 *  kept adjacent — a cluster floats to the position of its neediest member and
 *  clusters within one priority band keep document order. */
function clusterForDisplay(rows: ReviewRow[]): ReviewRow[] {
  const firstIdx = new Map<number, number>();
  rows.forEach((r, i) => {
    if (r.biomarkerId != null && !firstIdx.has(r.biomarkerId)) firstIdx.set(r.biomarkerId, i);
  });
  const prio = rows.map(reviewPriority);
  const clusterPrio = rows.map((r, i) =>
    r.biomarkerId != null
      ? Math.min(...rows.flatMap((x, j) => (x.biomarkerId === r.biomarkerId ? [prio[j]] : [])))
      : prio[i],
  );
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const dp = clusterPrio[a.i] - clusterPrio[b.i];
      if (dp !== 0) return dp;
      const ka = a.r.biomarkerId != null ? firstIdx.get(a.r.biomarkerId)! : a.i;
      const kb = b.r.biomarkerId != null ? firstIdx.get(b.r.biomarkerId)! : b.i;
      // Within a duplicate cluster the currently-kept row leads, so the
      // alternates nest directly beneath their primary.
      return ka - kb || Number(b.r.include) - Number(a.r.include) || a.i - b.i;
    })
    .map((x) => x.r);
}

const DIRECTIONS = ["range", "higher_better", "lower_better"] as const;

/** Per-row validation of the model's custom-biomarker drafts — anything
 *  malformed becomes null so a bad apple never breaks the whole batch. */
function validateSuggestions(parsed: unknown): (SuggestedBiomarker | null)[] {
  return asArray(parsed).map((item) => {
    const o = asObject(item);
    if (!o || typeof o.name !== "string" || !o.name.trim()) return null;
    return {
      name: o.name.trim().slice(0, 120),
      category:
        typeof o.category === "string" && o.category.trim()
          ? o.category.trim().slice(0, 60)
          : "Custom",
      unit: typeof o.unit === "string" ? o.unit.trim().slice(0, 40) : "",
      direction: DIRECTIONS.includes(o.direction as (typeof DIRECTIONS)[number])
        ? (o.direction as SuggestedBiomarker["direction"])
        : "range",
    };
  });
}

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
      city: null,
      country: null,
      fasting: null,
      results: validateExtractions(parsed, skipped),
      skipped: skipped.length ? skipped : undefined,
    };
  }
  const o = expectObject(parsed, "Lab extraction");
  return {
    collectionDate: isoDateOrNull(o.collection_date),
    labName: nullableStr(o.lab_name),
    city: nullableStr(o.city),
    country: nullableStr(o.country),
    fasting: boolOrNull(o.fasting),
    results: validateExtractions(o.results, skipped),
    qualitative: validateQualitative(o.qualitative),
    skipped: skipped.length ? skipped : undefined,
  };
}

/** Validate qualitative rows (non-numeric results → panel findings). */
function validateQualitative(parsed: unknown): RawQualitativeExtraction[] {
  const rows: RawQualitativeExtraction[] = [];
  for (const item of asArray(parsed)) {
    const o = asObject(item);
    if (!o) continue;
    const rawLabel = typeof o.raw_label === "string" ? o.raw_label.trim().slice(0, 300) : "";
    const resultText =
      typeof o.result_text === "string" || typeof o.result_text === "number"
        ? String(o.result_text).trim().slice(0, 200)
        : "";
    if (!rawLabel || !resultText) continue;
    rows.push({
      raw_label: rawLabel,
      analyte_en:
        typeof o.analyte_en === "string" ? o.analyte_en.trim().slice(0, 120) || null : null,
      result_text: resultText,
      ref_range_text:
        typeof o.ref_range_text === "string" ? o.ref_range_text.trim().slice(0, 120) : null,
      page: Number.isInteger(o.page) && (o.page as number) >= 1 ? (o.page as number) : null,
    });
  }
  return rows;
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
    // Unmatched rows: one batched AI call drafts a custom-biomarker definition
    // per analyte (name/category/unit/direction), so the review dialog opens
    // pre-filled instead of blank. Best-effort — a failure leaves rows as-is.
    const unmatched = mapped.filter((m) => m.biomarkerId == null);
    if (unmatched.length > 0) {
      try {
        const text = await ctx.provider.chat([
          {
            role: "user",
            content: buildCustomBiomarkerPrompt(
              unmatched.map((u) => u.raw),
              [...new Set(ctx.biomarkers.map((b) => b.category))],
            ),
          },
        ]);
        const specs = validateSuggestions(extractJson(text));
        unmatched.forEach((m, i) => {
          m.suggestion = specs[i] ?? null;
        });
      } catch (e) {
        console.error("custom-biomarker suggestions failed", e);
      }
    }
    const rows: ReviewRow[] = mapped.map((m, i) => ({
      ...m,
      include: m.biomarkerId != null,
      key: i,
      saveAsFinding: m.biomarkerId == null,
    }));
    // Start the user from a save-ready state: when several rows hit one biomarker,
    // keep only the strongest selected instead of flagging an error to untangle.
    autoResolveDuplicates(rows);
    return {
      rows,
      findings: (extraction.qualitative ?? []).map((q, i) => ({
        key: i,
        rawLabel: q.raw_label,
        nameEn: q.analyte_en,
        valueText: q.result_text,
        valueNumeric: null,
        unit: null,
        refRangeText: q.ref_range_text,
        sourcePage: q.page,
        include: true,
      })),
      meta: {
        // An old report imported today keeps its real collection date — essential
        // for the trend; fall back to today and flag it when illegible.
        date: extraction.collectionDate ?? todayISO(),
        labName: extraction.labName ?? "",
        city: extraction.city ?? "",
        country: extraction.country ?? "",
        sampleTypes: ["blood"],
        cost: "",
      },
      skipped: extraction.skipped ?? [],
      dateGuessed: extraction.collectionDate == null,
    };
  },

  isEmpty: (draft) => draft.rows.length === 0 && draft.findings.length === 0,

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
        sampleTypes: draft.meta.sampleTypes.length ? draft.meta.sampleTypes : ["blood"],
        cost: parseCost(draft.meta.cost),
        importMethod: "ai",
        sourceFileId,
      },
      results,
      byId,
    );
    // Remember each (lab, biomarker) → unit so the next import from this lab
    // defaults to the same unit — most useful when the document omits it.
    for (const res of results) rememberUnit(draft.meta.labName, res.biomarkerId, res.unit);
    // Everything the dictionary couldn't absorb is kept as structured findings:
    // qualitative rows staged on the review screen + unmapped numeric rows the
    // user left flagged "save as finding".
    const findingsToSave = [
      ...draft.findings
        .filter((f) => f.include)
        .map((f) => ({
          rawLabel: f.rawLabel,
          nameEn: f.nameEn,
          valueText: f.valueText,
          valueNumeric: f.valueNumeric,
          unit: f.unit,
          refRangeText: f.refRangeText,
          sourcePage: f.sourcePage,
        })),
      ...draft.rows
        .filter((r) => r.biomarkerId == null && r.saveAsFinding)
        .map((r) => ({
          rawLabel: r.raw.raw_label,
          nameEn: r.raw.analyte_en,
          valueText: String(r.raw.value),
          valueNumeric: r.raw.value,
          unit: r.raw.unit || null,
          refRangeText: r.raw.ref_range_text,
          sourcePage: r.raw.page,
        })),
    ];
    await createPanelFindings(panelId, findingsToSave);
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
  const { rows, findings, meta, skipped, dateGuessed } = draft;

  const includedCount = rows.filter((r) => r.include && r.biomarkerId != null).length;
  // Findings = staged qualitative rows + unmapped numeric rows left flagged.
  const findingsCount =
    findings.filter((f) => f.include).length +
    rows.filter((r) => r.biomarkerId == null && r.saveAsFinding).length;
  // Clusters colliding rows together; flagged rows are styled as a group.
  const orderedRows = React.useMemo(() => clusterForDisplay(rows), [rows]);
  // Only groups where the user still has MORE THAN ONE row selected are a real
  // problem — the auto-resolve leaves zero of these, so this is normally 0.
  const unresolvedDups = React.useMemo(() => {
    let n = 0;
    for (const [, group] of duplicateGroups(rows)) {
      if (group.filter((r) => r.include).length > 1) n++;
    }
    return n;
  }, [rows]);

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

  // Non-primary members of a duplicate group — rendered nested under the kept
  // row with a one-click swap instead of a plain checkbox.
  const secondaryDupKeys = React.useMemo(() => {
    const keys = new Set<number>();
    for (const [, group] of duplicateGroups(rows)) {
      for (const r of group) if (!r.include) keys.add(r.key);
    }
    return keys;
  }, [rows]);

  /** Swap the kept row of a duplicate group: the clicked alternate becomes the
   *  single included member. */
  const promoteDuplicate = (key: number) =>
    updateRows((rs) => {
      const r = rs.find((x) => x.key === key);
      if (!r || r.biomarkerId == null) return;
      for (const x of rs) if (x.biomarkerId === r.biomarkerId) x.include = x.key === key;
    });

  const customRow = customForKey != null ? rows.find((r) => r.key === customForKey) : undefined;
  const customRange = parseRefRange(customRow?.raw.ref_range_text ?? null);
  const customSuggestion = customRow?.suggestion ?? null;
  const customName =
    customSuggestion?.name ?? customRow?.raw.analyte_en ?? customRow?.raw.raw_label ?? "";
  // Seed aliases from the original labels so the next import of the same lab
  // exact-matches instead of landing here again.
  const customAliases = customRow
    ? [
        ...new Set(
          [customRow.raw.raw_label, customRow.raw.analyte_en].filter(
            (a): a is string =>
              !!a && a.trim().toLowerCase() !== customName.trim().toLowerCase(),
          ),
        ),
      ].join(", ")
    : "";

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
              {orderedRows.map((row) => {
                const bio = row.biomarkerId != null ? index.byId.get(row.biomarkerId) : undefined;
                const secondary = secondaryDupKeys.has(row.key);
                return (
                  <TableRow
                    key={row.key}
                    className={
                      row.duplicate
                        ? secondary
                          ? "bg-warning/5 text-muted-foreground"
                          : "bg-warning/5"
                        : undefined
                    }
                  >
                    <TableCell>
                      {secondary ? (
                        <button
                          type="button"
                          title={t("importWizard.swapDuplicateHint")}
                          aria-label={t("importWizard.swapDuplicateHint")}
                          className="inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-warning/20 hover:text-foreground"
                          onClick={() => promoteDuplicate(row.key)}
                        >
                          <ArrowLeftRight className="size-3.5" />
                        </button>
                      ) : (
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
                      )}
                    </TableCell>
                    <TableCell className="max-w-44">
                      <p className="truncate text-sm" title={row.raw.raw_label}>
                        {secondary && (
                          <CornerDownRight className="mr-1 inline size-3 text-muted-foreground" />
                        )}
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
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <button
                            className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-primary hover:underline"
                            onClick={() => setCustomForKey(row.key)}
                          >
                            <Plus className="size-3" /> Create custom biomarker
                            {row.suggestion && (
                              <Badge variant="secondary" title={t("importWizard.aiSuggestionHint")}>
                                {t("importWizard.aiSuggestionBadge")}
                              </Badge>
                            )}
                          </button>
                          <label className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-muted-foreground">
                            <input
                              type="checkbox"
                              className="size-3 accent-[var(--primary)]"
                              checked={row.saveAsFinding}
                              onChange={() =>
                                updateRows((rs) => {
                                  const r = rs.find((x) => x.key === row.key)!;
                                  r.saveAsFinding = !r.saveAsFinding;
                                })
                              }
                            />
                            {t("importWizard.saveToFindings")}
                          </label>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <ConfidenceBadge confidence={row.confidence} />
                        {row.duplicate && (
                          <Badge
                            variant={row.include ? "warning" : "secondary"}
                            title={t("importWizard.duplicateGroupHint")}
                          >
                            {t("importWizard.duplicateBadge")}
                          </Badge>
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

      {findings.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>{t("importWizard.findingsTitle")}</CardTitle>
            <CardDescription>{t("importWizard.findingsDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {findings.map((f) => (
              <div key={f.key} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  className="size-4 shrink-0 accent-[var(--primary)]"
                  checked={f.include}
                  onChange={() =>
                    setDraft({
                      ...draft,
                      findings: findings.map((x) =>
                        x.key === f.key ? { ...x, include: !x.include } : x,
                      ),
                    })
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm" title={f.rawLabel}>
                    {f.rawLabel}
                    {f.nameEn && f.nameEn.toLowerCase() !== f.rawLabel.toLowerCase() && (
                      <span className="italic text-muted-foreground"> ≈ {f.nameEn}</span>
                    )}
                  </p>
                  {f.refRangeText && (
                    <p className="text-[10px] text-muted-foreground">ref: {f.refRangeText}</p>
                  )}
                </div>
                <Input
                  className="w-44"
                  value={f.valueText}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      findings: findings.map((x) =>
                        x.key === f.key ? { ...x, valueText: e.target.value } : x,
                      ),
                    })
                  }
                />
                <Button
                  variant="ghost"
                  size="iconSm"
                  aria-label={t("common.delete")}
                  onClick={() =>
                    setDraft({ ...draft, findings: findings.filter((x) => x.key !== f.key) })
                  }
                >
                  <X />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

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
          <Field label={t("fields.cost")} hint={t("fields.costHint")}>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-muted-foreground">
                $
              </span>
              <Input
                inputMode="decimal"
                placeholder="0.00"
                className="pl-6"
                value={meta.cost}
                onChange={(e) => setDraft({ ...draft, meta: { ...meta, cost: e.target.value } })}
              />
            </div>
          </Field>
          <Field label={t("fields.sampleTypes")} className="sm:col-span-2 lg:col-span-5">
            <ChipSelect<SampleType>
              value={meta.sampleTypes}
              onChange={(next) => setDraft({ ...draft, meta: { ...meta, sampleTypes: next } })}
              options={SAMPLE_TYPES.map((s) => ({ value: s, label: t(`types.${s}`) }))}
            />
          </Field>
        </CardContent>
      </Card>

      <div className="mt-5 flex items-center justify-end gap-3">
        {unresolvedDups > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertTriangle className="size-3.5" />
            {t("importWizard.duplicatesUnresolved", { count: String(unresolvedDups) })}
          </p>
        )}
        <Button onClick={onSave} disabled={includedCount === 0 || !meta.date || unresolvedDups > 0}>
          Confirm & save {includedCount} result{includedCount === 1 ? "" : "s"}
          {findingsCount > 0 && ` + ${findingsCount} finding${findingsCount === 1 ? "" : "s"}`}
        </Button>
      </div>

      <CreateBiomarkerDialog
        open={customForKey != null}
        onClose={() => setCustomForKey(null)}
        initialName={customName}
        initialUnit={customSuggestion?.unit || customRow?.raw.unit || ""}
        initialCategory={customSuggestion?.category}
        initialDirection={customSuggestion?.direction}
        initialAliases={customAliases}
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
