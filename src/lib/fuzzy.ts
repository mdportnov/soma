/**
 * Deterministic string matching for the import mapper (§4 phase 2).
 * No AI involved here: normalize → exact/alias → fuzzy candidates.
 */

/** Lowercase, trim, collapse whitespace, strip punctuation/diacritics. */
export function normalizeLabel(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.,;:!?*()[\]{}'"“”«»]/g, " ")
    .replace(/[-_/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

function trigrams(s: string): Set<string> {
  const padded = `  ${s} `;
  const grams = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) grams.add(padded.slice(i, i + 3));
  return grams;
}

/** Jaccard similarity over character trigrams, 0..1. */
export function trigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const ta = trigrams(a);
  const tb = trigrams(b);
  let inter = 0;
  for (const g of ta) if (tb.has(g)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/** Combined similarity 0..1 — robust to both OCR typos and word reordering. */
export function similarity(a: string, b: string): number {
  const lev = 1 - levenshtein(a, b) / Math.max(a.length, b.length, 1);
  const tri = trigramSimilarity(a, b);
  return Math.max(lev * 0.6 + tri * 0.4, tri, lev);
}
