import type { MappingCandidatePayload } from "./types";

/**
 * Phase-1 extraction prompt (§4). Anti-collision rules are baked in:
 * structure only, original labels verbatim, no dictionary mapping,
 * no invented values, JSON only.
 */
export const EXTRACTION_PROMPT = `You are a data-extraction engine for laboratory reports. The attached document is a lab test report; it may be in any language, from any country, photographed or scanned.

Extract EVERY quantitative analyte row and return ONLY a JSON array, with one object per row:

[{"raw_label": string, "value": number, "unit": string, "ref_range_text": string | null, "page": number | null}]

Strict rules:
- "raw_label" must be the analyte name EXACTLY as printed (original language, original wording). Do NOT translate, rename, normalize, or map it to any standard nomenclature.
- "value" must be the numeric result. Use "." as decimal separator. For values printed like "<0.5" use the number (0.5). Skip rows whose result is purely qualitative (e.g. "negative") — do not invent numbers.
- "unit" is the unit string exactly as printed, or "" if no unit is printed.
- "ref_range_text" is the reference range exactly as printed, or null.
- "page" is the 1-based page number the row appears on, or null for images.
- Do not add analytes that are not in the document. Do not deduplicate rows.
- Output ONLY the JSON array. No preamble, no Markdown fences, no commentary.`;

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
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
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
