/**
 * Drug-allergy safety guard. Given a medication/drug name and the user's
 * allergies, returns any active `drug` allergy the name plausibly hits — so the
 * UI can warn before a contraindicated drug is saved.
 *
 * Two layers:
 *  1. A curated drug-class knowledge base. Brand and generic names rarely match
 *     verbatim ("Augmentin" vs "amoxicillin"), and a penicillin allergy should
 *     also warn against a cephalosporin (~10% beta-lactam cross-reactivity), so
 *     each member carries shared class tags. Terms are spelled in both Latin and
 *     Cyrillic, so "пенициллин" and "amoxicillin" resolve to the same class
 *     without transliteration — the exact case the previous matcher missed.
 *  2. A fuzzy/substring fallback for free-text allergens the table doesn't know.
 *
 * We err toward surfacing a warning — a false positive the user dismisses is far
 * cheaper than a missed contraindication — but the fallback is bounded so a
 * 1–2 character allergen ("a") can't match every drug and drown real warnings.
 */
import type { Allergy } from "@/db/schema";
import { normalizeLabel, similarity } from "@/lib/fuzzy";

/** Trigram-similarity threshold above which two distinct tokens are "the same drug". */
const FUZZY_THRESHOLD = 0.7;
/** Tokens shorter than this only match exactly — fuzzy on 2-3 chars is all noise. */
const MIN_FUZZY_LEN = 4;
/** Substring matching below this length is noise ("a" inside every drug). */
const MIN_SUBSTRING_LEN = 3;
/** Above this similarity a token is treated as the same drug-class member. */
const CLASS_TERM_THRESHOLD = 0.82;
/** Only fuzzy-/prefix-match class terms at least this long (avoid "asa", "mig"). */
const CLASS_TERM_MIN_LEN = 5;

/**
 * Curated drug-class knowledge base. Each group lists the class tags its members
 * share and the member spellings (EN + RU). Penicillins and cephalosporins both
 * carry `beta-lactam`, so a penicillin allergy warns against a cephalosporin.
 * Terms are matched after `normalizeLabel`, the same normalization inputs get.
 */
type DrugGroup = { tags: string[]; terms: string[] };

const DRUG_GROUPS: DrugGroup[] = [
  {
    tags: ["penicillin", "beta-lactam"],
    terms: [
      "penicillin",
      "benzylpenicillin",
      "phenoxymethylpenicillin",
      "amoxicillin",
      "ampicillin",
      "augmentin",
      "amoxiclav",
      "amoxicillin clavulanate",
      "flemoxin",
      "ospamox",
      "oxacillin",
      "cloxacillin",
      "piperacillin",
      "ampiox",
      "пенициллин",
      "бензилпенициллин",
      "амоксициллин",
      "ампициллин",
      "аугментин",
      "амоксиклав",
      "флемоксин",
      "оспамокс",
      "оксациллин",
      "ампиокс",
    ],
  },
  {
    tags: ["cephalosporin", "beta-lactam"],
    terms: [
      "cephalexin",
      "cefalexin",
      "keflex",
      "cefazolin",
      "ceftriaxone",
      "cefuroxime",
      "cefixime",
      "suprax",
      "cefepime",
      "cefotaxime",
      "ceftazidime",
      "cefaclor",
      "цефалексин",
      "цефазолин",
      "цефтриаксон",
      "цефуроксим",
      "цефиксим",
      "супракс",
      "цефепим",
      "цефотаксим",
      "цефтазидим",
    ],
  },
  {
    tags: ["sulfonamide"],
    terms: [
      "sulfonamide",
      "sulphonamide",
      "sulfamethoxazole",
      "co-trimoxazole",
      "cotrimoxazole",
      "trimethoprim",
      "bactrim",
      "biseptol",
      "sulfasalazine",
      "sulfadiazine",
      "sulfacetamide",
      "сульфаниламид",
      "сульфаметоксазол",
      "котримоксазол",
      "триметоприм",
      "бактрим",
      "бисептол",
      "сульфасалазин",
      "сульфадиазин",
    ],
  },
  {
    tags: ["nsaid"],
    terms: [
      "nsaid",
      "ibuprofen",
      "nurofen",
      "advil",
      "naproxen",
      "diclofenac",
      "voltaren",
      "ketoprofen",
      "ketorolac",
      "ketanov",
      "ketonal",
      "aspirin",
      "acetylsalicylic",
      "acetylsalicylic acid",
      "nimesulide",
      "nise",
      "nimesil",
      "meloxicam",
      "movalis",
      "indomethacin",
      "celecoxib",
      "etoricoxib",
      "нпвс",
      "ибупрофен",
      "нурофен",
      "напроксен",
      "диклофенак",
      "вольтарен",
      "кетопрофен",
      "кеторолак",
      "кеторол",
      "кетанов",
      "кетонал",
      "аспирин",
      "ацетилсалициловая",
      "ацетилсалициловая кислота",
      "нимесулид",
      "найз",
      "нимесил",
      "мелоксикам",
      "мовалис",
      "индометацин",
      "целекоксиб",
    ],
  },
  {
    tags: ["paracetamol"],
    terms: [
      "paracetamol",
      "acetaminophen",
      "tylenol",
      "panadol",
      "perfalgan",
      "efferalgan",
      "парацетамол",
      "ацетаминофен",
      "панадол",
      "перфалган",
      "эффералган",
    ],
  },
  {
    tags: ["macrolide"],
    terms: [
      "macrolide",
      "azithromycin",
      "sumamed",
      "azitrox",
      "erythromycin",
      "clarithromycin",
      "klacid",
      "roxithromycin",
      "josamycin",
      "vilprafen",
      "макролид",
      "азитромицин",
      "сумамед",
      "эритромицин",
      "кларитромицин",
      "клацид",
      "рокситромицин",
      "джозамицин",
      "вильпрафен",
    ],
  },
  {
    tags: ["fluoroquinolone"],
    terms: [
      "fluoroquinolone",
      "quinolone",
      "ciprofloxacin",
      "cifran",
      "levofloxacin",
      "ofloxacin",
      "moxifloxacin",
      "norfloxacin",
      "tavanic",
      "фторхинолон",
      "хинолон",
      "ципрофлоксацин",
      "цифран",
      "левофлоксацин",
      "офлоксацин",
      "моксифлоксацин",
      "норфлоксацин",
    ],
  },
  {
    tags: ["tetracycline"],
    terms: [
      "tetracycline",
      "doxycycline",
      "unidox",
      "minocycline",
      "тетрациклин",
      "доксициклин",
      "юнидокс",
      "миноциклин",
    ],
  },
  {
    tags: ["aminoglycoside"],
    terms: [
      "aminoglycoside",
      "gentamicin",
      "amikacin",
      "streptomycin",
      "tobramycin",
      "neomycin",
      "kanamycin",
      "аминогликозид",
      "гентамицин",
      "амикацин",
      "стрептомицин",
      "тобрамицин",
      "неомицин",
      "канамицин",
    ],
  },
];

function tokens(s: string): string[] {
  return s.split(" ").filter((w) => w.length > 0);
}

/** True when a knowledge-base `term` appears in the normalized name / its tokens. */
function termHits(term: string, norm: string, toks: string[]): boolean {
  // Multi-word term ("amoxicillin clavulanate"): substring against the whole name.
  if (term.includes(" ")) return norm.includes(term);
  for (const tok of toks) {
    if (tok === term) return true;
    if (
      term.length >= CLASS_TERM_MIN_LEN &&
      tok.length >= CLASS_TERM_MIN_LEN &&
      (tok.startsWith(term) ||
        term.startsWith(tok) ||
        similarity(tok, term) >= CLASS_TERM_THRESHOLD)
    ) {
      return true;
    }
  }
  return false;
}

/** Drug-class tags implied by a drug/allergen name via the knowledge base. */
function classTags(name: string): Set<string> {
  const norm = normalizeLabel(name);
  const tags = new Set<string>();
  if (!norm) return tags;
  const toks = tokens(norm);
  for (const group of DRUG_GROUPS) {
    if (group.terms.some((term) => termHits(term, norm, toks))) {
      for (const tag of group.tags) tags.add(tag);
    }
  }
  return tags;
}

/** True when any token of the drug name matches any token of the allergen. */
function namesMatch(drug: string, allergen: string): boolean {
  const drugNorm = normalizeLabel(drug);
  const allergenNorm = normalizeLabel(allergen);
  if (!drugNorm || !allergenNorm) return false;

  // 1. Shared drug class — catches brand↔generic, cross-reactivity, and EN↔RU.
  const drugTags = classTags(drug);
  if (drugTags.size) {
    for (const tag of classTags(allergen)) if (drugTags.has(tag)) return true;
  }

  // 2. Whole-string containment — covers verbatim spellings cheaply. Guarded so a
  //    stray 1-2 char allergen can't be "contained" in every drug name.
  if (allergenNorm.length >= MIN_SUBSTRING_LEN && drugNorm.includes(allergenNorm)) return true;
  if (drugNorm.length >= MIN_SUBSTRING_LEN && allergenNorm.includes(drugNorm)) return true;

  // 3. Token-level exact / bounded-substring / fuzzy fallback.
  const drugTokens = tokens(drugNorm);
  const allergenTokens = tokens(allergenNorm);
  for (const dt of drugTokens) {
    for (const at of allergenTokens) {
      if (dt === at) return true;
      if (
        dt.length >= MIN_SUBSTRING_LEN &&
        at.length >= MIN_SUBSTRING_LEN &&
        (dt.includes(at) || at.includes(dt))
      ) {
        return true;
      }
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
