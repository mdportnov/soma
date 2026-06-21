/**
 * Shared validation primitives for AI-import extraction (§4 phase 1).
 *
 * Model output is untrusted: every string is trimmed and length-bounded, every
 * date must be well-formed ISO `YYYY-MM-DD` (a guess is worse than a null), and
 * numbers tolerate the locale formatting found on scanned reports. Every doc-type
 * module validates its raw extraction through these helpers so the rules stay
 * identical across labs, vaccines, imaging, prescriptions and the rest.
 */

import { AIProviderError } from "../types";

/** Trimmed, length-bounded string or null (empty → null). */
export function nullableStr(v: unknown, maxLen = 200): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, maxLen);
  return t || null;
}

/** Trimmed, length-bounded string, never null ("" when absent). */
export function boundedStr(v: unknown, maxLen = 200): string {
  return typeof v === "string" ? v.trim().slice(0, maxLen) : "";
}

/** Accept only well-formed ISO `YYYY-MM-DD`; anything else (incl. guesses) → null. */
export function isoDateOrNull(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null;
}

/** A real boolean or null — a model "maybe" must never become a false. */
export function boolOrNull(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

/** A finite integer or null. */
export function intOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null;
}

/**
 * Parse a numeric string that may use locale formatting from a scanned report:
 * thousands separators (`1,234` / `1.234` / `1 234` / `1'234`) and a decimal
 * comma (`12,5`). A naive `replace(",", ".")` only swaps the first comma,
 * turning `"1.234,56"` into `1.234` — a silent 1000× error. We detect the
 * decimal separator as the right-most of `.`/`,` and strip the rest.
 */
export function parseLocaleNumber(raw: string): number {
  let s = raw.trim().replace(/[\s']/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma !== -1 && lastDot !== -1) {
    // Both present: the right-most separator is the decimal point.
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma !== -1) {
    // Commas only: treat the last as decimal, the rest as thousands groupers.
    s = s.replace(/,(?=.*,)/g, "").replace(",", ".");
  }
  return Number.parseFloat(s);
}

/** A finite number (locale-tolerant when a string), or null. */
export function numberOrNull(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = parseLocaleNumber(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** An array or [] — never throws on a model that returned the wrong shape. */
export function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** A plain object or null (arrays excluded). */
export function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/**
 * Assert the model returned a JSON object, raising a `bad_response` error (so the
 * UI shows "unreadable response" + retry) rather than a raw TypeError when it
 * returned an array, a string, or null instead.
 */
export function expectObject(v: unknown, what: string): Record<string, unknown> {
  const o = asObject(v);
  if (!o) {
    throw new AIProviderError(`${what} did not return a JSON object`, undefined, "bad_response");
  }
  return o;
}

/** Assert the model returned a JSON array, raising a `bad_response` error otherwise. */
export function expectArray(v: unknown, what: string): unknown[] {
  if (!Array.isArray(v)) {
    throw new AIProviderError(`${what} did not return a JSON array`, undefined, "bad_response");
  }
  return v;
}
