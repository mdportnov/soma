import { describe, expect, it } from "vitest";
import type {
  Allergy,
  Biomarker,
  BpLog,
  Diagnosis,
  Medication,
  RetestSchedule,
  SymptomLog,
  WeightLog,
} from "@/db/schema";
import {
  STALE_DAYS,
  buildChangesSince,
  buildHealthReview,
  daysBetween,
  medicationsCovering,
  type ReviewInput,
  type ReviewResultRow,
} from "./review";

const TODAY = "2026-09-02";

const ferritin: Biomarker = {
  id: 1,
  code: null,
  canonicalName: "Ferritin",
  category: "iron",
  aliases: ["ферритин"],
  defaultUnit: "ng/mL",
  refLow: 30,
  refHigh: 400,
  optimalLow: 50,
  optimalHigh: 150,
  direction: "range",
  isCustom: false,
  isUserModified: false,
};
const ldl: Biomarker = {
  ...ferritin,
  id: 2,
  canonicalName: "LDL cholesterol",
  category: "lipids",
  aliases: [],
  defaultUnit: "mmol/L",
  refLow: null,
  refHigh: 3,
  optimalLow: null,
  optimalHigh: 2.6,
  direction: "lower_better",
};
const tsh: Biomarker = {
  ...ferritin,
  id: 3,
  canonicalName: "TSH",
  category: "thyroid",
  aliases: [],
  defaultUnit: "mIU/L",
  refLow: 0.4,
  refHigh: 4,
  optimalLow: null,
  optimalHigh: null,
};

let resultSeq = 0;
function result(
  over: Partial<ReviewResultRow> &
    Pick<ReviewResultRow, "biomarkerId" | "panelId" | "date" | "value">,
): ReviewResultRow {
  resultSeq += 1;
  const value = over.value;
  return {
    resultId: resultSeq,
    labName: "Lab",
    unit: "u",
    valueNormalized: value,
    unitNormalized: "u",
    outOfRange: false,
    flag: null,
    ...over,
  };
}

function med(over: Partial<Medication> = {}): Medication {
  return {
    id: 10,
    profileId: 1,
    name: "Levothyroxine",
    type: "drug",
    doseAmount: 50,
    doseUnit: "mcg",
    schedule: null,
    asNeeded: false,
    startDate: "2026-01-10",
    endDate: null,
    purpose: null,
    prescriptionId: null,
    ...over,
  };
}

function allergy(over: Partial<Allergy> = {}): Allergy {
  return {
    id: 20,
    profileId: 1,
    allergen: "Penicillin",
    category: "drug",
    severity: "anaphylactic",
    reaction: "hives",
    onsetDate: null,
    status: "active",
    notes: null,
    createdAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

function diagnosis(over: Partial<Diagnosis> = {}): Diagnosis {
  return {
    id: 30,
    profileId: 1,
    name: "Hypothyroidism",
    icdCode: "E03.9",
    date: "2025-12-01",
    status: "active",
    notes: null,
    resolvedDate: null,
    visitId: null,
    ...over,
  };
}

function retest(over: Partial<RetestSchedule> = {}): RetestSchedule {
  return {
    id: 40,
    profileId: 1,
    label: "Ferritin",
    biomarkerId: 1,
    intervalMonths: 6,
    lastTestedDate: "2026-01-15",
    notes: null,
    active: true,
    createdAt: "2026-01-15T00:00:00Z",
    ...over,
  };
}

function bp(over: Partial<BpLog> & Pick<BpLog, "id" | "date" | "systolic" | "diastolic">): BpLog {
  return {
    profileId: 1,
    time: null,
    heartRateBpm: null,
    position: null,
    armSide: null,
    notes: null,
    ...over,
  };
}

function weight(over: Pick<WeightLog, "id" | "date" | "weightKg">): WeightLog {
  return { profileId: 1, notes: null, ...over };
}

function symptom(
  over: Partial<SymptomLog> & Pick<SymptomLog, "id" | "date" | "symptomName" | "severity">,
): SymptomLog {
  return {
    profileId: 1,
    time: null,
    notes: null,
    visitId: null,
    createdAt: `${over.date}T00:00:00Z`,
    ...over,
  };
}

function input(over: Partial<ReviewInput> = {}): ReviewInput {
  return {
    today: TODAY,
    profile: { birthDate: "1990-05-05", sex: "male", pregnancyStatus: null, targetWeightKg: 80 },
    biomarkers: [ferritin, ldl, tsh],
    ranges: new Map(),
    results: [],
    medications: [],
    diagnoses: [],
    allergies: [],
    retestSchedules: [],
    bpLog: [],
    weightLog: [],
    symptoms: [],
    visits: [],
    vaccines: [],
    imagingCount: 0,
    healthNoteCount: 0,
    ...over,
  };
}

describe("buildHealthReview — labs", () => {
  it("lists out-of-range markers with their previous reading and change", () => {
    const review = buildHealthReview(
      input({
        results: [
          result({ biomarkerId: 1, panelId: 1, date: "2026-01-15", value: 60 }),
          result({
            biomarkerId: 1,
            panelId: 2,
            date: "2026-08-20",
            value: 18,
            outOfRange: true,
            flag: "low",
          }),
        ],
      }),
    );
    expect(review.labs.outOfRange).toHaveLength(1);
    const f = review.labs.outOfRange[0];
    expect(f.biomarker.ref).toBe("biomarker:1");
    expect(f.latest).toMatchObject({
      value: 18,
      flag: "low",
      panelRef: "lab_panel:2",
      ageDays: 13,
    });
    expect(f.previous).toMatchObject({ value: 60, date: "2026-01-15", panelRef: "lab_panel:1" });
    expect(f.change?.trajectory).toBe("worsened");
    expect(f.change?.reasons).toContain("became_out_of_range");
    expect(f.readings).toBe(2);
    expect(review.labs.notableChanges[0].biomarker.id).toBe(1);
    expect(review.labs.lastPanel).toMatchObject({ ref: "lab_panel:2", outOfRange: 1, results: 1 });
  });

  it("orders critical flags before ordinary out-of-range values", () => {
    const review = buildHealthReview(
      input({
        results: [
          result({
            biomarkerId: 1,
            panelId: 1,
            date: "2026-08-01",
            value: 10,
            outOfRange: true,
            flag: "low",
          }),
          result({
            biomarkerId: 3,
            panelId: 1,
            date: "2026-08-01",
            value: 40,
            outOfRange: true,
            flag: "critical",
          }),
        ],
      }),
    );
    expect(review.labs.outOfRange.map((f) => f.biomarker.id)).toEqual([3, 1]);
  });

  it("flags sub-optimal values that are inside the reference range", () => {
    const review = buildHealthReview(
      input({ results: [result({ biomarkerId: 1, panelId: 1, date: "2026-08-01", value: 35 })] }),
    );
    expect(review.labs.outOfRange).toHaveLength(0);
    expect(review.labs.suboptimal).toHaveLength(1);
    expect(review.labs.suboptimal[0].suboptimal).toBe(true);
    expect(review.labs.suboptimal[0].range).toEqual({
      refLow: 30,
      refHigh: 400,
      optimalLow: 50,
      optimalHigh: 150,
    });
  });

  it("applies a demographic range override when one matches the profile", () => {
    const review = buildHealthReview(
      input({
        ranges: new Map([
          [
            1,
            [
              {
                sex: "male",
                ageMinYears: null,
                ageMaxYears: null,
                condition: null,
                refLow: 30,
                refHigh: 400,
                optimalLow: 100,
                optimalHigh: 300,
              },
            ],
          ],
        ]),
        results: [result({ biomarkerId: 1, panelId: 1, date: "2026-08-01", value: 80 })],
      }),
    );
    expect(review.labs.suboptimal[0]?.range.optimalLow).toBe(100);
  });

  it("does not call an unconverted value sub-optimal", () => {
    const review = buildHealthReview(
      input({
        results: [
          result({
            biomarkerId: 1,
            panelId: 1,
            date: "2026-08-01",
            value: 35,
            valueNormalized: null,
            unitNormalized: null,
          }),
        ],
      }),
    );
    expect(review.labs.suboptimal).toHaveLength(0);
  });

  it("reports markers abnormal when last measured and not re-checked for a year", () => {
    const review = buildHealthReview(
      input({
        results: [
          result({
            biomarkerId: 2,
            panelId: 1,
            date: "2025-03-01",
            value: 4.2,
            outOfRange: true,
            flag: "high",
          }),
          result({
            biomarkerId: 1,
            panelId: 2,
            date: "2026-08-01",
            value: 20,
            outOfRange: true,
            flag: "low",
          }),
        ],
      }),
    );
    expect(review.labs.stale).toHaveLength(1);
    expect(review.labs.stale[0]).toMatchObject({
      biomarker: { id: 2 },
      lastDate: "2025-03-01",
      lastFlag: "high",
    });
    expect(review.labs.stale[0].ageDays).toBeGreaterThan(STALE_DAYS);
  });

  it("names medications covering the latest reading", () => {
    const review = buildHealthReview(
      input({
        medications: [
          med({ id: 1, name: "Levothyroxine", startDate: "2026-01-10", endDate: null }),
          med({ id: 2, name: "Iron", startDate: "2025-01-01", endDate: "2025-06-01" }),
        ],
        results: [
          result({
            biomarkerId: 3,
            panelId: 1,
            date: "2026-08-01",
            value: 6,
            outOfRange: true,
            flag: "high",
          }),
        ],
      }),
    );
    expect(review.labs.outOfRange[0].medicationsAtReading).toEqual(["Levothyroxine"]);
  });

  it("ignores results whose biomarker is unknown", () => {
    const review = buildHealthReview(
      input({
        results: [
          result({ biomarkerId: 999, panelId: 1, date: "2026-08-01", value: 1, outOfRange: true }),
        ],
      }),
    );
    expect(review.labs.outOfRange).toHaveLength(0);
    expect(review.coverage.biomarkersTracked).toBe(0);
  });
});

describe("buildHealthReview — re-tests, medications, safety", () => {
  it("classifies re-test schedules", () => {
    const review = buildHealthReview(
      input({
        retestSchedules: [
          retest({ id: 1, lastTestedDate: "2026-01-15", intervalMonths: 6 }),
          retest({ id: 2, label: "TSH", lastTestedDate: "2026-08-15", intervalMonths: 1 }),
          retest({ id: 3, label: "Lipids", lastTestedDate: "2026-08-01", intervalMonths: 12 }),
          retest({ id: 4, label: "Vitamin D", lastTestedDate: null }),
          retest({ id: 5, label: "Paused", active: false }),
        ],
      }),
    );
    const byLabel = Object.fromEntries(review.retests.map((r) => [r.label, r]));
    expect(byLabel.Ferritin).toMatchObject({
      status: "overdue",
      dueDate: "2026-07-15",
      overdueDays: 49,
    });
    expect(byLabel.TSH).toMatchObject({ status: "due_soon", dueDate: "2026-09-15" });
    expect(byLabel.Lipids.status).toBe("scheduled");
    expect(byLabel["Vitamin D"]).toMatchObject({
      status: "unanchored",
      dueDate: null,
      overdueDays: null,
    });
    expect(byLabel.Paused).toBeUndefined();
    expect(review.retests[0].label).toBe("Ferritin");
  });

  it("describes active courses and flags drug-allergy conflicts", () => {
    const review = buildHealthReview(
      input({
        medications: [
          med({ id: 1, name: "Amoxicillin", startDate: "2026-08-25", endDate: "2026-09-05" }),
          med({ id: 2, name: "Vitamin D", type: "supplement", startDate: "2026-10-01" }),
          med({ id: 3, name: "Ibuprofen", asNeeded: true, startDate: "2026-01-01" }),
          med({ id: 4, name: "Iron", startDate: "2026-05-01", endDate: "2026-08-01" }),
          med({ id: 5, name: "Old", startDate: "2020-01-01", endDate: "2020-02-01" }),
        ],
        allergies: [
          allergy({ allergen: "penicillin" }),
          allergy({ id: 21, allergen: "Amoxicillin", status: "resolved" }),
        ],
      }),
    );
    const names = review.medications.active.map((m) => m.name);
    expect(names).toEqual(["Amoxicillin", "Ibuprofen"]);
    const amox = review.medications.active[0];
    expect(amox).toMatchObject({ daysOn: 8, endsInDays: 3, dose: "50 mcg" });
    expect(amox.allergyConflicts).toEqual([
      { ref: "allergy:20", allergen: "penicillin", severity: "anaphylactic" },
    ]);
    expect(review.medications.endedRecently.map((m) => m.name)).toEqual(["Iron"]);
    expect(review.coverage.medications).toEqual({ total: 5, active: 2 });
  });

  it("carries active allergies and diagnoses with refs", () => {
    const review = buildHealthReview(
      input({
        allergies: [
          allergy(),
          allergy({
            id: 21,
            allergen: "Cats",
            category: "environmental",
            severity: "mild",
            status: "resolved",
          }),
        ],
        diagnoses: [
          diagnosis(),
          diagnosis({ id: 31, name: "Flu", status: "resolved", resolvedDate: "2026-02-01" }),
        ],
      }),
    );
    expect(review.safety.allergies).toEqual([
      {
        ref: "allergy:20",
        allergen: "Penicillin",
        category: "drug",
        severity: "anaphylactic",
        reaction: "hives",
      },
    ]);
    expect(review.safety.activeDiagnoses).toEqual([
      { ref: "diagnosis:30", name: "Hypothyroidism", icdCode: "E03.9", since: "2025-12-01" },
    ]);
    expect(review.safety.ageYears).toBe(36);
  });
});

describe("buildHealthReview — vitals, symptoms, gaps", () => {
  it("summarizes blood pressure and weight over the last 90 days", () => {
    const review = buildHealthReview(
      input({
        bpLog: [
          bp({ id: 1, date: "2026-03-01", systolic: 150, diastolic: 95 }),
          bp({ id: 2, date: "2026-08-01", systolic: 118, diastolic: 78 }),
          bp({ id: 3, date: "2026-08-20", systolic: 142, diastolic: 92, heartRateBpm: 70 }),
        ],
        weightLog: [
          weight({ id: 1, date: "2026-06-10", weightKg: 88 }),
          weight({ id: 2, date: "2026-08-30", weightKg: 85.4 }),
        ],
      }),
    );
    expect(review.vitals.bloodPressure).toMatchObject({
      latest: { ref: "bp_log:3", systolic: 142, diastolic: 92, stage: "stage2", heartRateBpm: 70 },
      readings90d: 2,
      elevated90d: 1,
      average90d: { systolic: 130, diastolic: 85 },
    });
    expect(review.vitals.weight).toEqual({
      latest: { ref: "weight_log:2", date: "2026-08-30", weightKg: 85.4 },
      delta90dKg: -2.6,
      targetWeightKg: 80,
      toTargetKg: 5.4,
    });
  });

  it("aggregates symptoms from the last 30 days only", () => {
    const review = buildHealthReview(
      input({
        symptoms: [
          symptom({ id: 1, date: "2026-06-01", symptomName: "Headache", severity: 8 }),
          symptom({ id: 2, date: "2026-08-10", symptomName: "headache", severity: 4 }),
          symptom({ id: 3, date: "2026-08-28", symptomName: "Headache", severity: 6 }),
          symptom({ id: 4, date: "2026-08-29", symptomName: "Fatigue", severity: 3 }),
        ],
      }),
    );
    expect(review.symptoms).toEqual([
      {
        name: "headache",
        count30d: 2,
        maxSeverity30d: 6,
        lastDate: "2026-08-28",
        lastRef: "symptom:3",
      },
      {
        name: "Fatigue",
        count30d: 1,
        maxSeverity30d: 3,
        lastDate: "2026-08-29",
        lastRef: "symptom:4",
      },
    ]);
    expect(review.coverage.symptoms).toEqual({ count: 4, lastDate: "2026-08-29" });
  });

  it("names every gap on an empty record", () => {
    const review = buildHealthReview(
      input({
        profile: { birthDate: null, sex: null, pregnancyStatus: null, targetWeightKg: null },
      }),
    );
    expect(review.gaps).toEqual([
      "no_birth_date",
      "no_sex",
      "no_labs",
      "no_medications",
      "no_allergies_recorded",
      "no_vaccines",
      "no_blood_pressure",
      "no_weight",
    ]);
    expect(review.labs.lastPanel).toBeNull();
    expect(review.vitals).toEqual({ bloodPressure: null, weight: null });
  });

  it("flags a record whose last panel is over a year old", () => {
    const review = buildHealthReview(
      input({ results: [result({ biomarkerId: 1, panelId: 1, date: "2025-01-01", value: 80 })] }),
    );
    expect(review.gaps).toContain("no_labs_12m");
    expect(review.gaps).not.toContain("no_labs");
  });
});

describe("buildChangesSince", () => {
  const results = [
    result({ biomarkerId: 1, panelId: 1, date: "2026-01-15", value: 60 }),
    result({ biomarkerId: 2, panelId: 1, date: "2026-01-15", value: 2.5 }),
    result({
      biomarkerId: 1,
      panelId: 2,
      date: "2026-08-20",
      value: 18,
      outOfRange: true,
      flag: "low",
    }),
    result({ biomarkerId: 2, panelId: 2, date: "2026-08-20", value: 2.55 }),
    result({ biomarkerId: 3, panelId: 2, date: "2026-08-20", value: 2.1 }),
  ];

  it("defaults to the latest panel versus the record before it", () => {
    const changes = buildChangesSince(input({ results }));
    expect(changes.sinceReason).toBe("previous_panel");
    expect(changes.sinceDate).toBe("2026-08-20");
    expect(changes.labs.panelsSince).toEqual([
      { ref: "lab_panel:2", date: "2026-08-20", labName: "Lab" },
    ]);
    const byId = Object.fromEntries(changes.labs.changed.map((c) => [c.biomarker.id, c]));
    expect(byId[1].before).toMatchObject({ value: 60, panelRef: "lab_panel:1" });
    expect(byId[1].change?.reasons).toContain("became_out_of_range");
    expect(byId[3]).toMatchObject({ isNew: true, before: null });
    expect(byId[2]).toBeUndefined();
    expect(changes.labs.unchangedCount).toBe(1);
    expect(changes.labs.changed[0].biomarker.id).toBe(1);
  });

  it("honours an explicit date and reports record changes in the window", () => {
    const changes = buildChangesSince(
      input({
        results,
        medications: [
          med({ id: 1, name: "Iron", startDate: "2026-07-01" }),
          med({ id: 2, name: "Old", startDate: "2025-01-01", endDate: "2026-07-10" }),
          med({ id: 3, name: "Older", startDate: "2024-01-01", endDate: "2024-02-01" }),
        ],
        diagnoses: [
          diagnosis({ id: 1, date: "2026-07-05" }),
          diagnosis({
            id: 2,
            name: "Flu",
            status: "resolved",
            date: "2026-01-01",
            resolvedDate: "2026-07-20",
          }),
        ],
        symptoms: [
          symptom({ id: 1, date: "2026-07-02", symptomName: "Fatigue", severity: 5 }),
          symptom({ id: 2, date: "2026-05-02", symptomName: "Fatigue", severity: 9 }),
        ],
        bpLog: [
          bp({ id: 1, date: "2026-05-01", systolic: 140, diastolic: 90 }),
          bp({ id: 2, date: "2026-08-01", systolic: 120, diastolic: 80 }),
        ],
        weightLog: [
          weight({ id: 1, date: "2026-05-01", weightKg: 90 }),
          weight({ id: 2, date: "2026-08-01", weightKg: 86 }),
        ],
      }),
      "2026-06-01",
    );
    expect(changes.sinceReason).toBe("requested");
    expect(changes.medications.started.map((m) => m.name)).toEqual(["Iron"]);
    expect(changes.medications.stopped.map((m) => m.name)).toEqual(["Old"]);
    expect(changes.diagnoses.added.map((d) => d.name)).toEqual(["Hypothyroidism"]);
    expect(changes.diagnoses.resolved.map((d) => d.name)).toEqual(["Flu"]);
    expect(changes.symptoms).toEqual([{ name: "Fatigue", count: 1, maxSeverity: 5 }]);
    expect(changes.vitals.bloodPressure).toEqual({
      before: { systolic: 140, diastolic: 90, readings: 1 },
      after: { systolic: 120, diastolic: 80, readings: 1 },
    });
    expect(changes.vitals.weight).toEqual({
      before: { weightKg: 90, date: "2026-05-01" },
      after: { weightKg: 86, date: "2026-08-01" },
    });
  });

  it("explains an empty record instead of failing", () => {
    const changes = buildChangesSince(input());
    expect(changes.sinceReason).toBe("no_history");
    expect(changes.labs.changed).toEqual([]);
  });
});

describe("helpers", () => {
  it("daysBetween counts calendar days", () => {
    expect(daysBetween("2026-01-01", "2026-01-31")).toBe(30);
    expect(daysBetween("2026-02-01", "2026-01-01")).toBe(-31);
    expect(Number.isNaN(daysBetween("nope", "2026-01-01"))).toBe(true);
  });

  it("medicationsCovering treats a null end date as ongoing", () => {
    const meds = [
      med({ id: 1, startDate: "2026-01-01", endDate: null }),
      med({ id: 2, startDate: "2026-01-01", endDate: "2026-02-01" }),
    ];
    expect(medicationsCovering(meds, "2026-03-01").map((m) => m.id)).toEqual([1]);
    expect(medicationsCovering(meds, "2026-01-15").map((m) => m.id)).toEqual([1, 2]);
    expect(medicationsCovering(meds, "2025-12-31")).toEqual([]);
  });
});
