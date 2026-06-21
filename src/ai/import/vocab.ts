/**
 * Controlled vocabularies for enum resolution (`resolve.ts`).
 *
 * Each entry's `synonyms` are lowercase surface forms — including common
 * non-English ones — that the extractor might emit. The extraction prompts ask
 * the model for the English clinical term, so these mostly cover phrasing
 * variants and the occasional untranslated scan. Add synonyms freely; the
 * resolver is order-independent.
 *
 * Single source of truth shared by the discharge, imaging, prescription and
 * allergy import modules so resolution stays consistent across the app.
 */

import type { VocabEntry } from "./resolve";

// ── allergy.category ────────────────────────────────────────────────────────
export type AllergyCategory = "drug" | "food" | "environmental" | "other";

export const ALLERGY_CATEGORY_VOCAB: VocabEntry<AllergyCategory>[] = [
  {
    value: "drug",
    synonyms: [
      "medication",
      "medicine",
      "drug allergy",
      "antibiotic",
      "penicillin",
      "лекарство",
      "медикамент",
      "medicamento",
    ],
  },
  {
    value: "food",
    synonyms: [
      "food allergy",
      "nut",
      "peanut",
      "shellfish",
      "lactose",
      "gluten",
      "еда",
      "пища",
      "продукт",
      "alimento",
      "comida",
    ],
  },
  {
    value: "environmental",
    synonyms: [
      "environment",
      "pollen",
      "dust",
      "dust mite",
      "animal",
      "pet dander",
      "latex",
      "insect",
      "bee sting",
      "пыльца",
      "пыль",
      "ambiental",
      "polen",
    ],
  },
  { value: "other", synonyms: ["unknown", "unspecified", "другое", "otro"] },
];

// ── allergy.severity ────────────────────────────────────────────────────────
export type AllergySeverity = "mild" | "moderate" | "severe" | "anaphylactic";

export const ALLERGY_SEVERITY_VOCAB: VocabEntry<AllergySeverity>[] = [
  { value: "mild", synonyms: ["light", "minor", "slight", "лёгкая", "легкая", "leve"] },
  { value: "moderate", synonyms: ["medium", "умеренная", "средняя", "moderada"] },
  { value: "severe", synonyms: ["serious", "high", "тяжёлая", "тяжелая", "severa", "grave"] },
  {
    value: "anaphylactic",
    synonyms: [
      "anaphylaxis",
      "anaphylactic shock",
      "life-threatening",
      "анафилаксия",
      "анафилактический шок",
      "anafilaxia",
    ],
  },
];

// ── imaging_record.modality_type ────────────────────────────────────────────
export type ImagingModality = "xray" | "ct" | "mri" | "ultrasound" | "pet" | "other";

export const IMAGING_MODALITY_VOCAB: VocabEntry<ImagingModality>[] = [
  {
    value: "xray",
    synonyms: [
      "x-ray",
      "x ray",
      "radiograph",
      "radiography",
      "plain film",
      "roentgen",
      "рентген",
      "рентгенография",
      "radiografia",
      "radiografía",
    ],
  },
  {
    value: "ct",
    synonyms: [
      "ct scan",
      "computed tomography",
      "cat scan",
      "кт",
      "компьютерная томография",
      "tc",
      "tomografia computarizada",
    ],
  },
  {
    value: "mri",
    synonyms: [
      "magnetic resonance imaging",
      "magnetic resonance",
      "mr",
      "мрт",
      "магнитно резонансная томография",
      "resonancia magnetica",
      "resonancia magnética",
    ],
  },
  {
    value: "ultrasound",
    synonyms: [
      "us",
      "sonography",
      "sonogram",
      "doppler",
      "echography",
      "echo",
      "узи",
      "ультразвук",
      "ecografia",
      "ecografía",
      "ultrasonido",
    ],
  },
  {
    value: "pet",
    synonyms: [
      "pet scan",
      "pet-ct",
      "pet ct",
      "positron emission tomography",
      "пэт",
      "позитронно эмиссионная томография",
    ],
  },
  {
    value: "other",
    synonyms: [
      "mammography",
      "mammogram",
      "dexa",
      "fluoroscopy",
      "angiography",
      "scintigraphy",
      "маммография",
      "другое",
      "otro",
    ],
  },
];

// ── medication.type ─────────────────────────────────────────────────────────
export type MedicationType = "drug" | "supplement";

export const MEDICATION_TYPE_VOCAB: VocabEntry<MedicationType>[] = [
  {
    value: "drug",
    synonyms: [
      "medication",
      "medicine",
      "prescription",
      "rx",
      "pharmaceutical",
      "лекарство",
      "препарат",
      "medicamento",
      "farmaco",
      "fármaco",
    ],
  },
  {
    value: "supplement",
    synonyms: [
      "vitamin",
      "mineral",
      "dietary supplement",
      "nutraceutical",
      "herbal",
      "omega",
      "probiotic",
      "добавка",
      "бад",
      "витамин",
      "suplemento",
      "vitamina",
    ],
  },
];
