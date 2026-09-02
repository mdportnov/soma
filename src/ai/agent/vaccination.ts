/**
 * Vaccination status for the agent's `get_vaccination_status` tool.
 *
 * Personalizes the WHO-derived calendar (`vaccine-schedule.ts`) against the
 * profile's birth date and recorded shots with exactly the same grading the
 * Vaccines page uses (`computeAntigen`, `isGradedTier`, `countActionable`), so
 * the assistant and the screen can never disagree about what is overdue.
 *
 * The distinction the app draws — and this module preserves — is between:
 *  - `overdue`: a genuinely actionable lapse (an adult booster past its
 *    interval once the series was started, or a lapsed certificate);
 *  - `not_recorded`: a childhood dose that was almost certainly given but never
 *    entered. Neutral: it is a data gap, not a missed vaccination;
 *  - `contextual`: travel/risk antigens, informational only.
 * Only the first is "you should act"; the rest are "you could record" or
 * "ask if it applies to you".
 */

import type { Vaccine } from "@/db/schema";
import {
  VACCINE_SCHEDULE,
  computeAntigen,
  isGradedTier,
  matchRecords,
  type AntigenView,
  type DoseStatus,
  type VaccineTier,
} from "@/lib/vaccine-schedule";

export type VaccinationInput = {
  today: string;
  birthDate: string | null;
  vaccines: Vaccine[];
};

export type VaccineRecordSummary = {
  ref: string;
  name: string;
  date: string;
  dose: number | null;
  manufacturer: string | null;
  expiresAt: string | null;
  /** True when the certificate validity has already passed. */
  lapsed: boolean;
};

export type AntigenSummary = {
  id: string;
  name: string;
  nameRu: string;
  disease: string;
  tier: VaccineTier;
  /** Whether age-based doses are graded for this tier (false = informational). */
  graded: boolean;
  overall: DoseStatus;
  doses: {
    label: string;
    recommendedAge: string;
    status: DoseStatus;
    doneDate?: string;
    dueDate?: string;
  }[];
  recurring: { label: string; everyYears: number; nextDate?: string; status: DoseStatus } | null;
  /** Recorded shots matched to this antigen, oldest first. */
  records: VaccineRecordSummary[];
};

export type VaccinationStatus = {
  today: string;
  birthDateKnown: boolean;
  /** What each status means — sent to the model so the words stay honest. */
  legend: Record<DoseStatus, string>;
  /** Genuinely actionable items only: overdue boosters and lapsed certificates. */
  actionable: {
    kind: "booster_overdue" | "certificate_lapsed";
    antigenId: string | null;
    label: string;
    /** Booster: the date it became due. Certificate: the expiry date. */
    date: string | null;
    ref: string | null;
  }[];
  due: AntigenSummary[];
  upcoming: AntigenSummary[];
  done: AntigenSummary[];
  /** Childhood doses never entered — a recording gap, not a lapse. */
  notRecorded: AntigenSummary[];
  contextual: AntigenSummary[];
  /** Recorded shots that match no calendar antigen (custom or unknown names). */
  unmatchedRecords: VaccineRecordSummary[];
  totalRecords: number;
};

const LEGEND: Record<DoseStatus, string> = {
  done: "A matching shot is recorded.",
  due: "Recommended around now; not yet recorded.",
  overdue:
    "Actionable lapse: an adult booster past its interval after the series was started, or a lapsed certificate. The only status that means 'act on this'.",
  upcoming: "Recommended later than today.",
  contextual:
    "Informational only: travel/risk antigens or no birth date on file. Whether it applies depends on plans and exposure.",
  not_recorded:
    "A childhood dose whose recommended age is long past and that was never entered. Almost certainly given; treat as a documentation gap, never as overdue.",
};

function toRecordSummary(v: Vaccine, today: string): VaccineRecordSummary {
  return {
    ref: `vaccine:${v.id}`,
    name: v.vaccineName,
    date: v.date,
    dose: v.dose,
    manufacturer: v.manufacturer,
    expiresAt: v.expiresAt,
    lapsed: v.expiresAt != null && v.expiresAt < today,
  };
}

function toAntigenSummary(view: AntigenView, records: Vaccine[], today: string): AntigenSummary {
  const matchedKeys = new Set(
    matchRecords(view.entry, records).map((r) => `${r.vaccineName}|${r.date}`),
  );
  return {
    id: view.entry.id,
    name: view.entry.name,
    nameRu: view.entry.nameRu,
    disease: view.entry.disease,
    tier: view.entry.tier,
    graded: isGradedTier(view.entry.tier),
    overall: view.overall,
    doses: view.doses.map((d, index) => ({
      label: d.label ?? `Dose ${index + 1}`,
      recommendedAge: d.ageLabel,
      status: d.status,
      doneDate: d.doneDate,
      dueDate: d.dueDate,
    })),
    recurring: view.recurring
      ? {
          label: view.recurring.label,
          everyYears: view.recurring.everyYears,
          nextDate: view.recurring.nextDate,
          status: view.recurring.status,
        }
      : null,
    records: records
      .filter((r) => matchedKeys.has(`${r.vaccineName}|${r.date}`))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => toRecordSummary(r, today)),
  };
}

export function buildVaccinationStatus(input: VaccinationInput): VaccinationStatus {
  const { today, birthDate, vaccines } = input;
  const views = VACCINE_SCHEDULE.map((entry) =>
    computeAntigen(entry, birthDate, vaccines, today, isGradedTier(entry.tier)),
  );
  const summaries = views.map((view) => toAntigenSummary(view, vaccines, today));

  const matched = new Set<number>();
  for (const view of views) {
    const keys = new Set(
      matchRecords(view.entry, vaccines).map((r) => `${r.vaccineName}|${r.date}`),
    );
    for (const v of vaccines) if (keys.has(`${v.vaccineName}|${v.date}`)) matched.add(v.id);
  }

  const actionable: VaccinationStatus["actionable"] = [];
  for (const s of summaries) {
    if (s.overall !== "overdue") continue;
    // The recurring booster is the only overdue source for adults; a dose-level
    // overdue (a lapsed teen booster) is reported with its due date instead.
    const lapsedDose = s.doses.find((d) => d.status === "overdue");
    const lastRecord = s.records[s.records.length - 1];
    actionable.push({
      kind: "booster_overdue",
      antigenId: s.id,
      label: s.name,
      date:
        s.recurring?.status === "overdue"
          ? previousBoosterDate(s.recurring.nextDate, s.recurring.everyYears)
          : (lapsedDose?.dueDate ?? null),
      ref: lastRecord?.ref ?? null,
    });
  }
  for (const v of vaccines) {
    if (v.expiresAt != null && v.expiresAt < today) {
      actionable.push({
        kind: "certificate_lapsed",
        antigenId: views.find((view) => matchRecords(view.entry, [v]).length)?.entry.id ?? null,
        label: v.vaccineName,
        date: v.expiresAt,
        ref: `vaccine:${v.id}`,
      });
    }
  }

  const bucket = (status: DoseStatus) => summaries.filter((s) => s.overall === status);
  return {
    today,
    birthDateKnown: birthDate != null,
    legend: LEGEND,
    actionable,
    due: bucket("due"),
    upcoming: bucket("upcoming"),
    done: bucket("done"),
    notRecorded: bucket("not_recorded"),
    contextual: bucket("contextual"),
    unmatchedRecords: vaccines
      .filter((v) => !matched.has(v.id))
      .map((v) => toRecordSummary(v, today)),
    totalRecords: vaccines.length,
  };
}

/** The booster date that was missed: one interval before the next scheduled one. */
function previousBoosterDate(nextDate: string | undefined, everyYears: number): string | null {
  if (!nextDate) return null;
  const d = new Date(`${nextDate}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - everyYears);
  return d.toISOString().slice(0, 10);
}
