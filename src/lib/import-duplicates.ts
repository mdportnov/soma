/**
 * Re-import detection.
 *
 * The import wizard de-duplicates rows WITHIN one document, but nothing stops
 * the same PDF from being imported twice: the second run creates a second panel
 * with the same values, and every biomarker trend grows a doubled point that
 * looks like a real repeat measurement. This module decides whether an incoming
 * record already exists in the profile; the wizard shows the answer and the user
 * decides — a duplicate is never rejected silently, because two draws on one day
 * from two labs are perfectly normal.
 *
 * Pure by design: the repository does the querying, this file does the judging,
 * so the rules can be tested without a database.
 */

/** How strongly the incoming record looks like something already stored. */
export type DuplicateConfidence = "likely" | "possible";

/** A stored panel reduced to what duplicate detection needs. */
export type PanelCandidate = {
  id: number;
  date: string;
  labName: string | null;
  /** Biomarker ids measured by the panel; duplicates within it are ignored. */
  biomarkerIds: number[];
};

export type IncomingPanel = {
  date: string;
  labName: string | null;
  biomarkerIds: number[];
};

export type PanelDuplicate = {
  panelId: number;
  date: string;
  labName: string | null;
  /** Both panels name the same lab (a missing name on either side is not a match). */
  sameLab: boolean;
  /** How many of the incoming biomarkers the stored panel already has. */
  sharedBiomarkers: number;
  /** sharedBiomarkers / distinct incoming biomarkers; 0 when nothing to compare. */
  overlapRatio: number;
  confidence: DuplicateConfidence;
};

/** Calendar day of an ISO date or datetime — panels are compared per day. */
export function isoDay(value: string): string {
  return value.slice(0, 10);
}

/** Case- and spacing-insensitive comparison key; empty for a blank name. */
export function nameKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** A repeat measurement is only plausible as a duplicate on the same day. */
const LIKELY_OVERLAP = 0.6;
const POSSIBLE_OVERLAP = 0.25;

/**
 * Panels of the same profile that the incoming one may be a re-import of.
 *
 * Same calendar day is a hard precondition — a panel drawn on another date is a
 * new data point, however similar its contents. Beyond that the signal is the
 * share of incoming biomarkers the stored panel already contains: a full
 * re-import overlaps completely, while a genuinely different panel drawn the
 * same day (say a urine panel next to a blood one) barely overlaps at all. A
 * differing lab name downgrades the verdict instead of dismissing it, because
 * the same report imported twice can be read with a different lab name the
 * second time.
 */
export function findDuplicatePanels(
  incoming: IncomingPanel,
  existing: PanelCandidate[],
): PanelDuplicate[] {
  const day = isoDay(incoming.date);
  const incomingIds = new Set(incoming.biomarkerIds);
  const incomingLab = nameKey(incoming.labName);
  const matches: PanelDuplicate[] = [];

  for (const candidate of existing) {
    if (isoDay(candidate.date) !== day) continue;
    const candidateLab = nameKey(candidate.labName);
    const sameLab = incomingLab !== "" && incomingLab === candidateLab;
    // An unnamed lab on either side is unknown, not different — it must not
    // count as evidence against a duplicate.
    const labConflict = incomingLab !== "" && candidateLab !== "" && incomingLab !== candidateLab;
    const candidateIds = new Set(candidate.biomarkerIds);
    let shared = 0;
    for (const id of incomingIds) if (candidateIds.has(id)) shared += 1;
    const overlapRatio = incomingIds.size ? shared / incomingIds.size : 0;

    let confidence: DuplicateConfidence | null = null;
    if (incomingIds.size === 0) {
      // A findings-only document has no biomarkers to compare; the day plus a
      // matching lab is the whole signal, and it is never more than "possible".
      if (sameLab) confidence = "possible";
    } else if (overlapRatio >= LIKELY_OVERLAP) {
      confidence = labConflict ? "possible" : "likely";
    } else if (overlapRatio >= POSSIBLE_OVERLAP) {
      confidence = "possible";
    }
    if (!confidence) continue;

    matches.push({
      panelId: candidate.id,
      date: candidate.date,
      labName: candidate.labName,
      sameLab,
      sharedBiomarkers: shared,
      overlapRatio,
      confidence,
    });
  }

  return matches.sort(
    (a, b) => b.overlapRatio - a.overlapRatio || b.sharedBiomarkers - a.sharedBiomarkers,
  );
}

/** A stored single-row record (vaccine dose, imaging study) to compare against. */
export type RecordCandidate = { id: number; date: string; name: string };

export type RecordDuplicate = RecordCandidate & { confidence: DuplicateConfidence };

/**
 * Same-day records whose name matches the incoming one. Used for the row-level
 * `duplicate` flag the vaccine and imaging review screens show, the same way the
 * allergy and prescription importers already flag a name they know.
 *
 * Name equality on the same day is "likely"; a name that merely contains the
 * other (an abbreviated antigen, a body area written longer) is "possible".
 */
export function findDuplicateRecords(
  incoming: { date: string | null; name: string },
  existing: RecordCandidate[],
): RecordDuplicate[] {
  const key = nameKey(incoming.name);
  if (!key || !incoming.date) return [];
  const day = isoDay(incoming.date);
  const matches: RecordDuplicate[] = [];
  for (const candidate of existing) {
    if (isoDay(candidate.date) !== day) continue;
    const candidateKey = nameKey(candidate.name);
    if (!candidateKey) continue;
    if (candidateKey === key) {
      matches.push({ ...candidate, confidence: "likely" });
    } else if (candidateKey.includes(key) || key.includes(candidateKey)) {
      matches.push({ ...candidate, confidence: "possible" });
    }
  }
  return matches;
}
