import { fetch } from "@tauri-apps/plugin-http";
import {
  AIProviderError,
  type AIProvider,
  type ChatMessage,
  type DocumentInput,
  type MappingCandidatePayload,
  type RawExtraction,
} from "../types";
import { buildMappingPrompt, EXTRACTION_PROMPT, extractJson, TEST_PROMPT } from "../prompts";

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

  async extractFromDocument(doc: DocumentInput): Promise<RawExtraction[]> {
    const text = await this.complete({
      parts: [
        { type: "document", doc },
        { type: "text", text: EXTRACTION_PROMPT },
      ],
      maxTokens: 16384,
    });
    const parsed = extractJson<unknown>(text);
    return validateExtractions(parsed);
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

  protected async postJson(url: string, headers: Record<string, string>, body: unknown): Promise<any> {
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

function validateExtractions(parsed: unknown): RawExtraction[] {
  if (!Array.isArray(parsed)) {
    throw new AIProviderError("Extraction did not return a JSON array");
  }
  const rows: RawExtraction[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const rawLabel = typeof o.raw_label === "string" ? o.raw_label.trim() : "";
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
      unit: typeof o.unit === "string" ? o.unit.trim() : "",
      ref_range_text: typeof o.ref_range_text === "string" ? o.ref_range_text : null,
      page: typeof o.page === "number" ? o.page : null,
    });
  }
  return rows;
}
