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
