/**
 * Controlled-vocabulary resolution for vaccine import (the phase-2 step §4 calls
 * for, here applied to vaccines instead of biomarkers).
 *
 * A vaccination certificate prints antigens in whatever language and shorthand
 * the issuing country uses — a Russian record says "ОПВ", "АКДС", "ЖКВ", "ДНК";
 * an English one says "OPV", "DTP", "MMR". None of those line up with the
 * brand-free antigens the vaccine calendar grades against
 * (`VACCINE_SCHEDULE`). This resolver maps the model's free-text guess (plus the
 * disease/antigen hint it returns) onto one of those canonical antigens, so an
 * imported dose is stored under a name the calendar recognises and immediately
 * lights up the schedule — without ever silently coercing an unknown into the
 * wrong antigen.
 *
 * Deterministic, no AI call: normalize → exact (canonical/disease) → exact
 * (alias) → whole-word containment → fuzzy. Confidence is surfaced in the review
 * UI so the user verifies fuzzy/low-trust matches before saving.
 */

import { VACCINE_SCHEDULE, type ScheduleEntry } from "@/lib/vaccine-schedule";
import { normalizeLabel, similarity } from "@/lib/fuzzy";

/** How a name reached its antigen — drives the review badge. */
export type VaccineMatchConfidence = "exact" | "alias" | "fuzzy";

export type VaccineMatch = {
  entryId: string;
  /** Canonical English antigen name from the library (what we store). */
  name: string;
  nameRu: string;
  confidence: VaccineMatchConfidence;
};

/** Minimum fuzzy score over canonical names before we fall back to "no match". */
const FUZZY_ACCEPT = 0.84;
/** Aliases shorter than this are never used for whole-word/fuzzy matching — tokens
 * like "td", "dt", "mr" are too noisy and only matched on exact equality. */
const MIN_LOOSE_TOKEN = 3;

type Indexed = {
  entry: ScheduleEntry;
  /** Canonical name / nameRu / disease / diseaseRu — strong, antigen-specific. */
  primary: string[];
  /** Alias tokens — brands, abbreviations, translations. */
  aliases: string[];
};

const INDEX: Indexed[] = VACCINE_SCHEDULE.map((entry) => ({
  entry,
  primary: unique([entry.name, entry.nameRu, entry.disease, entry.diseaseRu].map(normalizeLabel)),
  aliases: unique(entry.aliases.map(normalizeLabel)),
}));

function unique(xs: string[]): string[] {
  return [...new Set(xs.filter(Boolean))];
}

function asMatch(entry: ScheduleEntry, confidence: VaccineMatchConfidence): VaccineMatch {
  return { entryId: entry.id, name: entry.name, nameRu: entry.nameRu, confidence };
}

/** True when `token` appears as a whole word (or word run) inside `text`. */
function wordContains(text: string, token: string): boolean {
  if (text === token) return true;
  return text.startsWith(`${token} `) || text.endsWith(` ${token}`) || text.includes(` ${token} `);
}

/**
 * Resolve a printed vaccine name (and the optional disease/antigen hint the
 * extraction prompt returns) onto a library antigen. Returns null when nothing
 * clears the bar — the review UI then leaves the row unmatched for the user.
 *
 * The disease hint matters: a record may print only "ДНК" or "V1" as the name,
 * with "Hepatitis B" as the section/antigen — the hint resolves it where the bare
 * name cannot.
 */
export function resolveVaccine(
  name: string | null | undefined,
  disease?: string | null,
): VaccineMatch | null {
  const inputs = unique([name ?? "", disease ?? ""].map(normalizeLabel));
  if (inputs.length === 0) return null;

  // 1. Exact equality with a canonical/disease token — the antigen itself.
  for (const idx of INDEX) {
    if (inputs.some((inp) => idx.primary.includes(inp))) return asMatch(idx.entry, "exact");
  }

  // 2. Exact equality with an alias (brand, abbreviation, translation).
  for (const idx of INDEX) {
    if (inputs.some((inp) => idx.aliases.includes(inp))) return asMatch(idx.entry, "alias");
  }

  // 3. Whole-word containment — the model often returns a phrase or section
  //    header ("Дифтерия, коклюш, столбняк"); match a token inside it. Longest
  //    token wins so the most specific antigen is chosen.
  let bestContain: { entry: ScheduleEntry; len: number } | null = null;
  for (const idx of INDEX) {
    for (const token of [...idx.primary, ...idx.aliases]) {
      if (token.length < MIN_LOOSE_TOKEN) continue;
      if (
        inputs.some((inp) => wordContains(inp, token)) &&
        token.length > (bestContain?.len ?? 0)
      ) {
        bestContain = { entry: idx.entry, len: token.length };
      }
    }
  }
  if (bestContain) return asMatch(bestContain.entry, "alias");

  // 4. Fuzzy over canonical names only (OCR typos, near-misses) — never over the
  //    short noisy aliases.
  let bestFuzzy: { entry: ScheduleEntry; score: number } | null = null;
  for (const idx of INDEX) {
    for (const token of idx.primary) {
      if (token.length < MIN_LOOSE_TOKEN) continue;
      for (const inp of inputs) {
        const score = similarity(inp, token);
        if (score > (bestFuzzy?.score ?? 0)) bestFuzzy = { entry: idx.entry, score };
      }
    }
  }
  if (bestFuzzy && bestFuzzy.score >= FUZZY_ACCEPT) return asMatch(bestFuzzy.entry, "fuzzy");

  return null;
}

/** Options for the review-UI override dropdown — every library antigen, EN · RU. */
export const VACCINE_ANTIGEN_OPTIONS: { value: string; label: string }[] = VACCINE_SCHEDULE.map(
  (e) => ({ value: e.id, label: e.name === e.nameRu ? e.name : `${e.name} · ${e.nameRu}` }),
);

/** Look up an antigen by id (for applying a manual override). */
export function antigenById(id: string): VaccineMatch | null {
  const e = VACCINE_SCHEDULE.find((x) => x.id === id);
  return e ? asMatch(e, "exact") : null;
}
