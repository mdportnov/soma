/**
 * Generic controlled-vocabulary resolution for AI import (§4 phase 2).
 *
 * The lab pipeline resolves free-text analyte labels against a biomarker
 * dictionary (see `pipeline/map.ts`). Most other sections don't have a big
 * dictionary — they have small, fixed enums (imaging modality, allergy
 * category/severity, medication type, diagnosis status). This module is the
 * equivalent "resolution" step for those: map the model's free-text guess onto
 * one of the app's controlled values, deterministically, with a confidence the
 * review UI can surface — never silently coercing an unknown into a wrong enum.
 *
 * Order mirrors the lab mapper: normalize → exact → synonym → fuzzy → fallback.
 * No AI call is needed here; the extraction prompt already asks the model to use
 * the English clinical term, so synonyms + fuzzy cover cross-language scans.
 */

import { normalizeLabel, similarity } from "@/lib/fuzzy";

/** How a value reached its resolved enum — drives the review badge. */
export type ResolveConfidence = "exact" | "synonym" | "fuzzy" | "fallback";

/** One enum value plus the surface forms (any language) that map to it. */
export type VocabEntry<T extends string> = {
  value: T;
  /** Lowercase synonyms / translations; the canonical value is matched too. */
  synonyms: string[];
};

export type Resolution<T extends string> = {
  value: T;
  confidence: ResolveConfidence;
};

/** Minimum fuzzy score to accept an enum match before falling back. */
const ENUM_FUZZY_ACCEPT = 0.8;

/**
 * Resolve a free-text string onto a fixed enum.
 *
 * `fallback` is returned (confidence "fallback") when the input is empty or no
 * candidate clears the fuzzy bar — the review UI then flags it for the user.
 * Exact/synonym hits are high-trust; fuzzy hits are surfaced for verification.
 */
export function resolveEnum<T extends string>(
  input: string | null | undefined,
  vocab: VocabEntry<T>[],
  fallback: T,
): Resolution<T> {
  const norm = input ? normalizeLabel(input) : "";
  if (!norm) return { value: fallback, confidence: "fallback" };

  // 1. Exact match on the canonical value itself.
  for (const entry of vocab) {
    if (normalizeLabel(entry.value) === norm) return { value: entry.value, confidence: "exact" };
  }

  // 2. Synonym / translation match — substring-aware so "CT scan of chest"
  //    resolves on the "ct" synonym without a perfect equality.
  for (const entry of vocab) {
    for (const syn of entry.synonyms) {
      const ns = normalizeLabel(syn);
      if (!ns) continue;
      if (ns === norm) return { value: entry.value, confidence: "synonym" };
    }
  }
  // 2b. Token-containment pass (looser than equality): the model often returns a
  //     phrase ("magnetic resonance imaging of the knee"). Match if a synonym
  //     appears as a whole word/phrase inside the normalized input.
  for (const entry of vocab) {
    for (const syn of entry.synonyms) {
      const ns = normalizeLabel(syn);
      if (ns && ns.length >= 2 && wordContains(norm, ns)) {
        return { value: entry.value, confidence: "synonym" };
      }
    }
  }

  // 3. Fuzzy match against canonical values + synonyms (OCR typos, near-misses).
  let best: { value: T; score: number } | null = null;
  for (const entry of vocab) {
    for (const form of [entry.value, ...entry.synonyms]) {
      const score = similarity(norm, normalizeLabel(form));
      if (score > (best?.score ?? 0)) best = { value: entry.value, score };
    }
  }
  if (best && best.score >= ENUM_FUZZY_ACCEPT) {
    return { value: best.value, confidence: "fuzzy" };
  }

  // 4. Nothing confident — fall back and let the user pick on review.
  return { value: fallback, confidence: "fallback" };
}

/** True when `needle` appears as a whole token (or token run) inside `haystack`. */
function wordContains(haystack: string, needle: string): boolean {
  if (haystack === needle) return true;
  return (
    haystack.startsWith(`${needle} `) ||
    haystack.endsWith(` ${needle}`) ||
    haystack.includes(` ${needle} `)
  );
}

/**
 * Split a printed dose string into amount + unit:
 * "500 mg" → { amount: 500, unit: "mg" }, "1.5g" → { amount: 1.5, unit: "g" },
 * "5 МЕ" → { amount: 5, unit: "МЕ" }. Returns nulls when unparseable.
 */
export function parseDose(dose: string | null | undefined): {
  amount: number | null;
  unit: string | null;
} {
  if (!dose) return { amount: null, unit: null };
  const m = /^\s*([\d.,]+)\s*([^\d\s].*)?$/.exec(dose.trim());
  if (!m) return { amount: null, unit: dose.trim() || null };
  const amount = Number.parseFloat(m[1].replace(",", "."));
  return {
    amount: Number.isFinite(amount) ? amount : null,
    unit: m[2]?.trim().slice(0, 40) || null,
  };
}
