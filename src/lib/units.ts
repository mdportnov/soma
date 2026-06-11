import type { Biomarker } from "@/db/schema";

/**
 * Unit conversion layer (§4 phase 2, rule 5).
 * Two tiers:
 *  1. Generic unit-to-unit conversions (pure metric prefixes / synonyms).
 *  2. Analyte-specific molar conversions keyed by biomarker code (mg/dL ↔ mmol/L
 *     depends on molar mass, so it must be per-analyte).
 * Unknown conversions return null → the import review screen flags the row
 * for manual confirmation instead of guessing.
 */

/**
 * Lowercases and transliterates Cyrillic unit spellings to their Latin
 * equivalents. Replacement order matters: longest Cyrillic tokens first
 * ("ммоль" before "моль" before "мм"/"мг"), single letters last.
 */
export function normalizeUnit(u: string): string {
  return u
    .trim()
    .toLowerCase()
    .replace(/μ|µ/g, "µ")
    .replace(/ме(?=\/|$)/g, "iu") // МЕ (междунар. единицы) = IU
    .replace(/ед(?=\/|$)/g, "u") // Ед = U
    .replace(/мк/g, "µ")
    .replace(/ммоль/g, "mmol")
    .replace(/нмоль/g, "nmol")
    .replace(/пмоль/g, "pmol")
    .replace(/моль/g, "mol")
    .replace(/мг/g, "mg")
    .replace(/мл/g, "ml")
    .replace(/мм/g, "mm")
    .replace(/нг/g, "ng")
    .replace(/пг/g, "pg")
    .replace(/ч(?=$|\b)/g, "h")
    .replace(/г/g, "g")
    .replace(/л/g, "l")
    .replace(/м/g, "m")
    .replace(/\s+/g, "");
}

export function unitsEquivalent(a: string, b: string): boolean {
  const na = normalizeUnit(a);
  const nb = normalizeUnit(b);
  if (na === nb) return true;
  const synonyms: Record<string, string> = {
    "iu/l": "u/l",
    "miu/l": "mu/l",
    "µiu/ml": "mu/l",
    "µu/ml": "mu/l",
    "ng/ml": "µg/l",
    "µg/ml": "mg/l",
    "pg/ml": "ng/l",
    "10^12/l": "x10^12/l",
    "10^9/l": "x10^9/l",
    "тыс/µl": "x10^9/l",
    "thousand/µl": "x10^9/l",
    "млн/µl": "x10^12/l",
    "million/µl": "x10^12/l",
    "mm/hour": "mm/h",
  };
  const canon = (u: string) => synonyms[u] ?? u;
  return canon(na) === canon(nb);
}

/** Generic scale factors between unit pairs (same analyte mass basis). */
const GENERIC_FACTORS: Record<string, number> = {
  "g/dl->g/l": 10,
  "g/l->g/dl": 0.1,
  "mg/dl->mg/l": 10,
  "mg/l->mg/dl": 0.1,
  "ng/ml->ng/dl": 100,
  "ng/dl->ng/ml": 0.01,
  "µg/l->ng/ml": 1,
  "ng/ml->µg/l": 1,
  "µg/dl->µg/l": 10,
  "µg/l->µg/dl": 0.1,
  "тыс/мкл->x10^9/l": 1,
};

/**
 * Analyte-specific factors: value[from] * factor = value[to].
 * Keyed by LOINC code of the biomarker.
 */
const MOLAR_FACTORS: Record<string, Record<string, number>> = {
  // Glucose (MW 180.16)
  "1558-6": { "mg/dl->mmol/l": 0.0555, "mmol/l->mg/dl": 18.016 },
  // Cholesterol total / LDL / HDL (MW 386.65)
  "2093-3": { "mg/dl->mmol/l": 0.02586, "mmol/l->mg/dl": 38.67 },
  "13457-7": { "mg/dl->mmol/l": 0.02586, "mmol/l->mg/dl": 38.67 },
  "2085-9": { "mg/dl->mmol/l": 0.02586, "mmol/l->mg/dl": 38.67 },
  // Triglycerides (MW 885.4 av.)
  "2571-8": { "mg/dl->mmol/l": 0.01129, "mmol/l->mg/dl": 88.57 },
  // Creatinine (MW 113.12)
  "2160-0": { "mg/dl->µmol/l": 88.4, "µmol/l->mg/dl": 0.0113 },
  // Urea / BUN (urea MW 60.06; BUN→urea ≈ ×0.357 mmol/L)
  "3091-6": { "mg/dl->mmol/l": 0.357, "mmol/l->mg/dl": 2.8 },
  // Uric acid (MW 168.11)
  "14933-6": { "mg/dl->µmol/l": 59.48, "µmol/l->mg/dl": 0.0168 },
  // Bilirubin (MW 584.66)
  "1975-2": { "mg/dl->µmol/l": 17.1, "µmol/l->mg/dl": 0.0585 },
  "1968-7": { "mg/dl->µmol/l": 17.1, "µmol/l->mg/dl": 0.0585 },
  // Vitamin D 25-OH (MW 400.6)
  "1989-3": { "nmol/l->ng/ml": 0.4006, "ng/ml->nmol/l": 2.496 },
  // Vitamin B12 (MW 1355)
  "2132-9": { "pmol/l->pg/ml": 1.355, "pg/ml->pmol/l": 0.738 },
  // Folate (MW 441.4)
  "2284-8": { "nmol/l->ng/ml": 0.4413, "ng/ml->nmol/l": 2.266 },
  // Testosterone (MW 288.42)
  "2986-8": {
    "ng/dl->nmol/l": 0.0347,
    "nmol/l->ng/dl": 28.84,
    "ng/ml->nmol/l": 3.47,
    "nmol/l->ng/ml": 0.288,
  },
  // Estradiol (MW 272.38)
  "14715-7": { "pg/ml->pmol/l": 3.671, "pmol/l->pg/ml": 0.2724 },
  // Cortisol (MW 362.46)
  "2143-6": { "µg/dl->nmol/l": 27.59, "nmol/l->µg/dl": 0.0362 },
  // Iron (MW 55.85)
  "2498-4": { "µg/dl->µmol/l": 0.179, "µmol/l->µg/dl": 5.587 },
  // Calcium (MW 40.08)
  "17861-6": { "mg/dl->mmol/l": 0.2495, "mmol/l->mg/dl": 4.008 },
  // Magnesium (MW 24.31)
  "19123-9": { "mg/dl->mmol/l": 0.4114, "mmol/l->mg/dl": 2.431 },
  // Phosphorus (MW 30.97)
  "2777-1": { "mg/dl->mmol/l": 0.3229, "mmol/l->mg/dl": 3.097 },
  // Zinc (MW 65.38)
  "5763-8": { "µg/dl->µmol/l": 0.153, "µmol/l->µg/dl": 6.538 },
  // Insulin
  "20448-7": { "pmol/l->µiu/ml": 0.144, "µiu/ml->pmol/l": 6.945 },
  // DHEA-S (MW 368.5)
  "2191-5": { "µg/dl->µmol/l": 0.0271, "µmol/l->µg/dl": 36.85 },
  // Prolactin (WHO IS 84/500: 1 ng/mL ≈ 21.2 mIU/L)
  "2842-3": { "ng/ml->miu/l": 21.2, "miu/l->ng/ml": 0.0472 },
  // Hemoglobin
  "718-7": { "g/dl->g/l": 10, "g/l->g/dl": 0.1 },
};

export type ConversionResult =
  | { ok: true; value: number; unit: string }
  | { ok: false; reason: "unknown_conversion" };

/**
 * Converts `value` from `fromUnit` to the biomarker's default unit.
 * Returns the input unchanged if units are already equivalent.
 */
export function convertToDefaultUnit(
  value: number,
  fromUnit: string,
  bio: Pick<Biomarker, "code" | "defaultUnit">,
): ConversionResult {
  const target = bio.defaultUnit;
  if (unitsEquivalent(fromUnit, target)) {
    return { ok: true, value, unit: target };
  }
  const key = `${normalizeUnit(fromUnit)}->${normalizeUnit(target)}`;
  const specific = bio.code ? MOLAR_FACTORS[bio.code]?.[key] : undefined;
  const factor = specific ?? GENERIC_FACTORS[key];
  if (factor != null) {
    return { ok: true, value: round(value * factor), unit: target };
  }
  return { ok: false, reason: "unknown_conversion" };
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

// ── unit catalog (for unit pickers) ─────────────────────────────────────────

/** Display spellings for normalized unit tokens that appear in factor keys. */
const UNIT_DISPLAY: Record<string, string> = {
  "g/dl": "g/dL",
  "g/l": "g/L",
  "mg/dl": "mg/dL",
  "mg/l": "mg/L",
  "ng/ml": "ng/mL",
  "ng/dl": "ng/dL",
  "µg/l": "µg/L",
  "µg/dl": "µg/dL",
  "mmol/l": "mmol/L",
  "µmol/l": "µmol/L",
  "nmol/l": "nmol/L",
  "pmol/l": "pmol/L",
  "pg/ml": "pg/mL",
  "µiu/ml": "µIU/mL",
  "miu/l": "mIU/L",
  "x10^9/l": "10^9/L",
  "тыс/мкл": "10^9/L",
};

/**
 * Every unit spelling the conversion layer can work with, deduped by
 * normalized form. Spellings coming from the biomarker dictionary win over
 * the factor-table fallbacks, so the picker shows the same strings users see
 * elsewhere in the app.
 */
export function allKnownUnits(dictionaryUnits: string[]): string[] {
  const byNorm = new Map<string, string>();
  const add = (u: string) => {
    const n = normalizeUnit(u);
    if (n && !byNorm.has(n)) byNorm.set(n, u);
  };
  for (const u of dictionaryUnits) add(u);
  const factorKeys = [
    ...Object.keys(GENERIC_FACTORS),
    ...Object.values(MOLAR_FACTORS).flatMap((m) => Object.keys(m)),
  ];
  for (const key of factorKeys) {
    for (const side of key.split("->")) add(UNIT_DISPLAY[side] ?? side);
  }
  return [...byNorm.values()].sort((a, b) => a.localeCompare(b));
}

/**
 * Units from `catalog` that will normalize for `bio`: the default unit first,
 * then everything `convertToDefaultUnit` accepts (synonym spellings and
 * known generic/molar conversions).
 */
export function convertibleUnits(
  bio: Pick<Biomarker, "code" | "defaultUnit">,
  catalog: string[],
): string[] {
  const defaultNorm = normalizeUnit(bio.defaultUnit);
  const out = [bio.defaultUnit];
  for (const u of catalog) {
    if (normalizeUnit(u) === defaultNorm) continue;
    if (convertToDefaultUnit(1, u, bio).ok) out.push(u);
  }
  return out;
}

// ── body measurements (profile) ─────────────────────────────────────────────
// Profile height/weight are stored canonically in metric (cm / kg); these
// helpers convert to and from imperial for display and entry.

export type UnitSystem = "metric" | "imperial";

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

export function cmToFtIn(cm: number): { ft: number; inches: number } {
  const totalIn = cm / CM_PER_IN;
  const ft = Math.floor(totalIn / 12);
  const inches = Math.round(totalIn - ft * 12);
  // Carry over when rounding pushes inches to 12.
  return inches === 12 ? { ft: ft + 1, inches: 0 } : { ft, inches };
}

export function ftInToCm(ft: number, inches: number): number {
  return (ft * 12 + inches) * CM_PER_IN;
}

/** Out-of-range flag computation against the biomarker's reference range. */
export function computeFlag(
  value: number,
  bio: Pick<Biomarker, "refLow" | "refHigh">,
): { outOfRange: boolean; flag: "low" | "high" | "critical" | null } {
  const { refLow, refHigh } = bio;
  if (refLow != null && value < refLow) {
    const critical = value < refLow * 0.5;
    return { outOfRange: true, flag: critical ? "critical" : "low" };
  }
  if (refHigh != null && value > refHigh) {
    const critical = value > refHigh * 2;
    return { outOfRange: true, flag: critical ? "critical" : "high" };
  }
  return { outOfRange: false, flag: null };
}
