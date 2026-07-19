import {
  healthChangeSetSchema,
  type HealthChange,
  type HealthChangeSetDraft,
} from "./change-schema";
import {
  getLifestyleByDate,
  getMedication,
  getProfile,
  listMedicationLog,
  listAllergies,
  listBpLog,
  listDiagnoses,
  listImagingRecords,
  listMedications,
  listSymptomLog,
  listRetestSchedules,
  listVaccines,
  listVisits,
  listWeightLog,
} from "@/db/repos";
import { normalizeLabel } from "@/lib/fuzzy";
import { localIsoDate } from "@/lib/clinical-date";

export type ValidatedChangeItem = {
  operation: "create" | "update" | "end" | "merge" | "delete";
  entityType: string;
  entityId?: number | null;
  payloadJson: Record<string, unknown>;
  beforeJson?: Record<string, unknown> | null;
  status: "ready" | "blocked";
  warningsJson: string[];
  errorsJson: string[];
  candidateMatchesJson: { entityType: string; entityId: number; label: string }[];
  confidence?: number | null;
};

export type ValidatedChangeSet = {
  summary: string;
  riskLevel: "standard" | "elevated" | "destructive";
  items: ValidatedChangeItem[];
};

export async function validateHealthChangeSet(
  profileId: number,
  input: unknown,
): Promise<ValidatedChangeSet> {
  const parsed = healthChangeSetSchema.parse(input);
  const [
    medications,
    diagnoses,
    allergies,
    symptoms,
    weights,
    bloodPressures,
    visits,
    imaging,
    vaccines,
    retestSchedules,
    currentProfile,
  ] = await Promise.all([
    listMedications(profileId),
    listDiagnoses(profileId),
    listAllergies(profileId),
    listSymptomLog(profileId),
    listWeightLog(profileId),
    listBpLog(profileId),
    listVisits(profileId),
    listImagingRecords(profileId),
    listVaccines(profileId),
    listRetestSchedules(profileId),
    getProfile(profileId),
  ]);
  const items: ValidatedChangeItem[] = [];
  for (const change of parsed.items) {
    const base = baseItem(change);
    validateDates(change, base.errorsJson);
    if (change.kind === "create_medication_course") {
      if ((change.doseAmount == null) !== (change.doseUnit == null)) {
        base.errorsJson.push("Medication dose amount and unit must be provided together.");
      }
      if (change.endDate && change.endDate < change.startDate) {
        base.errorsJson.push("Medication end date is before its start date.");
      }
      const matches = medications.filter(
        (row) => normalizeLabel(row.name) === normalizeLabel(change.name),
      );
      base.candidateMatchesJson.push(
        ...matches.map((row) => ({ entityType: "medication", entityId: row.id, label: row.name })),
      );
      if (
        matches.some(
          (row) => row.startDate === change.startDate && row.endDate === (change.endDate ?? null),
        )
      ) {
        base.errorsJson.push("An identical medication course is already recorded.");
      } else if (matches.some((row) => row.endDate == null || row.endDate >= change.startDate)) {
        base.warningsJson.push("A medication course with the same name overlaps this period.");
      }
    }
    if (change.kind === "end_medication_course") {
      const existing = await getMedication(change.medicationId);
      if (!existing || existing.profileId !== profileId) {
        base.errorsJson.push("The medication course was not found in this profile.");
      } else {
        base.beforeJson = { ...existing };
        base.entityId = existing.id;
        if (change.endDate < existing.startDate) {
          base.errorsJson.push("Medication end date is before its start date.");
        }
        if (existing.endDate != null) {
          base.errorsJson.push("This medication course already has an end date.");
        }
      }
    }
    if (change.kind === "change_medication_regimen") {
      const existing = await getMedication(change.medicationId);
      if (!existing || existing.profileId !== profileId) {
        base.errorsJson.push("The medication course was not found in this profile.");
      } else {
        base.beforeJson = { ...existing };
        base.entityId = existing.id;
        if (existing.endDate != null) {
          base.errorsJson.push("Only an active medication course can change regimen.");
        }
        if (change.effectiveDate <= existing.startDate) {
          base.errorsJson.push("The new regimen must start after the existing course.");
        }
      }
      if ((change.doseAmount == null) !== (change.doseUnit == null)) {
        base.errorsJson.push("Medication dose amount and unit must be provided together.");
      }
      const fields = Object.entries(change).filter(
        ([key, value]) =>
          !["kind", "medicationId", "effectiveDate", "assertionType"].includes(key) &&
          value != null,
      );
      if (!fields.length) base.errorsJson.push("No regimen changes were provided.");
    }
    if (change.kind === "log_medication_intake") {
      const existing = await getMedication(change.medicationId);
      if (!existing || existing.profileId !== profileId) {
        base.errorsJson.push("The medication course was not found in this profile.");
      } else {
        base.entityId = existing.id;
        const logs = await listMedicationLog(existing.id);
        if (logs.some((log) => log.takenAt.slice(0, 10) === change.date)) {
          base.errorsJson.push("Medication intake is already logged for this date.");
        }
      }
    }
    if (change.kind === "create_diagnosis") {
      if (change.status !== "active" && !change.resolvedDate) {
        base.errorsJson.push(
          "A remission or resolution date is required for an inactive diagnosis.",
        );
      }
      if (change.resolvedDate && change.resolvedDate < change.date) {
        base.errorsJson.push("Diagnosis resolution date is before the diagnosis date.");
      }
      const matches = diagnoses.filter(
        (row) => normalizeLabel(row.name) === normalizeLabel(change.name),
      );
      base.candidateMatchesJson.push(
        ...matches.map((row) => ({ entityType: "diagnosis", entityId: row.id, label: row.name })),
      );
      if (matches.some((row) => row.date === change.date && row.status === change.status)) {
        base.errorsJson.push("An identical diagnosis is already recorded.");
      } else if (matches.length) {
        base.warningsJson.push("A diagnosis with the same name already exists.");
      }
    }
    if (change.kind === "update_diagnosis_status") {
      const existing = diagnoses.find((row) => row.id === change.diagnosisId);
      if (!existing) {
        base.errorsJson.push("The diagnosis was not found in this profile.");
      } else {
        base.entityId = existing.id;
        base.beforeJson = { ...existing };
        if (existing.status === change.status) {
          base.errorsJson.push("The diagnosis already has this status.");
        }
        if (change.status !== "active" && !change.resolvedDate) {
          base.errorsJson.push("A remission or resolution date is required.");
        }
        if (change.resolvedDate && change.resolvedDate < existing.date) {
          base.errorsJson.push("Diagnosis resolution date is before the diagnosis date.");
        }
      }
    }
    if (change.kind === "create_allergy") {
      const matches = allergies.filter(
        (row) => normalizeLabel(row.allergen) === normalizeLabel(change.allergen),
      );
      base.candidateMatchesJson.push(
        ...matches.map((row) => ({ entityType: "allergy", entityId: row.id, label: row.allergen })),
      );
      if (matches.some((row) => row.status === "active" && row.severity === change.severity)) {
        base.errorsJson.push(
          "An active allergy with the same allergen and severity is already recorded.",
        );
      } else if (matches.length) {
        base.warningsJson.push("An allergy with the same allergen already exists.");
      }
    }
    if (change.kind === "update_allergy_status") {
      const existing = allergies.find((row) => row.id === change.allergyId);
      if (!existing) {
        base.errorsJson.push("The allergy was not found in this profile.");
      } else {
        base.entityId = existing.id;
        base.beforeJson = { ...existing };
        if (existing.status === change.status) {
          base.errorsJson.push("The allergy already has this status.");
        }
      }
    }
    if (change.kind === "log_symptom") {
      const duplicate = symptoms.find(
        (row) =>
          normalizeLabel(row.symptomName) === normalizeLabel(change.symptomName) &&
          row.date === change.date &&
          row.time === (change.time ?? null) &&
          row.severity === change.severity,
      );
      if (duplicate) {
        base.candidateMatchesJson.push({
          entityType: "symptom",
          entityId: duplicate.id,
          label: duplicate.symptomName,
        });
        base.errorsJson.push("An identical symptom event is already recorded.");
      }
    }
    if (change.kind === "log_weight") {
      const duplicate = weights.find(
        (row) => row.date === change.date && Math.abs(row.weightKg - change.weightKg) < 0.001,
      );
      if (duplicate) {
        base.candidateMatchesJson.push({
          entityType: "weight",
          entityId: duplicate.id,
          label: `${duplicate.weightKg} kg`,
        });
        base.errorsJson.push("An identical weight entry is already recorded.");
      }
    }
    if (change.kind === "log_blood_pressure") {
      if (change.systolic <= change.diastolic) {
        base.errorsJson.push("Systolic pressure must be higher than diastolic pressure.");
      }
      const duplicate = bloodPressures.find(
        (row) =>
          row.date === change.date &&
          row.time === (change.time ?? null) &&
          row.systolic === change.systolic &&
          row.diastolic === change.diastolic,
      );
      if (duplicate) {
        base.candidateMatchesJson.push({
          entityType: "blood_pressure",
          entityId: duplicate.id,
          label: `${duplicate.systolic}/${duplicate.diastolic}`,
        });
        base.errorsJson.push("An identical blood-pressure entry is already recorded.");
      }
      if (change.systolic > 180 || change.diastolic > 120) {
        base.warningsJson.push("This reading is in the crisis range and needs urgent attention.");
      }
    }
    if (change.kind === "merge_lifestyle_day") {
      const existing = await getLifestyleByDate(profileId, change.date);
      if (existing) {
        base.operation = "merge";
        base.entityId = existing.id;
        base.beforeJson = { ...existing };
      }
      const fields = Object.entries(change).filter(
        ([key, value]) => !["kind", "date", "assertionType"].includes(key) && value != null,
      );
      if (!fields.length) base.errorsJson.push("No lifestyle values were provided.");
    }
    if (change.kind === "create_visit") {
      const duplicate = visits.find(
        (row) =>
          row.date === change.date &&
          normalizeLabel(row.doctorName ?? "") === normalizeLabel(change.doctorName ?? "") &&
          normalizeLabel(row.clinic ?? "") === normalizeLabel(change.clinic ?? ""),
      );
      if (duplicate) {
        base.candidateMatchesJson.push({
          entityType: "visit",
          entityId: duplicate.id,
          label: duplicate.doctorName ?? duplicate.clinic ?? duplicate.date,
        });
        base.errorsJson.push("An identical visit is already recorded.");
      }
    }
    if (change.kind === "create_imaging_record") {
      const duplicate = imaging.find(
        (row) =>
          row.date === change.date &&
          row.modalityType === change.modalityType &&
          normalizeLabel(row.bodyArea) === normalizeLabel(change.bodyArea),
      );
      if (duplicate) {
        base.candidateMatchesJson.push({
          entityType: "imaging",
          entityId: duplicate.id,
          label: `${duplicate.modalityType} ${duplicate.bodyArea}`,
        });
        base.warningsJson.push("A matching imaging record already exists on this date.");
      }
    }
    if (change.kind === "create_vaccine") {
      if (change.expiresAt && change.expiresAt < change.date) {
        base.errorsJson.push("Vaccine expiry is before the administration date.");
      }
      const duplicate = vaccines.find(
        (row) =>
          row.date === change.date &&
          normalizeLabel(row.vaccineName) === normalizeLabel(change.vaccineName) &&
          row.dose === (change.doseNumber ?? null),
      );
      if (duplicate) {
        base.candidateMatchesJson.push({
          entityType: "vaccine",
          entityId: duplicate.id,
          label: duplicate.vaccineName,
        });
        base.errorsJson.push("An identical vaccine dose is already recorded.");
      }
    }
    if (change.kind === "create_retest_schedule") {
      const duplicate = retestSchedules.find(
        (row) => row.active && normalizeLabel(row.label) === normalizeLabel(change.label),
      );
      if (duplicate) {
        base.candidateMatchesJson.push({
          entityType: "retest_schedule",
          entityId: duplicate.id,
          label: duplicate.label,
        });
        base.errorsJson.push("An active retest schedule with the same label already exists.");
      }
    }
    if (change.kind === "update_profile_fact") {
      base.entityId = profileId;
      base.beforeJson = currentProfile ? { ...currentProfile } : null;
      if (!Object.keys(change.fields).length) {
        base.errorsJson.push("No profile fields were provided.");
      }
      if (change.fields.birthDate && change.fields.birthDate > localIsoDate()) {
        base.errorsJson.push("Birth date cannot be in the future.");
      }
      if (!currentProfile) base.errorsJson.push("The active profile was not found.");
    }
    base.status = base.errorsJson.length ? "blocked" : "ready";
    items.push(base);
  }
  const visitRefs = new Map<string, number>();
  for (let index = 0; index < parsed.items.length; index++) {
    const change = parsed.items[index];
    if (change.kind !== "create_visit" || !change.draftRef) continue;
    if (visitRefs.has(change.draftRef)) {
      items[index].errorsJson.push(`Duplicate draft reference: ${change.draftRef}.`);
    } else {
      visitRefs.set(change.draftRef, index);
    }
  }
  for (let index = 0; index < parsed.items.length; index++) {
    const change = parsed.items[index];
    const visitRef =
      change.kind === "create_diagnosis"
        ? change.visitDraftRef
        : change.kind === "create_medication_course"
          ? change.prescribedAtVisitRef
          : undefined;
    if (!visitRef) continue;
    const visitIndex = visitRefs.get(visitRef);
    if (visitIndex == null) {
      items[index].errorsJson.push(`Referenced visit draft was not found: ${visitRef}.`);
    } else if (visitIndex >= index) {
      items[index].errorsJson.push(`Referenced visit ${visitRef} must appear before this item.`);
    }
  }
  for (const item of items) item.status = item.errorsJson.length ? "blocked" : "ready";
  return {
    summary: parsed.summary,
    riskLevel: items.some((item) =>
      ["medication", "diagnosis", "allergy", "vaccine", "profile"].includes(item.entityType),
    )
      ? "elevated"
      : "standard",
    items,
  };
}

function baseItem(change: HealthChange): ValidatedChangeItem {
  const map: Record<
    HealthChange["kind"],
    { operation: ValidatedChangeItem["operation"]; entityType: string }
  > = {
    create_medication_course: { operation: "create", entityType: "medication" },
    end_medication_course: { operation: "end", entityType: "medication" },
    change_medication_regimen: { operation: "update", entityType: "medication" },
    log_medication_intake: { operation: "create", entityType: "medication_intake" },
    create_diagnosis: { operation: "create", entityType: "diagnosis" },
    update_diagnosis_status: { operation: "update", entityType: "diagnosis" },
    create_allergy: { operation: "create", entityType: "allergy" },
    update_allergy_status: { operation: "update", entityType: "allergy" },
    log_symptom: { operation: "create", entityType: "symptom" },
    log_weight: { operation: "create", entityType: "weight" },
    log_blood_pressure: { operation: "create", entityType: "blood_pressure" },
    merge_lifestyle_day: { operation: "create", entityType: "lifestyle" },
    create_health_note: { operation: "create", entityType: "health_note" },
    create_visit: { operation: "create", entityType: "visit" },
    create_imaging_record: { operation: "create", entityType: "imaging" },
    create_vaccine: { operation: "create", entityType: "vaccine" },
    create_retest_schedule: { operation: "create", entityType: "retest_schedule" },
    update_profile_fact: { operation: "update", entityType: "profile" },
  };
  return {
    ...map[change.kind],
    payloadJson: { ...change },
    beforeJson: null,
    status: "ready",
    warningsJson: [],
    errorsJson: [],
    candidateMatchesJson: [],
  };
}

function validateDates(change: HealthChange, errors: string[]): void {
  const dates = Object.entries(change).filter(
    ([key, value]) =>
      typeof value === "string" &&
      [
        "date",
        "startDate",
        "endDate",
        "onsetDate",
        "resolvedDate",
        "effectiveDate",
        "lastTestedDate",
      ].includes(key),
  ) as [string, string][];
  const today = localIsoDate();
  for (const [key, value] of dates) {
    if (!isCalendarDate(value)) errors.push(`${key} is not a valid calendar date.`);
    if (value > today) errors.push(`${key} cannot be in the future for a recorded health event.`);
  }
}

function isCalendarDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseHealthChangeSet(input: unknown): HealthChangeSetDraft {
  return healthChangeSetSchema.parse(input);
}
