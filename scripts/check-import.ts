/**
 * QA: regression gate for the AI-import resolution + conversion layer.
 *
 *   pnpm check:import   (also run in CI)
 *
 * Guards the deterministic core that has no other automated coverage:
 *   1. controlled-vocabulary resolution (multilingual enum matching),
 *   2. dose parsing + untrusted-output validation primitives,
 *   3. unit conversions (incl. the urea fix and cell-count equivalences),
 *   4. unit-aware differential routing (%/absolute variants must not collide),
 *   5. Cyrillic-unit normalization, non-finite guards, and JSON salvage.
 *
 * Pure functions only — no Tauri / network. Exits non-zero on any mismatch.
 */
import { resolveEnum, parseDose } from "../src/ai/import/resolve";
import {
  IMAGING_MODALITY_VOCAB,
  ALLERGY_CATEGORY_VOCAB,
  ALLERGY_SEVERITY_VOCAB,
  MEDICATION_TYPE_VOCAB,
} from "../src/ai/import/vocab";
import {
  parseLocaleNumber,
  isoDateOrNull,
  numberOrNull,
  asArray,
  asObject,
} from "../src/ai/import/validate";
import { convertToDefaultUnit, normalizeUnit, computeFlag } from "../src/lib/units";
import { mapExtractions } from "../src/ai/pipeline/map";
import { extractJson } from "../src/ai/prompts";

let pass = 0;
let fail = 0;
function eq(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) pass++;
  else {
    fail++;
    console.error(`  ✗ ${label} → got ${a}, expected ${e}`);
  }
}
function near(
  label: string,
  got: { ok: boolean; value?: number; unit?: string },
  expected: number,
) {
  if (got.ok && Math.abs((got.value as number) - expected) < 0.06) pass++;
  else {
    fail++;
    console.error(
      `  ✗ ${label} → ${got.ok ? `${got.value} ${got.unit}` : "unknown"}, expected ~${expected}`,
    );
  }
}

// 1. Controlled-vocabulary resolution (multilingual)
const mod = (s: string | null) => resolveEnum(s, IMAGING_MODALITY_VOCAB, "other").value;
eq('modality "Рентген грудной клетки"', mod("Рентген грудной клетки"), "xray");
eq('modality "Ecografía"', mod("Ecografía"), "ultrasound");
eq('modality "КТ"', mod("КТ"), "ct");
eq("category Penicillin", resolveEnum("Penicillin", ALLERGY_CATEGORY_VOCAB, "other").value, "drug");
eq(
  "severity anaphylaxis",
  resolveEnum("anaphylaxis", ALLERGY_SEVERITY_VOCAB, "moderate").value,
  "anaphylactic",
);
eq(
  "severity null→fallback",
  resolveEnum(null, ALLERGY_SEVERITY_VOCAB, "moderate").confidence,
  "fallback",
);
eq(
  "medtype Vitamin D",
  resolveEnum("Vitamin D", MEDICATION_TYPE_VOCAB, "drug").value,
  "supplement",
);
eq(
  "medtype Ibuprofen→default",
  resolveEnum("Ibuprofen", MEDICATION_TYPE_VOCAB, "drug").value,
  "drug",
);

// 2. Dose parsing + validation primitives
eq('parseDose "500 mg"', parseDose("500 mg"), { amount: 500, unit: "mg" });
eq('parseDose "2 таблетки"', parseDose("2 таблетки"), { amount: 2, unit: "таблетки" });
eq('locale "1.234,56"', parseLocaleNumber("1.234,56"), 1234.56);
eq('iso "2024-03-15"', isoDateOrNull("2024-03-15"), "2024-03-15");
eq('iso "15/03/2024"→null', isoDateOrNull("15/03/2024"), null);
eq('numberOrNull "abc"→null', numberOrNull("abc"), null);
eq("asArray(non-array)→[]", asArray("x"), []);
eq("asObject([])→null", asObject([1]), null);

// 3. Unit conversions (urea fix + new analytes + cell-count equivalences)
near(
  "Urea 35 mg/dL→mmol/L",
  convertToDefaultUnit(35, "mg/dL", { code: "3091-6", defaultUnit: "mmol/L" }),
  5.83,
);
near(
  "VLDL 16 mg/dL→mmol/L",
  convertToDefaultUnit(16, "mg/dL", { code: "13458-5", defaultUnit: "mmol/L" }),
  0.414,
);
near(
  "Free T4 1.2 ng/dL→pmol/L",
  convertToDefaultUnit(1.2, "ng/dL", { code: "3024-7", defaultUnit: "pmol/L" }),
  15.44,
);
near(
  "Lactate 18 mg/dL→mmol/L",
  convertToDefaultUnit(18, "mg/dL", { code: "2524-7", defaultUnit: "mmol/L" }),
  2.0,
);
near(
  "IgG 1200 mg/dL→g/L",
  convertToDefaultUnit(1200, "mg/dL", { code: "2465-3", defaultUnit: "g/L" }),
  12.0,
);
near(
  "WBC 4.9 x10^3/uL→10^9/L",
  convertToDefaultUnit(4.9, "x10^3/uL", { code: "6690-2", defaultUnit: "10^9/L" }),
  4.9,
);
near(
  "RBC 4.74 x10^6/UI→10^12/L",
  convertToDefaultUnit(4.74, "x10^6/UI", { code: "789-8", defaultUnit: "10^12/L" }),
  4.74,
);

// 3b. Cyrillic-unit normalization + non-finite guards
eq("normalize мг/дл → mg/dl", normalizeUnit("мг/дл"), "mg/dl");
eq("normalize мкг/дл → µg/dl", normalizeUnit("мкг/дл"), "µg/dl");
near(
  "Glucose 90 мг/дл → mmol/L (Cyrillic deciliter)",
  convertToDefaultUnit(90, "мг/дл", { code: "1558-6", defaultUnit: "mmol/L" }),
  5.0,
);
near(
  "DHEA-S 300 µg/dL → µmol/L",
  convertToDefaultUnit(300, "µg/dL", { code: "2191-5", defaultUnit: "µmol/L" }),
  8.14,
);
eq(
  "NaN value → unknown_conversion",
  convertToDefaultUnit(NaN, "mmol/L", { code: "1558-6", defaultUnit: "mmol/L" }).ok,
  false,
);
eq("computeFlag(NaN) → no flag", computeFlag(NaN, { refLow: 1, refHigh: 10 }).flag, null);

// 3c. JSON salvage from imperfect model output
eq("extractJson trailing comma", extractJson('[{"a":1},]'), [{ a: 1 }]);
eq("extractJson fenced + prose", extractJson('Here:\n```json\n{"a":1}\n```'), { a: 1 });

// 4. Unit-aware differential routing — %/absolute must not collide
type Bio = Parameters<typeof mapExtractions>[1][number];
const bio = (id: number, canonicalName: string, defaultUnit: string, aliases: string[]): Bio =>
  ({
    id,
    canonicalName,
    defaultUnit,
    aliases,
    code: null,
    category: "Complete Blood Count",
    refLow: null,
    refHigh: null,
    optimalLow: null,
    optimalHigh: null,
    direction: "range",
    isCustom: false,
  }) as Bio;
const bios = [
  bio(1, "Neutrophils", "%", ["neutrophils %", "neutrófilos segmentados"]),
  bio(2, "Neutrophils (absolute)", "10^9/L", ["neutrophils absolute"]),
];
const raw = (value: number, unit: string) => ({
  raw_label: "Neutrófilos Segmentados",
  analyte_en: "Segmented Neutrophils",
  value,
  unit,
  ref_range_text: null,
  page: null,
});

async function main() {
  const rows = await mapExtractions([raw(48.2, "%"), raw(2.35, "x10^3/uL")], bios, null);
  eq("differential % → Neutrophils", rows[0].biomarkerId, 1);
  eq("differential absolute → Neutrophils (absolute)", rows[1].biomarkerId, 2);
  eq("no duplicate flags", [rows[0].duplicate, rows[1].duplicate], [false, false]);

  if (fail === 0) {
    console.log(`✓ Import checks OK: ${pass} assertions passed.`);
    process.exit(0);
  }
  console.error(`✗ Import checks FAILED: ${fail} of ${pass + fail} assertions.`);
  process.exit(1);
}

void main();
