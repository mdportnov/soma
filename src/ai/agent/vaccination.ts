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
  antigenIdsOf,
  isSuperseded,
  matchRecords,
  vaccineReminders,
  type VaccineReminder,
  type AntigenView,
  type DoseStatus,
  type VaccineTier,
} from "@/lib/vaccine-schedule";

export type VaccinationInput = {
  today: string;
  birthDate: string | null;
  vaccines: Vaccine[];
  /** Reminder keys the user hid (profile `uiPrefs.vaccineRemindersHidden`). */
  hiddenReminders?: string[];
};

export type VaccineRecordSummary = {
  ref: string;
  name: string;
  date: string;
  dose: number | null;
  manufacturer: string | null;
  /** Antigen ids this shot covers (e.g. Td/Tdap/АДС-М → "dtp"). */
  antigens: string[];
  country: string | null;
  /** Free-text notes; imported shots keep the printed product name here. */
  notes: string | null;
  expiresAt: string | null;
  /** True when the certificate validity has passed and no later shot renewed it. */
  lapsed: boolean;
  /** True when a later shot of the same vaccine replaced this one. */
  superseded: boolean;
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
  /** The user hid this antigen's reminder: don't raise it unprompted. */
  reminderHidden: boolean;
  doses: {
    label: string;
    recommendedAge: string;
    status: DoseStatus;
    doneDate?: string;
    dueDate?: string;
  }[];
  recurring: {
    label: string;
    everyYears: number;
    /** Most recent matching shot — the booster clock runs from it. */
    lastDate?: string;
    /** Next booster date; in the past when overdue/due. */
    nextDate?: string;
    status: DoseStatus;
  } | null;
  /** Recorded shots matched to this antigen, oldest first. */
  records: VaccineRecordSummary[];
};

export type VaccinationStatus = {
  today: string;
  birthDateKnown: boolean;
  /** What each status means — sent to the model so the words stay honest. */
  legend: Record<DoseStatus, string>;
  /** Genuinely actionable items only: overdue boosters/doses and lapsed certificates. */
  actionable: ReminderSummary[];
  /** Quieter "around now" items: a started course's next dose, this season's flu shot. */
  dueNow: ReminderSummary[];
  /**
   * Reminders the user deliberately hid. Not to be raised unprompted; if asked,
   * say they are hidden and can be shown again on the Vaccines page.
   */
  hiddenByUser: ReminderSummary[];
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

export type ReminderSummary = {
  kind: "booster_overdue" | "booster_due" | "dose_overdue" | "dose_due" | "certificate_lapsed";
  antigenId: string | null;
  label: string;
  /** Booster/dose: the date it became due. Certificate: the expiry date. */
  date: string | null;
  /** Most recent matching shot. */
  lastDate: string | null;
  /** The record to cite: the lapsed certificate, or the antigen's latest shot. */
  ref: string | null;
};

const LEGEND: Record<DoseStatus, string> = {
  done: "A matching shot is recorded.",
  due: "Recommended around now; not yet recorded (e.g. the next dose of a started course, or this season's flu shot).",
  overdue:
    "Actionable lapse: a booster whose interval since the most recent recorded shot has passed, a started course whose next dose is more than a month late, or a lapsed certificate that no later shot renewed. The only status that means 'act on this'.",
  upcoming: "Recommended later than today.",
  contextual:
    "Informational only: travel/risk antigens or no birth date on file. Whether it applies depends on plans and exposure.",
  not_recorded:
    "A childhood dose whose recommended age is long past and that was never entered. Almost certainly given; treat as a documentation gap, never as overdue.",
};

function toRecordSummary(v: Vaccine, all: Vaccine[], today: string): VaccineRecordSummary {
  const superseded = isSuperseded(v, all);
  return {
    ref: `vaccine:${v.id}`,
    name: v.vaccineName,
    date: v.date,
    dose: v.dose,
    manufacturer: v.manufacturer,
    antigens: antigenIdsOf(v),
    country: v.country,
    notes: v.notes,
    expiresAt: v.expiresAt,
    lapsed: v.expiresAt != null && v.expiresAt < today && !superseded,
    superseded,
  };
}

function toAntigenSummary(
  view: AntigenView,
  records: Vaccine[],
  today: string,
  reminderHidden: boolean,
): AntigenSummary {
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
    reminderHidden,
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
          lastDate: view.recurring.lastDate,
          nextDate: view.recurring.nextDate,
          status: view.recurring.status,
        }
      : null,
    records: records
      .filter((r) => matchedKeys.has(`${r.vaccineName}|${r.date}`))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => toRecordSummary(r, records, today)),
  };
}

export function buildVaccinationStatus(input: VaccinationInput): VaccinationStatus {
  const { today, birthDate, vaccines } = input;
  const views = VACCINE_SCHEDULE.map((entry) =>
    computeAntigen(entry, birthDate, vaccines, today, isGradedTier(entry.tier)),
  );
  const reminders = vaccineReminders(views, vaccines, today, input.hiddenReminders);
  const activeAntigens = new Set(reminders.filter((r) => !r.hidden).map((r) => r.antigenId));
  const hiddenAntigens = new Set(
    reminders.filter((r) => r.hidden && !activeAntigens.has(r.antigenId)).map((r) => r.antigenId),
  );
  const summaries = views.map((view) =>
    toAntigenSummary(view, vaccines, today, hiddenAntigens.has(view.entry.id)),
  );

  const matched = new Set<number>();
  for (const view of views) for (const v of matchRecords(view.entry, vaccines)) matched.add(v.id);

  const toReminder = (r: VaccineReminder): ReminderSummary => {
    const latest = r.antigenId
      ? summaries.find((s) => s.id === r.antigenId)?.records.at(-1)
      : undefined;
    const certificate = r.record as Vaccine | undefined;
    return {
      kind: r.kind === "certificate" ? "certificate_lapsed" : `${r.kind}_${r.status}`,
      antigenId: r.antigenId,
      label: r.label ? `${r.name}: ${r.label}` : r.name,
      date: r.date,
      lastDate: r.lastDate,
      ref: certificate?.id != null ? `vaccine:${certificate.id}` : (latest?.ref ?? null),
    };
  };
  const active = reminders.filter((r) => !r.hidden);

  // An antigen whose reminder the user hid leaves the due/overdue buckets: it
  // is reported once, under `hiddenByUser`, and nowhere as something to act on.
  const bucket = (status: DoseStatus) =>
    summaries.filter((s) => s.overall === status && !s.reminderHidden);
  return {
    today,
    birthDateKnown: birthDate != null,
    legend: LEGEND,
    actionable: active.filter((r) => r.status === "overdue").map(toReminder),
    dueNow: active.filter((r) => r.status === "due").map(toReminder),
    hiddenByUser: reminders.filter((r) => r.hidden).map(toReminder),
    due: bucket("due"),
    upcoming: bucket("upcoming"),
    done: bucket("done"),
    notRecorded: bucket("not_recorded"),
    contextual: bucket("contextual"),
    unmatchedRecords: vaccines
      .filter((v) => !matched.has(v.id))
      .map((v) => toRecordSummary(v, vaccines, today)),
    totalRecords: vaccines.length,
  };
}
