/**
 * Health review — the deterministic "what deserves attention" layer behind the
 * agent's `get_health_overview` and `get_changes_since` tools.
 *
 * The model is good at explaining and bad at bookkeeping: left alone it would
 * need a dozen tool calls to find the out-of-range markers, compare each with
 * its previous reading, check which medications overlap, notice what was never
 * re-tested and remember the allergies. This module does that bookkeeping in
 * one pass over already-fetched rows so the model only has to interpret. It is
 * pure — no DB, no clock beyond `today` — and reuses the same classification
 * the UI shows (`analyzeChange`, `resolveRange`, `bpStage`, `retestDueDate`,
 * `matchDrugAllergies`), so the assistant never disagrees with the screens.
 *
 * Every entry carries a `ref` in the `[record:entity:id]` vocabulary so the
 * answer can cite the exact row it relies on.
 */

import type {
  Allergy,
  Biomarker,
  BpLog,
  Diagnosis,
  Medication,
  Profile,
  RetestSchedule,
  SymptomLog,
  Vaccine,
  Visit,
  WeightLog,
} from "@/db/schema";
import {
  changeBetween,
  type BiomarkerChange,
  type ChangeSeverity,
  type ValuePoint,
} from "@/lib/insights";
import { matchDrugAllergies } from "@/lib/drug-allergy";
import { retestDueDate } from "@/lib/notifications";
import { ageYearsFrom, resolveRange, type DemographicRange } from "@/lib/units";
import { bpStage, type BpStage } from "@/lib/vitals";

/** One stored lab result joined with its panel — the raw material of the review. */
export type ReviewResultRow = {
  resultId: number;
  biomarkerId: number;
  panelId: number;
  date: string;
  labName: string | null;
  value: number;
  unit: string;
  valueNormalized: number | null;
  unitNormalized: string | null;
  outOfRange: boolean;
  flag: "low" | "high" | "critical" | null;
};

export type ReviewInput = {
  today: string;
  profile: Pick<Profile, "birthDate" | "sex" | "pregnancyStatus" | "targetWeightKg"> | null;
  biomarkers: Biomarker[];
  /** Demographic range overrides keyed by biomarker id (see `resolveRange`). */
  ranges: Map<number, DemographicRange[]>;
  /** Every lab result of the profile, any order. */
  results: ReviewResultRow[];
  medications: Medication[];
  diagnoses: Diagnosis[];
  allergies: Allergy[];
  retestSchedules: RetestSchedule[];
  bpLog: BpLog[];
  weightLog: WeightLog[];
  symptoms: SymptomLog[];
  visits: Visit[];
  vaccines: Vaccine[];
  imagingCount: number;
  healthNoteCount: number;
};

/** A marker's latest reading with everything needed to judge it. */
export type MarkerFinding = {
  biomarker: {
    id: number;
    name: string;
    unit: string;
    direction: Biomarker["direction"];
    ref: string;
  };
  latest: {
    value: number;
    unit: string;
    date: string;
    flag: ReviewResultRow["flag"];
    outOfRange: boolean;
    /** Days between the reading and `today`. */
    ageDays: number;
    labName: string | null;
    panelRef: string;
    resultRef: string;
  };
  /** Range in effect for this profile (sex/age-specific when defined). */
  range: {
    refLow: number | null;
    refHigh: number | null;
    optimalLow: number | null;
    optimalHigh: number | null;
  };
  /** Whether the latest value sits outside the optimal band while inside the reference range. */
  suboptimal: boolean;
  previous: {
    value: number;
    unit: string;
    date: string;
    flag: ReviewResultRow["flag"];
    panelRef: string;
  } | null;
  change: BiomarkerChange | null;
  /** Number of readings on file for this marker. */
  readings: number;
  /** Medications (name) whose intake period covers the latest reading's date. */
  medicationsAtReading: string[];
};

export type StaleMarker = {
  biomarker: { id: number; name: string; ref: string };
  lastDate: string;
  ageDays: number;
  /** Why it is worth re-checking: it was out of range the last time it was measured. */
  lastFlag: ReviewResultRow["flag"];
  lastValue: number;
  unit: string;
};

export type RetestStatus = "overdue" | "due_soon" | "scheduled" | "unanchored";

export type RetestFinding = {
  ref: string;
  label: string;
  biomarkerId: number | null;
  intervalMonths: number;
  lastTestedDate: string | null;
  dueDate: string | null;
  /** Positive = overdue by N days; negative = due in N days; null when unanchored. */
  overdueDays: number | null;
  status: RetestStatus;
};

export type MedicationFinding = {
  ref: string;
  name: string;
  type: Medication["type"];
  dose: string | null;
  asNeeded: boolean;
  startDate: string;
  endDate: string | null;
  /** Days on the course as of today (null for a future start). */
  daysOn: number | null;
  /** Days until the planned end, when one is set and still ahead. */
  endsInDays: number | null;
  purpose: string | null;
  /** Active drug allergies whose allergen matches this medication's name. */
  allergyConflicts: { ref: string; allergen: string; severity: Allergy["severity"] }[];
};

export type HealthReview = {
  today: string;
  coverage: {
    labPanels: { count: number; firstDate: string | null; lastDate: string | null };
    biomarkersTracked: number;
    medications: { total: number; active: number };
    diagnoses: { total: number; active: number };
    allergies: { active: number };
    vaccines: { count: number; lastDate: string | null };
    visits: { count: number; lastDate: string | null };
    bloodPressure: { count: number; lastDate: string | null };
    weight: { count: number; lastDate: string | null };
    symptoms: { count: number; lastDate: string | null };
    imaging: number;
    healthNotes: number;
  };
  safety: {
    ageYears: number | null;
    sex: Profile["sex"] | null;
    pregnancyStatus: Profile["pregnancyStatus"] | null;
    allergies: {
      ref: string;
      allergen: string;
      category: Allergy["category"];
      severity: Allergy["severity"];
      reaction: string | null;
    }[];
    activeDiagnoses: { ref: string; name: string; icdCode: string | null; since: string }[];
  };
  labs: {
    outOfRange: MarkerFinding[];
    /** Latest-vs-previous moves the UI would flag as notable, worsened or improved. */
    notableChanges: MarkerFinding[];
    /** Inside the reference range but outside the optimal band. */
    suboptimal: MarkerFinding[];
    /** Was abnormal when last measured and has not been re-measured for a long time. */
    stale: StaleMarker[];
    lastPanel: {
      ref: string;
      date: string;
      labName: string | null;
      results: number;
      outOfRange: number;
      ageDays: number;
    } | null;
    /** Markers dropped from `outOfRange`/`suboptimal` to keep the payload bounded. */
    truncated: { outOfRange: number; suboptimal: number };
  };
  retests: RetestFinding[];
  medications: { active: MedicationFinding[]; endedRecently: MedicationFinding[] };
  vitals: {
    bloodPressure: {
      latest: {
        ref: string;
        date: string;
        systolic: number;
        diastolic: number;
        heartRateBpm: number | null;
        stage: BpStage;
      };
      readings90d: number;
      /** Readings in the last 90 days at stage 2 or crisis. */
      elevated90d: number;
      average90d: { systolic: number; diastolic: number } | null;
    } | null;
    weight: {
      latest: { ref: string; date: string; weightKg: number };
      /** Change versus the oldest reading within the last 90 days. */
      delta90dKg: number | null;
      targetWeightKg: number | null;
      toTargetKg: number | null;
    } | null;
  };
  symptoms: {
    name: string;
    count30d: number;
    maxSeverity30d: number;
    lastDate: string;
    lastRef: string;
  }[];
  /** Machine-readable gaps the answer should name instead of glossing over. */
  gaps: ReviewGap[];
};

export type ReviewGap =
  | "no_birth_date"
  | "no_sex"
  | "no_labs"
  | "no_labs_12m"
  | "no_medications"
  | "no_allergies_recorded"
  | "no_vaccines"
  | "no_blood_pressure"
  | "no_weight";

const MAX_LIST = 25;
/** A previously abnormal marker not re-measured for this long is "stale". */
export const STALE_DAYS = 365;
/** Medications that ended within this window are still relevant to recent labs. */
const ENDED_RECENTLY_DAYS = 90;
const VITALS_WINDOW_DAYS = 90;
const SYMPTOM_WINDOW_DAYS = 30;
const RETEST_DUE_SOON_DAYS = 30;

const SEVERITY_RANK: Record<ChangeSeverity, number> = { info: 0, watch: 1, alert: 2 };
const FLAG_RANK: Record<NonNullable<ReviewResultRow["flag"]>, number> = {
  critical: 2,
  high: 1,
  low: 1,
};

export function daysBetween(fromISO: string, toISO: string): number {
  const from = Date.parse(`${fromISO.slice(0, 10)}T00:00:00Z`);
  const to = Date.parse(`${toISO.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return Number.NaN;
  return Math.round((to - from) / 86_400_000);
}

function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function point(row: ReviewResultRow): ValuePoint {
  return {
    value: row.valueNormalized ?? row.value,
    unit: row.unitNormalized ?? row.unit,
    date: row.date,
    outOfRange: row.outOfRange,
    flag: row.flag,
  };
}

/** Chronological order with the panel id as tie-break — the same order the trend chart uses. */
function byDateThenPanel(a: ReviewResultRow, b: ReviewResultRow): number {
  return a.date.localeCompare(b.date) || a.panelId - b.panelId || a.resultId - b.resultId;
}

function doseLabel(m: Medication): string | null {
  if (m.doseAmount == null) return null;
  return `${m.doseAmount}${m.doseUnit ? ` ${m.doseUnit}` : ""}`;
}

/** Medications whose intake period covers `date` (end null = still taking). */
export function medicationsCovering(medications: Medication[], date: string): Medication[] {
  return medications.filter((m) => m.startDate <= date && (m.endDate == null || m.endDate >= date));
}

function last<T>(rows: T[]): T | undefined {
  return rows[rows.length - 1];
}

export function buildHealthReview(input: ReviewInput): HealthReview {
  const { today } = input;
  const bioById = new Map(input.biomarkers.map((b) => [b.id, b]));
  const ageYears = ageYearsFrom(input.profile?.birthDate, new Date(`${today}T00:00:00Z`));
  const rangeCtx = { sex: input.profile?.sex ?? null, ageYears };

  // ── labs: one chronological series per biomarker ─────────────────────────
  const series = new Map<number, ReviewResultRow[]>();
  for (const row of [...input.results].sort(byDateThenPanel)) {
    if (!bioById.has(row.biomarkerId)) continue;
    const list = series.get(row.biomarkerId) ?? [];
    list.push(row);
    series.set(row.biomarkerId, list);
  }

  const findings: MarkerFinding[] = [];
  const stale: StaleMarker[] = [];
  for (const [biomarkerId, rows] of series) {
    const bio = bioById.get(biomarkerId)!;
    const latest = last(rows)!;
    const previous = rows.length > 1 ? rows[rows.length - 2] : null;
    const range = resolveRange(bio, input.ranges.get(biomarkerId), rangeCtx);
    const latestPoint = point(latest);
    const ageDays = daysBetween(latest.date, today);
    const suboptimal =
      !latest.outOfRange &&
      latest.valueNormalized != null &&
      ((range.optimalLow != null && latestPoint.value < range.optimalLow) ||
        (range.optimalHigh != null && latestPoint.value > range.optimalHigh));
    const change = previous
      ? changeBetween(point(previous), latestPoint, { ...range, direction: bio.direction })
      : null;
    findings.push({
      biomarker: {
        id: bio.id,
        name: bio.canonicalName,
        unit: bio.defaultUnit,
        direction: bio.direction,
        ref: `biomarker:${bio.id}`,
      },
      latest: {
        value: latestPoint.value,
        unit: latestPoint.unit,
        date: latest.date,
        flag: latest.flag,
        outOfRange: latest.outOfRange,
        ageDays,
        labName: latest.labName,
        panelRef: `lab_panel:${latest.panelId}`,
        resultRef: `lab_result:${latest.resultId}`,
      },
      range,
      suboptimal,
      previous: previous
        ? {
            value: point(previous).value,
            unit: point(previous).unit,
            date: previous.date,
            flag: previous.flag,
            panelRef: `lab_panel:${previous.panelId}`,
          }
        : null,
      change,
      readings: rows.length,
      medicationsAtReading: medicationsCovering(input.medications, latest.date).map((m) => m.name),
    });
    if (latest.outOfRange && ageDays >= STALE_DAYS) {
      stale.push({
        biomarker: { id: bio.id, name: bio.canonicalName, ref: `biomarker:${bio.id}` },
        lastDate: latest.date,
        ageDays,
        lastFlag: latest.flag,
        lastValue: latestPoint.value,
        unit: latestPoint.unit,
      });
    }
  }

  // Critical first, then the loudest change, then the most recent reading.
  const outOfRangeAll = findings
    .filter((f) => f.latest.outOfRange)
    .sort(
      (a, b) =>
        (FLAG_RANK[b.latest.flag ?? "low"] ?? 0) - (FLAG_RANK[a.latest.flag ?? "low"] ?? 0) ||
        SEVERITY_RANK[b.change?.severity ?? "info"] - SEVERITY_RANK[a.change?.severity ?? "info"] ||
        b.latest.date.localeCompare(a.latest.date),
    );
  const notableChanges = findings
    .filter((f) => f.change?.notable)
    .sort(
      (a, b) =>
        SEVERITY_RANK[b.change!.severity] - SEVERITY_RANK[a.change!.severity] ||
        b.latest.date.localeCompare(a.latest.date),
    )
    .slice(0, MAX_LIST);
  const suboptimalAll = findings
    .filter((f) => f.suboptimal)
    .sort((a, b) => b.latest.date.localeCompare(a.latest.date));
  stale.sort((a, b) => b.ageDays - a.ageDays);

  const panels = new Map<
    number,
    { date: string; labName: string | null; results: number; outOfRange: number }
  >();
  for (const row of input.results) {
    const panel = panels.get(row.panelId) ?? {
      date: row.date,
      labName: row.labName,
      results: 0,
      outOfRange: 0,
    };
    panel.results += 1;
    if (row.outOfRange) panel.outOfRange += 1;
    panels.set(row.panelId, panel);
  }
  const panelEntries = [...panels.entries()].sort(
    (a, b) => a[1].date.localeCompare(b[1].date) || a[0] - b[0],
  );
  const lastPanelEntry = last(panelEntries);
  const lastPanel = lastPanelEntry
    ? {
        ref: `lab_panel:${lastPanelEntry[0]}`,
        ...lastPanelEntry[1],
        ageDays: daysBetween(lastPanelEntry[1].date, today),
      }
    : null;

  // ── re-test schedules ────────────────────────────────────────────────────
  const retests: RetestFinding[] = input.retestSchedules
    .filter((s) => s.active)
    .map((s) => {
      const dueDate = s.lastTestedDate ? retestDueDate(s.lastTestedDate, s.intervalMonths) : null;
      const overdueDays = dueDate ? daysBetween(dueDate, today) : null;
      const status: RetestStatus =
        overdueDays == null
          ? "unanchored"
          : overdueDays > 0
            ? "overdue"
            : overdueDays >= -RETEST_DUE_SOON_DAYS
              ? "due_soon"
              : "scheduled";
      return {
        ref: `retest_schedule:${s.id}`,
        label: s.label,
        biomarkerId: s.biomarkerId,
        intervalMonths: s.intervalMonths,
        lastTestedDate: s.lastTestedDate,
        dueDate,
        overdueDays,
        status,
      };
    })
    .sort((a, b) => (b.overdueDays ?? -Infinity) - (a.overdueDays ?? -Infinity));

  // ── medications ──────────────────────────────────────────────────────────
  const activeAllergies = input.allergies.filter((a) => a.status === "active");
  const toMedFinding = (m: Medication): MedicationFinding => {
    const started = daysBetween(m.startDate, today);
    const endsIn = m.endDate ? daysBetween(today, m.endDate) : null;
    return {
      ref: `medication:${m.id}`,
      name: m.name,
      type: m.type,
      dose: doseLabel(m),
      asNeeded: m.asNeeded,
      startDate: m.startDate,
      endDate: m.endDate,
      daysOn: started >= 0 ? started : null,
      endsInDays: endsIn != null && endsIn >= 0 ? endsIn : null,
      purpose: m.purpose,
      allergyConflicts: matchDrugAllergies(m.name, activeAllergies).map((a) => ({
        ref: `allergy:${a.id}`,
        allergen: a.allergen,
        severity: a.severity,
      })),
    };
  };
  const activeMeds = input.medications.filter(
    (m) => m.startDate <= today && (m.endDate == null || m.endDate >= today),
  );
  const endedRecently = input.medications.filter(
    (m) =>
      m.endDate != null &&
      m.endDate < today &&
      daysBetween(m.endDate, today) <= ENDED_RECENTLY_DAYS,
  );

  // ── vitals ───────────────────────────────────────────────────────────────
  const windowStart = shiftDays(today, -VITALS_WINDOW_DAYS);
  const bp = [...input.bpLog].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const bpLatest = last(bp);
  const bp90 = bp.filter((r) => r.date >= windowStart);
  const bloodPressure = bpLatest
    ? {
        latest: {
          ref: `bp_log:${bpLatest.id}`,
          date: bpLatest.date,
          systolic: bpLatest.systolic,
          diastolic: bpLatest.diastolic,
          heartRateBpm: bpLatest.heartRateBpm,
          stage: bpStage(bpLatest.systolic, bpLatest.diastolic),
        },
        readings90d: bp90.length,
        elevated90d: bp90.filter((r) => {
          const stage = bpStage(r.systolic, r.diastolic);
          return stage === "stage2" || stage === "crisis";
        }).length,
        average90d: bp90.length
          ? {
              systolic: Math.round(bp90.reduce((a, r) => a + r.systolic, 0) / bp90.length),
              diastolic: Math.round(bp90.reduce((a, r) => a + r.diastolic, 0) / bp90.length),
            }
          : null,
      }
    : null;
  const weights = [...input.weightLog].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const weightLatest = last(weights);
  const weight90 = weights.filter((r) => r.date >= windowStart);
  const targetWeightKg = input.profile?.targetWeightKg ?? null;
  const weight = weightLatest
    ? {
        latest: {
          ref: `weight_log:${weightLatest.id}`,
          date: weightLatest.date,
          weightKg: weightLatest.weightKg,
        },
        delta90dKg:
          weight90.length > 1 ? round1(weightLatest.weightKg - weight90[0].weightKg) : null,
        targetWeightKg,
        toTargetKg: targetWeightKg != null ? round1(weightLatest.weightKg - targetWeightKg) : null,
      }
    : null;

  // ── symptoms (recent) ────────────────────────────────────────────────────
  const symptomStart = shiftDays(today, -SYMPTOM_WINDOW_DAYS);
  const symptomAgg = new Map<string, HealthReview["symptoms"][number]>();
  for (const s of [...input.symptoms].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)) {
    if (s.date < symptomStart) continue;
    const key = s.symptomName.trim().toLowerCase();
    const agg = symptomAgg.get(key) ?? {
      name: s.symptomName,
      count30d: 0,
      maxSeverity30d: 0,
      lastDate: s.date,
      lastRef: `symptom:${s.id}`,
    };
    agg.count30d += 1;
    agg.maxSeverity30d = Math.max(agg.maxSeverity30d, s.severity);
    agg.lastDate = s.date;
    agg.lastRef = `symptom:${s.id}`;
    symptomAgg.set(key, agg);
  }
  const symptoms = [...symptomAgg.values()].sort(
    (a, b) => b.maxSeverity30d - a.maxSeverity30d || b.count30d - a.count30d,
  );

  // ── coverage and gaps ────────────────────────────────────────────────────
  const dates = (rows: { date: string }[]) => {
    const sorted = rows.map((r) => r.date).sort();
    return { count: sorted.length, firstDate: sorted[0] ?? null, lastDate: last(sorted) ?? null };
  };
  const panelDates = dates(panelEntries.map(([, p]) => p));
  const vaccineDates = dates(input.vaccines);
  const visitDates = dates(input.visits);
  const bpDates = dates(input.bpLog);
  const weightDates = dates(input.weightLog);
  const symptomDates = dates(input.symptoms);
  const activeDx = input.diagnoses.filter((d) => d.status === "active");

  const gaps: ReviewGap[] = [];
  if (!input.profile?.birthDate) gaps.push("no_birth_date");
  if (!input.profile?.sex) gaps.push("no_sex");
  if (panelDates.count === 0) gaps.push("no_labs");
  else if (lastPanel && lastPanel.ageDays > STALE_DAYS) gaps.push("no_labs_12m");
  if (input.medications.length === 0) gaps.push("no_medications");
  if (input.allergies.length === 0) gaps.push("no_allergies_recorded");
  if (input.vaccines.length === 0) gaps.push("no_vaccines");
  if (input.bpLog.length === 0) gaps.push("no_blood_pressure");
  if (input.weightLog.length === 0) gaps.push("no_weight");

  return {
    today,
    coverage: {
      labPanels: panelDates,
      biomarkersTracked: series.size,
      medications: { total: input.medications.length, active: activeMeds.length },
      diagnoses: { total: input.diagnoses.length, active: activeDx.length },
      allergies: { active: activeAllergies.length },
      vaccines: { count: vaccineDates.count, lastDate: vaccineDates.lastDate },
      visits: { count: visitDates.count, lastDate: visitDates.lastDate },
      bloodPressure: { count: bpDates.count, lastDate: bpDates.lastDate },
      weight: { count: weightDates.count, lastDate: weightDates.lastDate },
      symptoms: { count: symptomDates.count, lastDate: symptomDates.lastDate },
      imaging: input.imagingCount,
      healthNotes: input.healthNoteCount,
    },
    safety: {
      ageYears,
      sex: input.profile?.sex ?? null,
      pregnancyStatus: input.profile?.pregnancyStatus ?? null,
      allergies: activeAllergies.map((a) => ({
        ref: `allergy:${a.id}`,
        allergen: a.allergen,
        category: a.category,
        severity: a.severity,
        reaction: a.reaction,
      })),
      activeDiagnoses: activeDx.map((d) => ({
        ref: `diagnosis:${d.id}`,
        name: d.name,
        icdCode: d.icdCode,
        since: d.date,
      })),
    },
    labs: {
      outOfRange: outOfRangeAll.slice(0, MAX_LIST),
      notableChanges,
      suboptimal: suboptimalAll.slice(0, MAX_LIST),
      stale: stale.slice(0, MAX_LIST),
      lastPanel,
      truncated: {
        outOfRange: Math.max(0, outOfRangeAll.length - MAX_LIST),
        suboptimal: Math.max(0, suboptimalAll.length - MAX_LIST),
      },
    },
    retests,
    medications: {
      active: activeMeds.map(toMedFinding),
      endedRecently: endedRecently.map(toMedFinding),
    },
    vitals: { bloodPressure, weight },
    symptoms,
    gaps,
  };
}

// ── "what changed since …" ───────────────────────────────────────────────────

export type LabChangeSince = {
  biomarker: { id: number; name: string; ref: string };
  before: (ValuePoint & { panelRef: string }) | null;
  after: ValuePoint & { panelRef: string };
  change: BiomarkerChange | null;
  /** True when the marker had never been measured before `sinceDate`. */
  isNew: boolean;
};

export type ChangesSince = {
  sinceDate: string;
  today: string;
  /** How `sinceDate` was chosen when the caller did not pass one. */
  sinceReason: "requested" | "previous_panel" | "no_history";
  labs: {
    /** Markers measured on/after `sinceDate`, worst change first. */
    changed: LabChangeSince[];
    /** Markers measured on/after `sinceDate` whose move was not notable. */
    unchangedCount: number;
    panelsSince: { ref: string; date: string; labName: string | null }[];
  };
  medications: {
    started: { ref: string; name: string; startDate: string; dose: string | null }[];
    stopped: { ref: string; name: string; endDate: string; dose: string | null }[];
  };
  diagnoses: {
    added: { ref: string; name: string; date: string; status: Diagnosis["status"] }[];
    resolved: { ref: string; name: string; resolvedDate: string; status: Diagnosis["status"] }[];
  };
  visits: { ref: string; date: string; specialty: string | null; clinic: string | null }[];
  vaccines: { ref: string; name: string; date: string }[];
  symptoms: { name: string; count: number; maxSeverity: number }[];
  vitals: {
    bloodPressure: {
      before: { systolic: number; diastolic: number; readings: number } | null;
      after: { systolic: number; diastolic: number; readings: number } | null;
    };
    weight: {
      before: { weightKg: number; date: string } | null;
      after: { weightKg: number; date: string } | null;
    };
  };
};

/**
 * Compares the record after `sinceDate` with the state just before it. When no
 * date is given, the window opens at the latest panel so the answer is "this
 * panel versus the one before" — the comparison the user most often means.
 */
export function buildChangesSince(input: ReviewInput, sinceDate?: string | null): ChangesSince {
  const { today } = input;
  const bioById = new Map(input.biomarkers.map((b) => [b.id, b]));
  const ageYears = ageYearsFrom(input.profile?.birthDate, new Date(`${today}T00:00:00Z`));
  const rangeCtx = { sex: input.profile?.sex ?? null, ageYears };
  const sorted = [...input.results].sort(byDateThenPanel);

  let since = sinceDate?.slice(0, 10) ?? null;
  let sinceReason: ChangesSince["sinceReason"] = "requested";
  if (!since) {
    const latest = last(sorted);
    if (latest) {
      since = latest.date;
      sinceReason = "previous_panel";
    } else {
      since = today;
      sinceReason = "no_history";
    }
  }

  const series = new Map<number, ReviewResultRow[]>();
  for (const row of sorted) {
    if (!bioById.has(row.biomarkerId)) continue;
    const list = series.get(row.biomarkerId) ?? [];
    list.push(row);
    series.set(row.biomarkerId, list);
  }
  const changed: LabChangeSince[] = [];
  let unchangedCount = 0;
  for (const [biomarkerId, rows] of series) {
    const after = last(rows)!;
    if (after.date < since) continue;
    const before = [...rows].reverse().find((r) => r.date < since) ?? null;
    const bio = bioById.get(biomarkerId)!;
    const range = resolveRange(bio, input.ranges.get(biomarkerId), rangeCtx);
    const change = before
      ? changeBetween(point(before), point(after), { ...range, direction: bio.direction })
      : null;
    const entry: LabChangeSince = {
      biomarker: { id: bio.id, name: bio.canonicalName, ref: `biomarker:${bio.id}` },
      before: before ? { ...point(before), panelRef: `lab_panel:${before.panelId}` } : null,
      after: { ...point(after), panelRef: `lab_panel:${after.panelId}` },
      change,
      isNew: !before,
    };
    if (!before || change?.notable || after.outOfRange) changed.push(entry);
    else unchangedCount += 1;
  }
  changed.sort(
    (a, b) =>
      SEVERITY_RANK[b.change?.severity ?? "info"] - SEVERITY_RANK[a.change?.severity ?? "info"] ||
      Number(b.after.outOfRange) - Number(a.after.outOfRange) ||
      a.biomarker.name.localeCompare(b.biomarker.name),
  );
  const panelsSince = new Map<number, { ref: string; date: string; labName: string | null }>();
  for (const row of sorted) {
    if (row.date >= since && !panelsSince.has(row.panelId)) {
      panelsSince.set(row.panelId, {
        ref: `lab_panel:${row.panelId}`,
        date: row.date,
        labName: row.labName,
      });
    }
  }

  const symptomAgg = new Map<string, { name: string; count: number; maxSeverity: number }>();
  for (const s of input.symptoms) {
    if (s.date < since) continue;
    const key = s.symptomName.trim().toLowerCase();
    const agg = symptomAgg.get(key) ?? { name: s.symptomName, count: 0, maxSeverity: 0 };
    agg.count += 1;
    agg.maxSeverity = Math.max(agg.maxSeverity, s.severity);
    symptomAgg.set(key, agg);
  }

  const avgBp = (rows: BpLog[]) =>
    rows.length
      ? {
          systolic: Math.round(rows.reduce((a, r) => a + r.systolic, 0) / rows.length),
          diastolic: Math.round(rows.reduce((a, r) => a + r.diastolic, 0) / rows.length),
          readings: rows.length,
        }
      : null;
  const bpBeforeStart = shiftDays(since, -VITALS_WINDOW_DAYS);
  const weights = [...input.weightLog].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const weightBefore = [...weights].reverse().find((w) => w.date < since) ?? null;
  const weightAfter = weights.filter((w) => w.date >= since);

  return {
    sinceDate: since,
    today,
    sinceReason,
    labs: {
      changed: changed.slice(0, MAX_LIST * 2),
      unchangedCount,
      panelsSince: [...panelsSince.values()],
    },
    medications: {
      started: input.medications
        .filter((m) => m.startDate >= since)
        .map((m) => ({
          ref: `medication:${m.id}`,
          name: m.name,
          startDate: m.startDate,
          dose: doseLabel(m),
        })),
      stopped: input.medications
        .filter((m) => m.endDate != null && m.endDate >= since && m.endDate <= today)
        .map((m) => ({
          ref: `medication:${m.id}`,
          name: m.name,
          endDate: m.endDate!,
          dose: doseLabel(m),
        })),
    },
    diagnoses: {
      added: input.diagnoses
        .filter((d) => d.date >= since)
        .map((d) => ({ ref: `diagnosis:${d.id}`, name: d.name, date: d.date, status: d.status })),
      resolved: input.diagnoses
        .filter((d) => d.resolvedDate != null && d.resolvedDate >= since && d.status !== "active")
        .map((d) => ({
          ref: `diagnosis:${d.id}`,
          name: d.name,
          resolvedDate: d.resolvedDate!,
          status: d.status,
        })),
    },
    visits: input.visits
      .filter((v) => v.date >= since)
      .map((v) => ({
        ref: `visit:${v.id}`,
        date: v.date,
        specialty: v.specialty,
        clinic: v.clinic,
      })),
    vaccines: input.vaccines
      .filter((v) => v.date >= since)
      .map((v) => ({ ref: `vaccine:${v.id}`, name: v.vaccineName, date: v.date })),
    symptoms: [...symptomAgg.values()].sort((a, b) => b.maxSeverity - a.maxSeverity),
    vitals: {
      bloodPressure: {
        before: avgBp(input.bpLog.filter((r) => r.date >= bpBeforeStart && r.date < since)),
        after: avgBp(input.bpLog.filter((r) => r.date >= since)),
      },
      weight: {
        before: weightBefore ? { weightKg: weightBefore.weightKg, date: weightBefore.date } : null,
        after: weightAfter.length
          ? { weightKg: last(weightAfter)!.weightKg, date: last(weightAfter)!.date }
          : null,
      },
    },
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
