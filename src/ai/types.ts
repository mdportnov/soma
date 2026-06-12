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
  value: number;
  /** Unit string exactly as printed in the document ("" if absent). */
  unit: string;
  ref_range_text: string | null;
  page: number | null;
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
  /** Phase 1: strict structured extraction from an image/PDF. */
  extractFromDocument(doc: DocumentInput): Promise<RawExtraction[]>;
  /**
   * Vaccination-certificate extraction. Output is always reviewed manually —
   * there is no deterministic dictionary fallback for vaccines.
   */
  extractVaccinesFromDocument(doc: DocumentInput): Promise<RawVaccineExtraction[]>;
  /** Discharge-summary extraction. Always reviewed manually before saving. */
  extractDischargeFromDocument(doc: DocumentInput): Promise<RawDischargeExtraction>;
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

export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}
