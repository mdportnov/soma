import { fetch } from "@tauri-apps/plugin-http";
import {
  AIProviderError,
  isRetryableError,
  type AIProvider,
  type ChatMessage,
  type DocumentInput,
  type MappingCandidatePayload,
} from "../types";
import { buildMappingPrompt, extractJson, TEST_PROMPT } from "../prompts";

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

  /**
   * Generic phase-1 extraction: send the document + a doc-type prompt, return
   * the model's parsed JSON. Validation of the shape is the caller's job (each
   * doc-type module owns its validator). A truncated/garbled reply surfaces as a
   * `bad_response` AIProviderError via `parseModelJson`.
   */
  async extractStructured(doc: DocumentInput, prompt: string, maxTokens = 8192): Promise<unknown> {
    const text = await this.complete({
      parts: [
        { type: "document", doc },
        { type: "text", text: prompt },
      ],
      maxTokens,
    });
    return parseModelJson(text);
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

  /**
   * Single HTTP round-trip with status classification. Transient failures
   * (rate_limit/overloaded/network) are retried by `postJson`; this method just
   * raises a correctly-tagged AIProviderError so the retry layer can decide.
   */
  private async postJsonOnce(
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
      throw new AIProviderError(
        `Network error: ${e instanceof Error ? e.message : String(e)}`,
        undefined,
        "network",
      );
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new AIProviderError(
        `${this.id} API error ${res.status}: ${detail.slice(0, 500)}`,
        res.status,
        classifyStatus(res.status),
      );
    }
    return res.json();
  }

  /**
   * Wraps the single HTTP call with bounded exponential backoff: transient
   * failures retry up to RETRY_DELAYS_MS.length times (3 attempts total).
   * Auth / bad_response / unknown errors bubble up immediately — never retried.
   */
  protected async postJson(
    url: string,
    headers: Record<string, string>,
    body: unknown,
  ): Promise<any> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        return await this.postJsonOnce(url, headers, body);
      } catch (e) {
        lastError = e;
        const delay = RETRY_DELAYS_MS[attempt];
        if (delay === undefined || !isRetryableError(e)) throw e;
        // Small jitter so concurrent rows don't retry in lockstep.
        await sleep(delay + Math.floor(Math.random() * 250));
      }
    }
    throw lastError;
  }
}

/** Backoff schedule for transient failures; length = max retries (2 → 3 tries). */
const RETRY_DELAYS_MS = [500, 1500];

/**
 * Parse a model reply as JSON, re-tagging any failure as a `bad_response`
 * AIProviderError so the UI shows "unreadable response" with a retry instead of
 * a raw parse error. A truncated reply (hit the token cap) lands here too.
 */
function parseModelJson(text: string): unknown {
  try {
    return extractJson<unknown>(text);
  } catch (e) {
    throw new AIProviderError(
      `Could not parse model response: ${e instanceof Error ? e.message : String(e)}`,
      undefined,
      "bad_response",
    );
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Maps an HTTP status onto the coarse error taxonomy the UI branches on. */
function classifyStatus(status: number): "auth" | "rate_limit" | "overloaded" | "unknown" {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  if (status === 503 || status === 529) return "overloaded";
  return "unknown";
}
