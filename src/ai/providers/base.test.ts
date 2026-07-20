import { describe, it, expect, vi, beforeEach } from "vitest";
import { AIProviderError } from "../types";

// Mock the Tauri HTTP plugin so base.ts uses our controllable fetch.
const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: fetchMock }));

const { BaseProvider, parseRetryAfter } = await import("./base");

/** Concrete provider exposing the protected transport for testing. */
class TestProvider extends BaseProvider {
  readonly id = "test";
  protected async complete(): Promise<string> {
    return "";
  }
  call(): Promise<unknown> {
    return this.postJson("https://example.test/v1", {}, { hello: "world" });
  }
}

/** Minimal Response stand-in covering what postJsonOnce reads. */
function res(opts: { ok?: boolean; status?: number; json?: unknown; retryAfter?: string }) {
  const headers = new Map<string, string>();
  if (opts.retryAfter != null) headers.set("retry-after", opts.retryAfter);
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    text: async () => "provider error body: invalid schema field",
    json: async () => opts.json ?? { ok: true },
  };
}

// Tiny schedule so retries don't slow the suite.
const fast = { timeoutMs: 1000, retryDelaysMs: [1, 1], maxRetryAfterMs: 50 };

beforeEach(() => fetchMock.mockReset());

describe("postJson — retry & backoff", () => {
  it("returns the parsed body on first success", async () => {
    fetchMock.mockResolvedValueOnce(res({ json: { value: 42 } }));
    await expect(new TestProvider("k", "m", fast).call()).resolves.toEqual({ value: 42 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 429 rate-limit then succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(res({ ok: false, status: 429 }))
      .mockResolvedValueOnce(res({ json: { ok: 1 } }));
    await expect(new TestProvider("k", "m", fast).call()).resolves.toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a 5xx/overloaded across the schedule then throws", async () => {
    fetchMock.mockResolvedValue(res({ ok: false, status: 503 }));
    await expect(new TestProvider("k", "m", fast).call()).rejects.toMatchObject({
      kind: "overloaded",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("retries a network failure then succeeds", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce(res({ json: { ok: 2 } }));
    await expect(new TestProvider("k", "m", fast).call()).resolves.toEqual({ ok: 2 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry an auth error", async () => {
    fetchMock.mockResolvedValue(res({ ok: false, status: 401 }));
    await expect(new TestProvider("k", "m", fast).call()).rejects.toMatchObject({ kind: "auth" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("honors a Retry-After header on a retried 429", async () => {
    fetchMock
      .mockResolvedValueOnce(res({ ok: false, status: 429, retryAfter: "0" }))
      .mockResolvedValueOnce(res({ json: { ok: 3 } }));
    await expect(new TestProvider("k", "m", fast).call()).resolves.toEqual({ ok: 3 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("postJson — explicit timeout via AbortController", () => {
  it("aborts a hung request and surfaces a retryable network/timeout error", async () => {
    // The real request (carrying the abort signal) outlives the 10ms timeout:
    // base.ts aborts at 10ms, so when the slow rejection lands the controller is
    // already aborted → a timeout error. A signal-less call resolves benignly.
    fetchMock.mockImplementation((...args: unknown[]) => {
      const init = args[1] as { signal?: AbortSignal } | undefined;
      if (!init?.signal) return Promise.resolve(res({ json: {} }));
      return new Promise((_resolve, reject) => setTimeout(() => reject(new Error("slow")), 80));
    });
    const p = new TestProvider("k", "m", { timeoutMs: 10, retryDelaysMs: [], maxRetryAfterMs: 50 });
    const err = (await p.call().catch((e) => e)) as AIProviderError;
    expect(err).toBeInstanceOf(AIProviderError);
    expect(err.kind).toBe("network");
    expect(err.message).toMatch(/timed out/i);
  });
});

describe("failure logging", () => {
  it("logs provider/model/kind/status plus the provider's truncated error body", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockResolvedValue(res({ ok: false, status: 400 }));
    await expect(new TestProvider("k", "claude-x", fast).call()).rejects.toBeInstanceOf(
      AIProviderError,
    );
    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).toContain("provider=test");
    expect(logged).toContain("kind=bad_request");
    expect(logged).toContain("detail=");
    expect(logged).toContain("invalid schema field");
    warn.mockRestore();
  });
});

describe("parseRetryAfter", () => {
  it("parses delta-seconds", () => {
    expect(parseRetryAfter("120")).toBe(120_000);
    expect(parseRetryAfter("0")).toBe(0);
  });

  it("parses an HTTP-date relative to now", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(parseRetryAfter("Thu, 01 Jan 2026 00:00:30 GMT", now)).toBe(30_000);
  });

  it("clamps a past date to 0 and rejects unparseable / absent values", () => {
    const now = Date.parse("2026-01-01T00:00:30Z");
    expect(parseRetryAfter("Thu, 01 Jan 2026 00:00:00 GMT", now)).toBe(0);
    expect(parseRetryAfter("soon")).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
  });
});
