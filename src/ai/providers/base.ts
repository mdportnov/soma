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

  protected readonly transport: TransportConfig;

  constructor(
    protected readonly apiKey: string,
    protected readonly model: string,
    transport: Partial<TransportConfig> = {},
  ) {
    this.transport = { ...DEFAULT_TRANSPORT, ...transport };
  }

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
   * Single HTTP round-trip with an explicit timeout and status classification.
   * The request is aborted via AbortController after `transport.timeoutMs`; a
   * timeout surfaces as a (retryable) network error. Transient failures are
   * retried by `postJson` — this method just raises a correctly-tagged
   * AIProviderError, carrying any `Retry-After`, so the retry layer can decide.
   */
  private async postJsonOnce(
    url: string,
    headers: Record<string, string>,
    body: unknown,
  ): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.transport.timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      // An aborted fetch is our timeout firing, not a generic transport error —
      // label it as such (still "network", so it is retried) for a clear message.
      if (controller.signal.aborted) {
        throw new AIProviderError(
          `Request timed out after ${this.transport.timeoutMs}ms`,
          undefined,
          "network",
        );
      }
      throw new AIProviderError(
        `Network error: ${e instanceof Error ? e.message : String(e)}`,
        undefined,
        "network",
      );
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new AIProviderError(
        `${this.id} API error ${res.status}: ${detail.slice(0, 500)}`,
        res.status,
        classifyStatus(res.status),
        parseRetryAfter(res.headers.get("retry-after")),
      );
    }
    return res.json();
  }

  /**
   * Wraps the single HTTP call with bounded exponential backoff: transient
   * failures (rate_limit / overloaded / network / timeout) retry up to
   * `transport.retryDelaysMs.length` times. Auth / bad_response / unknown errors
   * bubble up immediately — never retried. Every terminal failure is logged
   * (PII-free) before it is thrown.
   */
  protected async postJson(
    url: string,
    headers: Record<string, string>,
    body: unknown,
  ): Promise<any> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.transport.retryDelaysMs.length; attempt++) {
      try {
        return await this.postJsonOnce(url, headers, body);
      } catch (e) {
        lastError = e;
        const delay = this.nextDelayMs(e, attempt);
        if (delay == null) {
          this.logFailure(e);
          throw e;
        }
        await sleep(delay);
      }
    }
    this.logFailure(lastError);
    throw lastError;
  }

  /**
   * Backoff for one attempt, or null when the error is fatal or the retry
   * budget is spent. Honors a server `Retry-After` over the local schedule
   * (clamped to `maxRetryAfterMs` so a hostile header can't hang the import),
   * with proportional jitter so concurrent rows don't retry in lockstep.
   */
  private nextDelayMs(e: unknown, attempt: number): number | null {
    const base = this.transport.retryDelaysMs[attempt];
    if (base === undefined || !isRetryableError(e)) return null;
    const jittered = base + Math.floor(Math.random() * base * 0.5);
    const retryAfter = e instanceof AIProviderError ? e.retryAfterMs : undefined;
    if (retryAfter == null) return jittered;
    return Math.min(Math.max(jittered, retryAfter), this.transport.maxRetryAfterMs);
  }

  /**
   * Records a failed request to the rotating log via console.warn (mirrored by
   * the app logger). Deliberately logs only provider / model / error taxonomy —
   * never the request body or model output, which carry medical data.
   */
  private logFailure(e: unknown): void {
    const kind = e instanceof AIProviderError ? e.kind : "unknown";
    const status = e instanceof AIProviderError && e.status != null ? e.status : "-";
    console.warn(
      `AI request failed: provider=${this.id} model=${this.model} kind=${kind} status=${status}`,
    );
  }
}

/** Tunables for the shared transport, so timeout/backoff are configurable (and
 *  tests can run with a tiny schedule). */
export type TransportConfig = {
  /** Per-request timeout in ms; the request is aborted via AbortController. */
  timeoutMs: number;
  /** Backoff schedule for transient failures; length = max retries (2 → 3 tries). */
  retryDelaysMs: number[];
  /** Hard cap on an honored `Retry-After`, so a hostile header can't hang the UI. */
  maxRetryAfterMs: number;
};

export const DEFAULT_TRANSPORT: TransportConfig = {
  timeoutMs: 60_000,
  retryDelaysMs: [500, 1500],
  maxRetryAfterMs: 30_000,
};

/**
 * Parses an HTTP `Retry-After` header into milliseconds. Accepts delta-seconds
 * ("120") and an HTTP-date; returns undefined for an absent or unparseable
 * value, and clamps a past date to 0.
 */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - now);
}

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
