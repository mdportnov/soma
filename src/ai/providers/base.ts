import { fetch } from "@tauri-apps/plugin-http";
import {
  AIProviderError,
  type AIProvider,
  type ChatMessage,
  type DocumentInput,
  type LabExtraction,
  type MappingCandidatePayload,
  type RawDischargeExtraction,
  type RawExtraction,
  type RawVaccineExtraction,
} from "../types";
import {
  buildMappingPrompt,
  DISCHARGE_EXTRACTION_PROMPT,
  EXTRACTION_PROMPT,
  extractJson,
  TEST_PROMPT,
  VACCINE_EXTRACTION_PROMPT,
} from "../prompts";

export type UserPart = { type: "text"; text: string } | { type: "document"; doc: DocumentInput };

export type CompletionRequest = {
  system?: string;
  parts: UserPart[];
  maxTokens: number;
};

/**
 * Vendor adapters only implement `complete` (one user turn → text).
 * Pipeline-facing methods are shared, so prompts and parsing stay identical
 * across providers.
 */
export abstract class BaseProvider implements AIProvider {
  abstract readonly id: string;

  constructor(
    protected readonly apiKey: string,
    protected readonly model: string,
  ) {}

  protected abstract complete(req: CompletionRequest): Promise<string>;

  async extractFromDocument(doc: DocumentInput): Promise<LabExtraction> {
    const text = await this.complete({
      parts: [
        { type: "document", doc },
        { type: "text", text: EXTRACTION_PROMPT },
      ],
      maxTokens: 16384,
    });
    return validateLabExtraction(extractJson<unknown>(text));
  }

  async extractVaccinesFromDocument(doc: DocumentInput): Promise<RawVaccineExtraction[]> {
    const text = await this.complete({
      parts: [
        { type: "document", doc },
        { type: "text", text: VACCINE_EXTRACTION_PROMPT },
      ],
      maxTokens: 8192,
    });
    return validateVaccines(extractJson<unknown>(text));
  }

  async extractDischargeFromDocument(doc: DocumentInput): Promise<RawDischargeExtraction> {
    const text = await this.complete({
      parts: [
        { type: "document", doc },
        { type: "text", text: DISCHARGE_EXTRACTION_PROMPT },
      ],
      maxTokens: 8192,
    });
    return validateDischarge(extractJson<unknown>(text));
  }

  async mapBiomarker(
    rawLabel: string,
    unit: string,
    candidates: MappingCandidatePayload[],
  ): Promise<number | null> {
    if (!candidates.length) return null;
    const text = await this.complete({
      parts: [{ type: "text", text: buildMappingPrompt(rawLabel, unit, candidates) }],
      maxTokens: 200,
    });
    const parsed = extractJson<{ biomarker_id: unknown }>(text);
    const id = parsed.biomarker_id;
    if (typeof id !== "number") return null;
    // Hard anti-collision guard: accept only ids from the provided list.
    return candidates.some((c) => c.biomarker_id === id) ? id : null;
  }

  async chat(messages: ChatMessage[], systemPrompt?: string): Promise<string> {
    const last = messages[messages.length - 1];
    if (!last || last.role !== "user") {
      throw new AIProviderError("Chat requires a trailing user message");
    }
    const history = messages
      .slice(0, -1)
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n\n");
    const text = history ? `${history}\n\nUser: ${last.content}` : last.content;
    return this.complete({
      system: systemPrompt,
      parts: [{ type: "text", text }],
      maxTokens: 4096,
    });
  }

  async testKey(): Promise<void> {
    await this.complete({ parts: [{ type: "text", text: TEST_PROMPT }], maxTokens: 16 });
  }

  protected async postJson(
    url: string,
    headers: Record<string, string>,
    body: unknown,
  ): Promise<any> {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new AIProviderError(`Network error: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new AIProviderError(
        `${this.id} API error ${res.status}: ${detail.slice(0, 500)}`,
        res.status,
      );
    }
    return res.json();
  }
}

/**
 * Accepts the panel object `{collection_date, lab_name, fasting, results}` and,
 * for resilience, a bare `results` array from a model that ignored the schema.
 */
function validateLabExtraction(parsed: unknown): LabExtraction {
  if (Array.isArray(parsed)) {
    return { collectionDate: null, labName: null, fasting: null, results: validateExtractions(parsed) };
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new AIProviderError("Extraction did not return a JSON object");
  }
  const o = parsed as Record<string, unknown>;
  return {
    collectionDate: isoDateOrNull(o.collection_date),
    labName: nullableStr(o.lab_name),
    fasting: typeof o.fasting === "boolean" ? o.fasting : null,
    results: validateExtractions(o.results),
  };
}

function validateExtractions(parsed: unknown): RawExtraction[] {
  if (!Array.isArray(parsed)) {
    throw new AIProviderError("Extraction results is not a JSON array");
  }
  const rows: RawExtraction[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    // Bound every string: model output is untrusted and could be huge.
    const rawLabel = typeof o.raw_label === "string" ? o.raw_label.trim().slice(0, 300) : "";
    const value =
      typeof o.value === "number"
        ? o.value
        : typeof o.value === "string"
          ? Number.parseFloat(o.value.replace(",", "."))
          : NaN;
    if (!rawLabel || !Number.isFinite(value)) continue;
    rows.push({
      raw_label: rawLabel,
      value,
      unit: typeof o.unit === "string" ? o.unit.trim().slice(0, 40) : "",
      ref_range_text:
        typeof o.ref_range_text === "string" ? o.ref_range_text.trim().slice(0, 120) : null,
      page: typeof o.page === "number" ? o.page : null,
    });
  }
  return rows;
}

/** Trimmed, length-bounded string or null (model output is untrusted). */
function nullableStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, 200);
  return t ? t : null;
}

/** Accept only well-formed ISO `YYYY-MM-DD`; anything else (incl. guesses) → null. */
function isoDateOrNull(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null;
}

function validateVaccines(parsed: unknown): RawVaccineExtraction[] {
  if (!Array.isArray(parsed)) {
    throw new AIProviderError("Vaccine extraction did not return a JSON array");
  }
  const rows: RawVaccineExtraction[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const name = nullableStr(o.vaccineName);
    if (!name) continue;
    const dose =
      typeof o.doseNumber === "number" && Number.isFinite(o.doseNumber)
        ? Math.trunc(o.doseNumber)
        : null;
    rows.push({
      vaccineName: name,
      date: isoDateOrNull(o.date),
      doseNumber: dose,
      manufacturer: nullableStr(o.manufacturer),
      batchNumber: nullableStr(o.batchNumber),
      expiresAt: isoDateOrNull(o.expiresAt),
    });
  }
  return rows;
}

function validateDischarge(parsed: unknown): RawDischargeExtraction {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new AIProviderError("Discharge extraction did not return a JSON object");
  }
  const o = parsed as Record<string, unknown>;
  const diagnoses = Array.isArray(o.diagnoses)
    ? o.diagnoses
        .map((d) => {
          if (typeof d !== "object" || d === null) return null;
          const r = d as Record<string, unknown>;
          const name = nullableStr(r.name);
          return name ? { name, icdCode: nullableStr(r.icdCode) } : null;
        })
        .filter((d): d is { name: string; icdCode: string | null } => d !== null)
    : [];
  const medications = Array.isArray(o.medications)
    ? o.medications
        .map((m) => {
          if (typeof m !== "object" || m === null) return null;
          const r = m as Record<string, unknown>;
          const name = nullableStr(r.name);
          return name ? { name, dose: nullableStr(r.dose) } : null;
        })
        .filter((m): m is { name: string; dose: string | null } => m !== null)
    : [];
  return {
    visitDate: isoDateOrNull(o.visitDate),
    clinic: nullableStr(o.clinic),
    doctorName: nullableStr(o.doctorName),
    diagnoses,
    medications,
    notes: typeof o.notes === "string" ? o.notes.trim().slice(0, 4000) : "",
  };
}
