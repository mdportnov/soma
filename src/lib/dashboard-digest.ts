import type { Allergy, Diagnosis, Medication } from "@/db/schema";
import type { PanelChange } from "@/db/repos";
import type { ChangeSeverity } from "@/lib/insights";

/**
 * Dashboard digest — the "am I OK / what needs my attention" derivation layer.
 *
 * Pure and deterministic: it takes already-fetched data (so the page stays a thin
 * fetch + render shell) and folds it into a prioritized verdict. No DB, no clock
 * beyond the `today` the caller passes in, fully testable.
 */

/** Overall traffic-light read shown in the verdict header. */
export type VerdictStatus = "calm" | "attention";

/** Each attention item knows its kind, how loud it is, and where it links. */
export type AttentionType = "biomarker" | "diagnosis" | "medication" | "vaccine" | "review";

export type AttentionItem = {
  type: AttentionType;
  /** alert outranks watch outranks info — drives ordering within a type. */
  severity: ChangeSeverity;
  /** Already-localized label rendered as the row headline. */
  label: string;
  /** In-app route the row links to. */
  route: string;
  /** Number of underlying records folded into this row (for the count badge). */
  count: number;
};

export type DashboardDigest = {
  status: VerdictStatus;
  /** Active allergies of severity severe/anaphylactic — the always-on safety banner. */
  severeAllergies: Allergy[];
  /** Prioritized rows: biomarker shifts first, then diagnoses, meds, review queue. */
  attention: AttentionItem[];
  /** Total attention rows — drives the verdict sentence count. */
  attentionCount: number;
};

const SEVERITY_RANK: Record<ChangeSeverity, number> = { info: 0, watch: 1, alert: 2 };
const TYPE_RANK: Record<AttentionType, number> = {
  biomarker: 0,
  diagnosis: 1,
  medication: 2,
  vaccine: 3,
  review: 4,
};

/** Days between two YYYY-MM-DD dates; positive when `to` is after `from`. */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
  return Math.round((b - a) / 86_400_000);
}

/** Labels are resolved by the caller, so the module stays UI-agnostic. */
export type DigestLabels = {
  biomarkers: (count: number) => string;
  diagnoses: (count: number, names: string) => string;
  medicationsEnding: (count: number, names: string) => string;
  vaccines: (count: number) => string;
  review: (count: number) => string;
};

export type DigestInput = {
  today: string;
  latestChanges: { changes: PanelChange[] } | null;
  diagnoses: Diagnosis[];
  medications: Medication[];
  allergies: Allergy[];
  reviewCount: number;
  /** Window (in days from today) within which an ending medication is "soon". */
  medsEndingWithinDays?: number;
  /** Genuinely actionable vaccines (overdue adult boosters + lapsed certificates),
   *  precomputed by the caller so this module stays free of schedule logic. */
  vaccineActionable?: number;
};

const SEVERE_ALLERGY = new Set(["severe", "anaphylactic"]);

export function buildDashboardDigest(input: DigestInput, labels: DigestLabels): DashboardDigest {
  const { today, latestChanges, diagnoses, medications, allergies, reviewCount } = input;
  const endingWindow = input.medsEndingWithinDays ?? 14;

  const severeAllergies = allergies.filter(
    (a) => a.status === "active" && SEVERE_ALLERGY.has(a.severity),
  );

  const attention: AttentionItem[] = [];

  // Biomarkers that worsened / went out of range — one row, severity = strongest
  // notable shift, count = how many such shifts the latest panel introduced.
  const worsened = (latestChanges?.changes ?? []).filter(
    (c) => c.change?.notable && c.change.trajectory === "worsened",
  );
  if (worsened.length) {
    const severity = worsened.reduce<ChangeSeverity>(
      (acc, c) =>
        SEVERITY_RANK[c.change!.severity] > SEVERITY_RANK[acc] ? c.change!.severity : acc,
      "info",
    );
    attention.push({
      type: "biomarker",
      severity,
      label: labels.biomarkers(worsened.length),
      route: "/labs",
      count: worsened.length,
    });
  }

  // Active diagnoses — names listed, capped so the row stays one line.
  const activeDx = diagnoses.filter((d) => d.status === "active");
  if (activeDx.length) {
    const names = activeDx.map((d) => d.name).join(", ");
    attention.push({
      type: "diagnosis",
      severity: "watch",
      label: labels.diagnoses(activeDx.length, names),
      route: "/diagnoses",
      count: activeDx.length,
    });
  }

  // Medications ending within the window (today..today+window), still ongoing
  // courses that have a planned end date — a refill / review nudge.
  const endingSoon = medications.filter((m) => {
    if (!m.endDate) return false;
    const d = daysBetween(today, m.endDate);
    return d >= 0 && d <= endingWindow;
  });
  if (endingSoon.length) {
    const names = endingSoon.map((m) => m.name).join(", ");
    attention.push({
      type: "medication",
      severity: "watch",
      label: labels.medicationsEnding(endingSoon.length, names),
      route: "/medications",
      count: endingSoon.length,
    });
  }

  // Panels still awaiting verification of uncertain AI mappings.
  if (reviewCount > 0) {
    attention.push({
      type: "review",
      severity: "info",
      label: labels.review(reviewCount),
      route: "/labs",
      count: reviewCount,
    });
  }

  // Vaccines genuinely needing action — overdue adult boosters and lapsed
  // certificates only; unrecorded childhood doses never reach this count.
  const vaccineActionable = input.vaccineActionable ?? 0;
  if (vaccineActionable > 0) {
    attention.push({
      type: "vaccine",
      severity: "watch",
      label: labels.vaccines(vaccineActionable),
      route: "/vaccines",
      count: vaccineActionable,
    });
  }

  attention.sort((a, b) => {
    const byType = TYPE_RANK[a.type] - TYPE_RANK[b.type];
    if (byType !== 0) return byType;
    return SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
  });

  return {
    status: attention.length ? "attention" : "calm",
    severeAllergies,
    attention,
    attentionCount: attention.length,
  };
}
