/** Shared types for the AI provider abstraction (§5) and import pipeline (§4). */

export type DocumentInput = {
  /** Base64-encoded file content (no data: prefix). */
  base64: string;
  mimeType: string;
  fileName?: string;
};

/** Phase-1 output: structure only, no interpretation, no dictionary mapping. */
export type RawExtraction = {
  raw_label: string;
  /**
   * The analyte's standard English name as translated by the model — used to
   * match foreign-language reports against the English biomarker dictionary.
   * `raw_label` stays verbatim for the audit trail; this is the matching key.
   */
  analyte_en: string | null;
  value: number;
  /** Unit string exactly as printed in the document ("" if absent). */
  unit: string;
  ref_range_text: string | null;
  page: number | null;
};

/**
 * Phase-1 lab-report output: the analyte rows plus panel-level metadata read
 * from the same document. The collection date matters for correlation — without
 * it an old report imported today would be mis-dated and break the trend.
 */
export type LabExtraction = {
  /** ISO `YYYY-MM-DD` sample-collection date, or null when not legible. */
  collectionDate: string | null;
  /** Laboratory / clinic name as printed, or null. */
  labName: string | null;
  /** Fasting state at draw if stated; null when unknown. */
  fasting: boolean | null;
  results: RawExtraction[];
  /**
   * Rows that had a real label but a non-numeric result (qualitative readings
   * like "positive"/"negative", titres) — silently unsupported by the numeric
   * pipeline, surfaced here so the user knows they were dropped. Capped.
   */
  skipped?: { label: string; rawValue: string }[];
};

/**
 * Vaccination-certificate extraction. No dictionary fallback exists, so every
 * row is reviewed manually before it reaches the database.
 */
export type RawVaccineExtraction = {
  vaccineName: string;
  /** ISO `YYYY-MM-DD` administration date, or null when not legible. */
  date: string | null;
  /** Dose number within a series (1 of 3), or null. */
  doseNumber: number | null;
  manufacturer: string | null;
  batchNumber: string | null;
  /** ISO `YYYY-MM-DD` validity end, or null. */
  expiresAt: string | null;
};

/**
 * Discharge-summary extraction. Free-form clinical document with mixed entities;
 * always reviewed manually before any visit/diagnosis/medication is written.
 */
export type RawDischargeExtraction = {
  /** ISO `YYYY-MM-DD`, or null when not legible. */
  visitDate: string | null;
  clinic: string | null;
  doctorName: string | null;
  diagnoses: { name: string; icdCode: string | null }[];
  medications: { name: string; dose: string | null }[];
  /** Allergies / adverse drug reactions stated in the summary (safety-critical). */
  allergies: { allergen: string; reaction: string | null; severity: string | null }[];
  notes: string;
};

export type MappingCandidatePayload = {
  biomarker_id: number;
  canonical_name: string;
  default_unit: string;
  category: string;
};

export type ChatMessage = { role: "user" | "assistant"; content: string };

/**
 * Single internal interface per §5 — adding a provider means writing one
 * adapter; the pipeline never talks to vendor SDKs directly.
 */
export interface AIProvider {
  readonly id: string;
  /**
   * Phase 1: structured extraction from an image/PDF. The caller supplies the
   * doc-type-specific prompt; the provider returns the model's parsed JSON
   * (object or array) and the doc-type module validates its shape. One method
   * serves every document type so adding a section needs no provider changes.
   */
  extractStructured(doc: DocumentInput, prompt: string, maxTokens?: number): Promise<unknown>;
  /**
   * Phase 2 fallback: pick the most likely biomarker for a raw label from an
   * explicit candidate list, or null. The model never invents biomarkers.
   */
  mapBiomarker(
    rawLabel: string,
    unit: string,
    candidates: MappingCandidatePayload[],
  ): Promise<number | null>;
  /** Free-form chat with health context (v1.x features). */
  chat(messages: ChatMessage[], systemPrompt?: string): Promise<string>;
  /** Cheap round-trip to validate the API key. */
  testKey(): Promise<void>;
}

/**
 * Coarse failure category the UI branches on. Keeps the original message/status
 * for logs while letting the import screen pick the right message + affordance.
 * - auth: key rejected (401/403) — fix in Settings, never retry.
 * - rate_limit: 429 — transient, retried with backoff.
 * - overloaded: 503/529 — transient, retried with backoff.
 * - network: fetch threw (offline, DNS, TLS) — transient, retried with backoff.
 * - bad_response: server replied OK but the body was unparseable/empty — retry.
 * - unknown: any other non-ok status (most 4xx, 5xx) — not retried.
 */
export type AIErrorKind =
  | "auth"
  | "rate_limit"
  | "overloaded"
  | "network"
  | "bad_response"
  | "unknown";

export class AIProviderError extends Error {
  readonly kind: AIErrorKind;

  constructor(
    message: string,
    public readonly status?: number,
    kind?: AIErrorKind,
    /**
     * Server-advised minimum wait before retrying, in ms, parsed from a
     * `Retry-After` header (429/503). The retry layer honors it over its own
     * backoff when present.
     */
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "AIProviderError";
    this.kind = kind ?? "unknown";
  }
}

/** True when the failure is transient and worth a backed-off retry. */
export function isRetryableError(e: unknown): boolean {
  return (
    e instanceof AIProviderError &&
    (e.kind === "rate_limit" || e.kind === "overloaded" || e.kind === "network")
  );
}
