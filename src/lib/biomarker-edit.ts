/**
 * Pure helpers for the in-app dictionary editor (ranges + aliases). Kept free of
 * React/DB imports so the parsing and validation rules can be unit-tested.
 */

/**
 * Parses a free-text alias list (comma- or newline-separated) into a clean,
 * de-duplicated array. Dedupe is case-insensitive; the first spelling wins.
 */
export function parseAliases(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(/[,\n]/)) {
    const alias = raw.trim();
    if (!alias) continue;
    const key = alias.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(alias);
  }
  return out;
}

/** Trimmed numeric input → finite number, or null for empty/invalid. */
export function parseNumberOrNull(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export type RangeFields = {
  refLow: number | null;
  refHigh: number | null;
  optimalLow: number | null;
  optimalHigh: number | null;
};

export type RangeValidation = { ok: true } | { ok: false; error: "ref" | "optimal" };

/**
 * Validates low ≤ high for the reference and optimal pairs. A null on either
 * side skips that pair (an open-ended range is legitimate).
 */
export function validateRanges(r: RangeFields): RangeValidation {
  if (r.refLow != null && r.refHigh != null && r.refLow > r.refHigh) {
    return { ok: false, error: "ref" };
  }
  if (r.optimalLow != null && r.optimalHigh != null && r.optimalLow > r.optimalHigh) {
    return { ok: false, error: "optimal" };
  }
  return { ok: true };
}
