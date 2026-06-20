/**
 * Drug-allergy safety guard. Given a medication/drug name and the user's
 * allergies, returns any active `drug` allergy the name plausibly hits — so the
 * UI can warn before a contraindicated drug is saved.
 *
 * Matching is fuzzy and substring-based, not a dictionary lookup: allergen names
 * are free text and vary across languages, and brand/generic names rarely match
 * verbatim ("Augmentin" vs "amoxicillin", "пенициллин" vs "penicillin"). We err
 * toward surfacing a warning — a false positive the user dismisses is far
 * cheaper than a missed contraindication.
 */
import type { Allergy } from "@/db/schema";
import { normalizeLabel, similarity } from "@/lib/fuzzy";

/** Trigram-similarity threshold above which two distinct tokens are "the same drug". */
const FUZZY_THRESHOLD = 0.7;
/** Tokens shorter than this only match exactly — fuzzy on 2-3 chars is all noise. */
const MIN_FUZZY_LEN = 4;

function tokens(s: string): string[] {
  return normalizeLabel(s)
    .split(" ")
    .filter((w) => w.length > 0);
}

/** True when any token of the drug name matches any token of the allergen. */
function namesMatch(drug: string, allergen: string): boolean {
  const drugNorm = normalizeLabel(drug);
  const allergenNorm = normalizeLabel(allergen);
  if (!drugNorm || !allergenNorm) return false;
  // Whole-string containment first — cheapest and covers most real cases.
  if (drugNorm.includes(allergenNorm) || allergenNorm.includes(drugNorm)) return true;

  const drugTokens = tokens(drug);
  const allergenTokens = tokens(allergen);
  for (const dt of drugTokens) {
    for (const at of allergenTokens) {
      if (dt === at) return true;
      if (dt.includes(at) || at.includes(dt)) return true;
      if (
        dt.length >= MIN_FUZZY_LEN &&
        at.length >= MIN_FUZZY_LEN &&
        similarity(dt, at) >= FUZZY_THRESHOLD
      ) {
        return true;
      }
    }
  }
  return false;
}

const SEVERITY_RANK = { mild: 0, moderate: 1, severe: 2, anaphylactic: 3 } as const;

/**
 * Active drug allergies the given name matches, most severe first. Empty when
 * the name is blank or nothing matches.
 */
export function matchDrugAllergies(drugName: string, allergies: Allergy[]): Allergy[] {
  const name = drugName.trim();
  if (!name) return [];
  return allergies
    .filter((a) => a.status === "active" && a.category === "drug" && namesMatch(name, a.allergen))
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}
