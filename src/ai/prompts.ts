import type { MappingCandidatePayload } from "./types";

/**
 * Phase-1 extraction prompt (§4). Anti-collision rules are baked in:
 * structure only, original labels verbatim, no dictionary mapping,
 * no invented values, JSON only.
 */
export const EXTRACTION_PROMPT = `You are a data-extraction engine for laboratory reports. The attached document is a lab test report; it may be in any language, from any country, photographed or scanned.

Extract the panel metadata and EVERY quantitative analyte row, and return ONLY a single JSON object:

{"collection_date": string | null, "lab_name": string | null, "fasting": boolean | null, "results": [{"raw_label": string, "analyte_en": string | null, "value": number, "unit": string, "ref_range_text": string | null, "page": number | null}]}

Strict rules:
- "collection_date" is the date the sample was COLLECTED/DRAWN as ISO "YYYY-MM-DD" (prefer the collection/sampling date over the print/report date if both are shown). If the day/month/year is not fully legible, use null. Never guess.
- "lab_name" is the laboratory or clinic name as printed, or null.
- "fasting" is true if the report states the sample was taken fasting, false if it states non-fasting, otherwise null. Never guess.
- "results" contains one object per analyte row.
- "raw_label" must be the analyte name EXACTLY as printed (original language, original wording). Do NOT translate, rename, normalize, or map it to any standard nomenclature.
- "analyte_en" is the SAME analyte's standard English name, translated from "raw_label" so it can be matched against an English dictionary — e.g. "Colesterol total" → "Total cholesterol", "Глюкоза" → "Glucose", "Erythrozyten" → "Red blood cells", "Hierro" → "Iron", "Hémoglobine" → "Hemoglobin". If the label is already English, repeat it verbatim. Use the common clinical English term; never invent an analyte that is not in the document; use null only if you genuinely cannot tell what it is.
- "value" must be the numeric result. Use "." as decimal separator. For values printed like "<0.5" use the number (0.5). Skip rows whose result is purely qualitative (e.g. "negative") — do not invent numbers.
- "unit" is the unit string exactly as printed, or "" if no unit is printed.
- "ref_range_text" is the reference range exactly as printed, or null.
- "page" is the 1-based page number the row appears on, or null for images.
- Do not add analytes that are not in the document. Do not deduplicate rows.
- Output ONLY the JSON object. No preamble, no Markdown fences, no commentary.`;

/**
 * Vaccination-certificate extraction prompt. Output is reviewed 100% manually,
 * so the model must never guess: unreadable fields become null.
 */
export const VACCINE_EXTRACTION_PROMPT = `You are a data-extraction engine for vaccination certificates. The attached document is a vaccination record or certificate; it may be in any language, from any country, photographed or scanned.

Extract EVERY administered vaccine dose and return ONLY a JSON array, with one object per dose:

[{"vaccineName": string, "date": string | null, "doseNumber": number | null, "manufacturer": string | null, "batchNumber": string | null, "expiresAt": string | null}]

Strict rules:
- "vaccineName" is the vaccine or disease name as printed (e.g. "COVID-19", "Hepatitis B", "Yellow fever"). Keep it readable; do not invent a name.
- "date" is the administration date as ISO "YYYY-MM-DD". If the day/month/year is not fully legible, use null. Never guess.
- "doseNumber" is the dose's position in its series as an integer (1, 2, 3…), or null if not stated.
- "manufacturer" is the vaccine manufacturer or product brand, or null.
- "batchNumber" is the lot / batch / series number exactly as printed, or null.
- "expiresAt" is the certificate or protection validity end date as ISO "YYYY-MM-DD", or null.
- Do not add doses that are not in the document. Do not deduplicate rows.
- Output ONLY the JSON array. No preamble, no Markdown fences, no commentary.`;

/**
 * Discharge-summary extraction prompt. Output is reviewed 100% manually, so the
 * model must never guess: unreadable fields become null, missing lists become [].
 */
export const DISCHARGE_EXTRACTION_PROMPT = `You are a data-extraction engine for hospital discharge summaries. The attached document is a discharge summary or epicrisis; it may be in any language, from any country, photographed or scanned.

Extract its structured content and return ONLY a single JSON object:

{"visitDate": string | null, "clinic": string | null, "doctorName": string | null, "diagnoses": [{"name": string, "icdCode": string | null}], "medications": [{"name": string, "dose": string | null}], "allergies": [{"allergen": string, "reaction": string | null, "severity": string | null}], "notes": string}

Strict rules:
- "visitDate" is the discharge (or admission, if discharge is absent) date as ISO "YYYY-MM-DD". If not fully legible, use null. Never guess.
- "clinic" is the hospital or clinic name as printed, or null.
- "doctorName" is the discharging/attending physician's name as printed, or null.
- "diagnoses" lists each diagnosis with "name" as printed and "icdCode" (the ICD-10 or ICD-11 code, e.g. "E11.9", "I10") exactly as printed, or null when no code is given. Do not invent or infer codes. Use [] if none.
- "medications" lists each prescribed medication with "name" as printed and "dose" (the dose/strength text as printed, e.g. "500 mg"), or null. Use [] if none.
- "allergies" lists each allergy or adverse drug reaction stated in the document: "allergen" is the substance (drug/food/etc.) as printed; "reaction" is the described reaction (e.g. "rash", "anaphylaxis") or null; "severity" is one of "mild", "moderate", "severe", "anaphylactic" if stated or clearly implied, else null. Use [] if none. Never invent an allergy.
- "notes" is a concise plain-text summary of recommendations and clinical course, in the document's original language. Use "" if nothing relevant.
- Do not invent diagnoses, medications, allergies, codes, or dates. Output ONLY the JSON object. No preamble, no Markdown fences, no commentary.`;

/**
 * Imaging-report extraction prompt. Output is reviewed 100% manually. One report
 * usually describes a single study but may bundle several (e.g. "CT chest +
 * abdomen") — emit one object per distinct study. The model never guesses.
 */
export const IMAGING_EXTRACTION_PROMPT = `You are a data-extraction engine for radiology / medical imaging reports. The attached document is an imaging report (X-ray, CT, MRI, ultrasound, PET, mammography, etc.); it may be in any language, from any country, photographed or scanned.

Extract EVERY distinct imaging study and return ONLY a JSON array, one object per study:

[{"date": string | null, "modality": string, "bodyArea": string, "findings": string | null, "radiologistName": string | null, "clinic": string | null}]

Strict rules:
- "date" is the study/examination date as ISO "YYYY-MM-DD". If not fully legible, use null. Never guess.
- "modality" is the imaging method in clinical English: one of "X-ray", "CT", "MRI", "Ultrasound", "PET", or the printed name if none of these fit. Translate to English (e.g. "Рентген" → "X-ray", "Ecografía" → "Ultrasound").
- "bodyArea" is the examined region/organ in clinical English (e.g. "Chest", "Lumbar spine", "Abdomen", "Right knee"). Keep it short.
- "findings" is the radiologist's findings/impression as a concise plain-text summary, in the document's ORIGINAL language. Use null if none is legible.
- "radiologistName" is the reporting radiologist's name as printed, or null.
- "clinic" is the facility / imaging center name as printed, or null.
- Do not invent studies, findings, or dates. Output ONLY the JSON array. No preamble, no Markdown fences, no commentary.`;

/**
 * Prescription / medication-list extraction prompt. Output is reviewed 100%
 * manually. Covers handwritten or printed prescriptions and medication lists.
 */
export const PRESCRIPTION_EXTRACTION_PROMPT = `You are a data-extraction engine for prescriptions and medication lists. The attached document is a prescription (Rx) or a list of medications/supplements; it may be in any language, from any country, photographed or scanned.

Extract EVERY medication or supplement and return ONLY a JSON array, one object per item:

[{"name": string, "type": string | null, "dose": string | null, "frequency": string | null, "purpose": string | null, "asNeeded": boolean | null}]

Strict rules:
- "name" is the drug or supplement name as printed (keep the original brand/INN spelling; do not translate the name itself).
- "type" is "drug" for pharmaceuticals or "supplement" for vitamins/minerals/herbal/dietary supplements, in English. Use null if you cannot tell.
- "dose" is the strength/amount per intake exactly as printed (e.g. "500 mg", "1 tablet", "10 IU"), or null.
- "frequency" is how often it is taken, in clinical English where possible (e.g. "twice daily", "once a week", "as needed", "every 8 hours"), or null.
- "purpose" is the indication / reason if stated (e.g. "hypertension"), in the original language, or null.
- "asNeeded" is true if the item is explicitly PRN / "as needed" / "при необходимости", false if it is a standing schedule, otherwise null.
- Do not invent medications, doses, or schedules. Output ONLY the JSON array. No preamble, no Markdown fences, no commentary.`;

/**
 * Allergy-record extraction prompt. Output is reviewed 100% manually — allergies
 * are safety-critical, so the model must never guess severity or invent entries.
 */
export const ALLERGY_EXTRACTION_PROMPT = `You are a data-extraction engine for allergy records. The attached document lists a patient's allergies or intolerances (an allergy passport, a chart section, or a note); it may be in any language, from any country, photographed or scanned.

Extract EVERY allergy / intolerance and return ONLY a JSON array, one object per allergen:

[{"allergen": string, "category": string | null, "severity": string | null, "reaction": string | null, "onsetDate": string | null}]

Strict rules:
- "allergen" is the substance the person is allergic to as printed (e.g. "Penicillin", "Peanuts", "Pollen").
- "category" is one of "drug", "food", "environmental", or "other" in English, inferred from the allergen. Use null only if genuinely unclear.
- "severity" is one of "mild", "moderate", "severe", "anaphylactic" in English, ONLY if the document states or clearly implies it (e.g. "anaphylaxis" → "anaphylactic"). Use null when severity is not indicated. Never guess severity.
- "reaction" is the described reaction (e.g. "hives", "swelling", "difficulty breathing") in the original language, or null.
- "onsetDate" is the date the allergy was first noted as ISO "YYYY-MM-DD", or null. Never guess.
- Do not invent allergies, severities, or reactions. Output ONLY the JSON array. No preamble, no Markdown fences, no commentary.`;

/**
 * Phase-2 disambiguation prompt (§4). The model may ONLY choose from the
 * provided candidate list or return null — it never creates biomarkers.
 */
export function buildMappingPrompt(
  rawLabel: string,
  unit: string,
  candidates: MappingCandidatePayload[],
): string {
  return `A lab report contains an analyte labeled "${rawLabel}" with unit "${unit}".

Candidate biomarkers (the ONLY allowed choices):
${JSON.stringify(candidates, null, 2)}

Pick the single candidate that this label most likely refers to, considering the label text (any language) and unit compatibility. If none of the candidates is a confident match, answer null. You must NOT propose any biomarker outside this list.

Return ONLY this JSON object, nothing else:
{"biomarker_id": <number or null>}`;
}

export const TEST_PROMPT = `Reply with exactly the word "ok".`;

/** Mandatory disclaimer attached to user-facing AI output (§8). */
export const AI_DISCLAIMER =
  "AI-generated content. Not medical advice — always consult a qualified clinician.";

/** Robustly pulls a JSON value out of a model response (fences, preamble). */
export function extractJson<T>(text: string): T {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Fall back to the first balanced JSON array/object in the text.
    const start = cleaned.search(/[[{]/);
    if (start === -1) throw new Error("No JSON found in model response");
    const open = cleaned[start];
    const close = open === "[" ? "]" : "}";
    let depth = 0;
    let inString = false;
    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (inString) {
        if (ch === "\\") i++;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === open) depth++;
      else if (ch === close && --depth === 0) {
        return JSON.parse(cleaned.slice(start, i + 1)) as T;
      }
    }
    throw new Error("Malformed JSON in model response");
  }
}
