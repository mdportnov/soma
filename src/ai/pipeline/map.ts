import type { Biomarker } from "@/db/schema";
import type { AIProvider, RawExtraction } from "../types";
import { normalizeLabel, similarity } from "@/lib/fuzzy";
import { convertToDefaultUnit, type ConversionResult } from "@/lib/units";

/**
 * Phase 2 — deterministic dictionary mapping (§4).
 * Order is fixed: normalize → exact/alias → fuzzy → (optional) narrow AI call.
 * The AI step only ever picks from an explicit candidate list or returns null;
 * every row keeps its raw_label for the audit trail, and nothing is written
 * to the database until the user confirms on the review screen (phase 3).
 */

export type Confidence = "exact" | "fuzzy" | "ai" | "none";

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
  for (const b of biomarkers) {
    byId.set(b.id, b);
    for (const name of [b.canonicalName, ...(b.aliases ?? [])]) {
      const normalized = normalizeLabel(name);
      if (!normalized) continue;
      // First registration wins on exact collisions — canonical names are
      // registered before aliases, and the dictionary owner resolves clashes.
      if (!exact.has(normalized)) exact.set(normalized, b.id);
      entries.push({ normalized, biomarkerId: b.id });
    }
  }
  return { exact, entries, byId };
}

function fuzzyCandidates(normalized: string, index: BiomarkerIndex) {
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
    const normalized = normalizeLabel(raw.raw_label);

    // 1–2. Exact / alias match — the priority path, no AI involved.
    const exactId = index.exact.get(normalized);
    if (exactId != null) {
      return {
        raw,
        biomarkerId: exactId,
        confidence: "exact" as const,
        candidates: [{ biomarkerId: exactId, score: 1 }],
        conversion: conversionFor(raw, exactId, index),
        duplicate: false,
      };
    }

    // 3. Fuzzy match for OCR typos and word-order variations.
    const candidates = fuzzyCandidates(normalized, index);
    const top = candidates[0];
    const second = candidates[1];
    const unambiguous = !second || top.score - second.score >= FUZZY_AMBIGUITY_GAP;
    if (top && top.score >= FUZZY_ACCEPT && unambiguous) {
      return {
        raw,
        biomarkerId: top.biomarkerId,
        confidence: "fuzzy" as const,
        candidates,
        conversion: conversionFor(raw, top.biomarkerId, index),
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
        const picked = await provider.mapBiomarker(row.raw.raw_label, row.raw.unit, payload);
        if (picked != null) {
          row.biomarkerId = picked;
          row.confidence = "ai";
          row.conversion = conversionFor(row.raw, picked, index);
        }
      } catch (e) {
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
