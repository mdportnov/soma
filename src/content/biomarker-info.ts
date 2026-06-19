import type { Lang } from "@/lib/i18n";
import { biomarkerInfoEn } from "./biomarker-info.en";
import { biomarkerInfoRu } from "./biomarker-info.ru";

/**
 * Plain-language reference explanation for one biomarker.
 *
 * This is static educational content — NOT user data and NOT a diagnosis. It is
 * deliberately decoupled from the `biomarker` dictionary table: the database
 * stores names, units and ranges; this module stores prose, localized per UI
 * language. Custom (user-created) biomarkers have no entry and that is expected.
 *
 * Wording rules (enforced by tone, see scripts/check-biomarker-info.ts):
 * - Universal, textbook-level physiology only — no rare-cause speculation.
 * - Non-categorical: "may indicate / can be associated with", never a diagnosis.
 * - Every rendered card pairs these fields with a mandatory disclaimer footnote.
 */
export type BiomarkerInfo = {
  /** What the parameter is — short definition and what it is responsible for. */
  summary: string;
  /** What an elevated value may indicate — possible causes/states. */
  high: string;
  /** What a low value may indicate — possible causes/states. */
  low: string;
  /** Its role in the body — what it influences. */
  affects: string;
};

export type BiomarkerInfoMap = Record<string, BiomarkerInfo>;

const MAPS: Record<Lang, BiomarkerInfoMap> = {
  en: biomarkerInfoEn,
  ru: biomarkerInfoRu,
};

/**
 * Look up the reference explanation for a biomarker by its canonical name
 * (the stable key shared with the seed dictionary). Falls back to English when
 * a localized entry is missing, then to `null` for unknown/custom markers.
 */
export function getBiomarkerInfo(canonicalName: string, lang: Lang): BiomarkerInfo | null {
  return MAPS[lang][canonicalName] ?? MAPS.en[canonicalName] ?? null;
}
