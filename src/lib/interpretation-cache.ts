/**
 * Local cache for AI trend interpretations, keyed by a hash of the exact inputs
 * that shape the answer (biomarker, ranges, the plotted points, overlapping
 * medications). Revisiting a biomarker whose data hasn't changed shows the prior
 * interpretation instead of making another paid API call; "Regenerate" always
 * forces a fresh one. Best-effort — a storage failure just means no cache.
 */
const KEY_PREFIX = "soma.interp.";
const MAX_ENTRIES = 100;
const INDEX_KEY = "soma.interp.index";

/** Stable, order-sensitive fingerprint of the interpretation inputs. */
export function interpretationKey(parts: {
  name: string;
  direction: string | null;
  referenceRange: string | null;
  optimalRange: string | null;
  points: { date: string; value: number }[];
  medications: string[];
}): string {
  const serialized = JSON.stringify([
    parts.name,
    parts.direction,
    parts.referenceRange,
    parts.optimalRange,
    parts.points.map((p) => [p.date, p.value]),
    [...parts.medications].sort(),
  ]);
  // djb2 → base36; short, collision-resistant enough for a per-user cache key.
  let hash = 5381;
  for (let i = 0; i < serialized.length; i++) hash = (hash * 33) ^ serialized.charCodeAt(i);
  return (hash >>> 0).toString(36);
}

export function getInterpretation(key: string): string | null {
  try {
    return localStorage.getItem(KEY_PREFIX + key);
  } catch {
    return null;
  }
}

export function setInterpretation(key: string, text: string): void {
  try {
    localStorage.setItem(KEY_PREFIX + key, text);
    // Track keys so the cache can be bounded (drop oldest first).
    const index: string[] = JSON.parse(localStorage.getItem(INDEX_KEY) ?? "[]");
    const next = [...index.filter((k) => k !== key), key];
    while (next.length > MAX_ENTRIES) {
      const evicted = next.shift();
      if (evicted) localStorage.removeItem(KEY_PREFIX + evicted);
    }
    localStorage.setItem(INDEX_KEY, JSON.stringify(next));
  } catch (e) {
    console.error("setInterpretation failed", e);
  }
}
