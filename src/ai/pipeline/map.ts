import type { Biomarker } from "@/db/schema";
import { AIProviderError, type AIProvider, type RawExtraction } from "../types";
import { normalizeLabel, similarity } from "@/lib/fuzzy";
import { convertToDefaultUnit, type ConversionResult } from "@/lib/units";

/**
 * Phase 2 — deterministic dictionary mapping (§4).
 * Order is fixed: normalize → exact/alias → fuzzy → (optional) narrow AI call.
 * The AI step only ever picks from an explicit candidate list or returns null;
 * every row keeps its raw_label for the audit trail, and nothing is written
 * to the database until the user confirms on the review screen (phase 3).
 */

// "exact" = the printed label is literally in the dictionary (highest trust).
// "translated" = matched via the model's English rendering, not the verbatim
// label — same dictionary hit, but a translation step could have lost nuance
// (e.g. "Colesterol LDL" → "Cholesterol"), so it is surfaced for review.
export type Confidence = "exact" | "translated" | "fuzzy" | "ai" | "none";

export type MappedRow = {
  raw: RawExtraction;
  biomarkerId: number | null;
  confidence: Confidence;
  /** Top fuzzy candidates (descending score) for the review dropdown. */
  candidates: { biomarkerId: number; score: number }[];
  /** Conversion of the extracted value into the matched biomarker's default unit. */
  conversion: ConversionResult | null;
  /** True when another row in the same batch maps to the same biomarker. */
  duplicate: boolean;
};

const FUZZY_ACCEPT = 0.86; // auto-accept threshold for fuzzy matches
const FUZZY_CANDIDATE = 0.5; // minimum score to surface as a candidate
const MAX_CANDIDATES = 8;
// Near-identical labels (e.g. "LDL cholesterol" vs "HDL cholesterol" ≈ 0.93)
// must never be auto-accepted on fuzzy alone — require clear separation
// between the top two candidates, otherwise defer to AI/manual review.
const FUZZY_AMBIGUITY_GAP = 0.05;

type IndexEntry = { normalized: string; biomarkerId: number };

export type BiomarkerIndex = {
  exact: Map<string, number>;
  entries: IndexEntry[];
  byId: Map<number, Biomarker>;
};

export function buildBiomarkerIndex(biomarkers: Biomarker[]): BiomarkerIndex {
  const exact = new Map<string, number>();
  const entries: IndexEntry[] = [];
  const byId = new Map<number, Biomarker>();
  // Keys that two DIFFERENT biomarkers share (e.g. "tg" = triglycerides AND
  // thyroglobulin). Silently picking the first would mis-route; instead we drop
  // them from the exact map so they fall through to fuzzy/AI/manual review.
  const ambiguous = new Set<string>();
  for (const b of biomarkers) {
    byId.set(b.id, b);
    for (const name of [b.canonicalName, ...(b.aliases ?? [])]) {
      const normalized = normalizeLabel(name);
      if (!normalized) continue;
      const existing = exact.get(normalized);
      if (existing == null) exact.set(normalized, b.id);
      else if (existing !== b.id) ambiguous.add(normalized);
      entries.push({ normalized, biomarkerId: b.id });
    }
  }
  for (const key of ambiguous) exact.delete(key);
  return { exact, entries, byId };
}

type Candidate = { biomarkerId: number; score: number };

/** Best fuzzy candidates for one normalized label. */
function fuzzyCandidates(normalized: string, index: BiomarkerIndex): Candidate[] {
  const best = new Map<number, number>();
  for (const entry of index.entries) {
    const score = similarity(normalized, entry.normalized);
    if (score >= FUZZY_CANDIDATE) {
      best.set(entry.biomarkerId, Math.max(best.get(entry.biomarkerId) ?? 0, score));
    }
  }
  return [...best.entries()]
    .map(([biomarkerId, score]) => ({ biomarkerId, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES);
}

/** Merge per-label candidate lists, keeping the best score per biomarker. */
function mergeCandidates(perLabel: Candidate[][]): Candidate[] {
  const best = new Map<number, number>();
  for (const list of perLabel) {
    for (const c of list) best.set(c.biomarkerId, Math.max(best.get(c.biomarkerId) ?? 0, c.score));
  }
  return [...best.entries()]
    .map(([biomarkerId, score]) => ({ biomarkerId, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES);
}

/** A clean fuzzy auto-accept needs ONE label to clear the bar against its own
 * runner-up — the gap must signal two dictionary entries close to the SAME
 * label, not an artefact of merging scores from two different labels. */
function autoAcceptCandidate(perLabel: Candidate[][]): Candidate | null {
  for (const cands of perLabel) {
    const top = cands[0];
    const second = cands[1];
    if (
      top &&
      top.score >= FUZZY_ACCEPT &&
      (!second || top.score - second.score >= FUZZY_AMBIGUITY_GAP)
    ) {
      return top;
    }
  }
  return null;
}

function conversionFor(
  raw: RawExtraction,
  biomarkerId: number | null,
  index: BiomarkerIndex,
): ConversionResult | null {
  if (biomarkerId == null) return null;
  const bio = index.byId.get(biomarkerId);
  if (!bio) return null;
  return convertToDefaultUnit(raw.value, raw.unit || bio.defaultUnit, bio);
}

/**
 * Maps extracted rows onto the biomarker dictionary.
 * `provider` is optional — without AI the pipeline still works, leaving
 * ambiguous rows unmapped for manual resolution on the review screen.
 */
export async function mapExtractions(
  raws: RawExtraction[],
  biomarkers: Biomarker[],
  provider: AIProvider | null,
): Promise<MappedRow[]> {
  const index = buildBiomarkerIndex(biomarkers);

  const rows: MappedRow[] = raws.map((raw) => {
    // Match on the printed label AND its English translation, so a Spanish/
    // German/etc. report resolves against the English-centric dictionary. The
    // printed label is checked first (verbatim is authoritative); identical
    // normalized forms (English reports repeat the label) are de-duplicated.
    const seen = new Set<string>();
    const forms: { normalized: string; verbatim: boolean }[] = [];
    for (const f of [
      { label: raw.raw_label, verbatim: true },
      { label: raw.analyte_en, verbatim: false },
    ]) {
      if (!f.label) continue;
      const normalized = normalizeLabel(f.label);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      forms.push({ normalized, verbatim: f.verbatim });
    }

    // 1–2. Exact / alias match — the priority path, no AI involved. A hit on the
    // verbatim label is "exact"; a hit only via the translation is "translated".
    for (const f of forms) {
      const exactId = index.exact.get(f.normalized);
      if (exactId != null) {
        return {
          raw,
          biomarkerId: exactId,
          confidence: f.verbatim ? ("exact" as const) : ("translated" as const),
          candidates: [{ biomarkerId: exactId, score: 1 }],
          conversion: conversionFor(raw, exactId, index),
          duplicate: false,
        };
      }
    }

    // 3. Fuzzy match for OCR typos, word-order and cross-language variations.
    // Auto-accept is decided per label (so the ambiguity gap means what it
    // should); candidates are merged only for the dropdown and AI fallback.
    const perLabel = forms.map((f) => fuzzyCandidates(f.normalized, index));
    const candidates = mergeCandidates(perLabel);
    const accepted = autoAcceptCandidate(perLabel);
    if (accepted) {
      return {
        raw,
        biomarkerId: accepted.biomarkerId,
        confidence: "fuzzy" as const,
        candidates,
        conversion: conversionFor(raw, accepted.biomarkerId, index),
        duplicate: false,
      };
    }
    return {
      raw,
      biomarkerId: null,
      confidence: "none" as const,
      candidates,
      conversion: null,
      duplicate: false,
    };
  });

  // 4. Narrow AI disambiguation for leftovers that have candidates.
  if (provider) {
    for (const row of rows) {
      if (row.biomarkerId != null || !row.candidates.length) continue;
      const payload = row.candidates.map((c) => {
        const b = index.byId.get(c.biomarkerId)!;
        return {
          biomarker_id: b.id,
          canonical_name: b.canonicalName,
          default_unit: b.defaultUnit,
          category: b.category,
        };
      });
      try {
        const label =
          row.raw.analyte_en && row.raw.analyte_en.toLowerCase() !== row.raw.raw_label.toLowerCase()
            ? `${row.raw.raw_label} (${row.raw.analyte_en})`
            : row.raw.raw_label;
        const picked = await provider.mapBiomarker(label, row.raw.unit, payload);
        if (picked != null) {
          row.biomarkerId = picked;
          row.confidence = "ai";
          row.conversion = conversionFor(row.raw, picked, index);
        }
      } catch (e) {
        // A bad/revoked key fails identically on every remaining row: abort the
        // loop and surface it, rather than firing N doomed requests and handing
        // back a review screen full of silently-unmapped rows with no banner.
        if (e instanceof AIProviderError && e.kind === "auth") throw e;
        console.warn("AI mapping fallback failed; leaving row unmapped", e);
      }
    }
  }

  markDuplicates(rows);
  return rows;
}

/** Detects two rows of one batch landing on the same biomarker (§4). */
export function markDuplicates(rows: MappedRow[]): void {
  const seen = new Map<number, number>();
  for (const row of rows) row.duplicate = false;
  for (const row of rows) {
    if (row.biomarkerId == null) continue;
    seen.set(row.biomarkerId, (seen.get(row.biomarkerId) ?? 0) + 1);
  }
  for (const row of rows) {
    if (row.biomarkerId != null && (seen.get(row.biomarkerId) ?? 0) > 1) {
      row.duplicate = true;
    }
  }
}

/** Recomputes conversion after the user re-maps a row on the review screen. */
export function reconvertRow(row: MappedRow, index: BiomarkerIndex): void {
  row.conversion = conversionFor(row.raw, row.biomarkerId, index);
}
