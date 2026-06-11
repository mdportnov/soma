import type { Biomarker } from "../../src/db/schema";
import { normalizeLabel, similarity } from "../../src/lib/fuzzy";

/** Same thresholds as the in-app import mapper (src/ai/pipeline/map.ts). */
const FUZZY_ACCEPT = 0.86;
const FUZZY_CANDIDATE = 0.5;
const MAX_CANDIDATES = 8;

export type Candidate = { biomarker: Biomarker; score: number };

export type MatchResult =
  | { kind: "exact"; biomarker: Biomarker }
  | { kind: "fuzzy"; biomarker: Biomarker; score: number }
  | { kind: "ambiguous"; candidates: Candidate[] }
  | { kind: "none"; candidates: Candidate[] };

/**
 * Deterministic label → biomarker matching: normalize → exact canonical/alias
 * → fuzzy. No AI step here; ambiguity is returned to the caller instead of
 * being guessed, so the model has to confirm via search_biomarkers.
 */
export function matchBiomarker(label: string, dictionary: Biomarker[]): MatchResult {
  const norm = normalizeLabel(label);

  for (const bio of dictionary) {
    if (normalizeLabel(bio.canonicalName) === norm) return { kind: "exact", biomarker: bio };
    if (bio.aliases.some((a) => normalizeLabel(a) === norm)) {
      return { kind: "exact", biomarker: bio };
    }
  }

  const scored: Candidate[] = dictionary
    .map((bio) => {
      const best = Math.max(
        similarity(norm, normalizeLabel(bio.canonicalName)),
        ...bio.aliases.map((a) => similarity(norm, normalizeLabel(a))),
      );
      return { biomarker: bio, score: best };
    })
    .filter((c) => c.score >= FUZZY_CANDIDATE)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES);

  if (scored.length === 0) return { kind: "none", candidates: [] };

  const [top, second] = scored;
  if (top.score >= FUZZY_ACCEPT && (second === undefined || second.score < FUZZY_ACCEPT)) {
    return { kind: "fuzzy", biomarker: top.biomarker, score: top.score };
  }
  if (top.score >= FUZZY_ACCEPT) return { kind: "ambiguous", candidates: scored };
  return { kind: "none", candidates: scored };
}

export function describeCandidates(candidates: Candidate[]): string {
  if (candidates.length === 0) return "no candidates";
  return candidates
    .map((c) => `${c.biomarker.canonicalName} (id=${c.biomarker.id}, score=${c.score.toFixed(2)})`)
    .join("; ");
}
