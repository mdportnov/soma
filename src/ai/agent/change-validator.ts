import {
  healthChangeSetSchema,
  type HealthChange,
  type HealthChangeSetDraft,
} from "./change-schema";
import { antigenIdsOf } from "@/lib/vaccine-schedule";
import {
  countMedicationLogEntries,
  getHealthNote,
  getLifestyleByDate,
  getMedication,
  getPanel,
  getPanelResults,
  getProfile,
  listLifestyleLog,
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
import {
  UPDATE_SPECS,
  changedFields,
  isUpdateKind,
  mergedRow,
  type DeletableEntityType,
  type UpdateKind,
} from "./record-edits";

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
  const loadRow = async (
    entityType: string,
    id: number,
  ): Promise<Record<string, unknown> | null> => {
    const fromList = <T extends { id: number }>(rows: T[]) =>
      rows.find((row) => row.id === id) ?? null;
    const owned = <T extends { profileId: number }>(row: T | null) =>
      row && row.profileId === profileId ? row : null;
    if (entityType === "medication") return owned(await getMedication(id));
    if (entityType === "diagnosis") return fromList(diagnoses);
    if (entityType === "allergy") return fromList(allergies);
    if (entityType === "vaccine") return fromList(vaccines);
    if (entityType === "visit") return fromList(visits);
    if (entityType === "imaging") return fromList(imaging);
    if (entityType === "health_note") return owned(await getHealthNote(id));
    if (entityType === "symptom") return fromList(symptoms);
    if (entityType === "weight") return fromList(weights);
    if (entityType === "blood_pressure") return fromList(bloodPressures);
    if (entityType === "retest_schedule") return fromList(retestSchedules);
    if (entityType === "lifestyle") return fromList(await listLifestyleLog(profileId));
    if (entityType === "lab_panel") return owned(await getPanel(id));
    return null;
  };
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
      } else {
        // Same day, same disease under another name (Tdap vs a stored "Td").
        const covers = antigenIdsOf({ vaccineName: change.vaccineName, date: change.date });
        const sameAntigen = vaccines.find(
          (row) => row.date === change.date && antigenIdsOf(row).some((id) => covers.includes(id)),
        );
        if (sameAntigen) {
          base.candidateMatchesJson.push({
            entityType: "vaccine",
            entityId: sameAntigen.id,
            label: sameAntigen.vaccineName,
          });
          base.warningsJson.push(
            `A shot against the same disease (${sameAntigen.vaccineName}) is already recorded on this date.`,
          );
        }
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
    if (isUpdateKind(change.kind)) {
      await validateUpdate(change.kind, change as Record<string, unknown>, base, loadRow);
    }
    if (change.kind === "delete_record") {
      base.entityType = change.entityType;
      base.entityId = change.entityId;
      const existing = await loadRow(change.entityType, change.entityId);
      if (!existing) {
        base.errorsJson.push("The record to delete was not found in this profile.");
      } else {
        base.beforeJson = { ...existing };
        await describeDeleteImpact(change.entityType, existing, base);
      }
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
  // Two items aimed at one stored record would be checked against the same
  // "before" and could neither be validated nor undone as a pair.
  const targeted = new Map<string, number>();
  items.forEach((item, index) => {
    if (item.operation === "create" || item.entityId == null) return;
    const key = `${item.entityType}:${item.entityId}`;
    if (targeted.has(key)) {
      item.errorsJson.push("This record is already changed by another item of this draft.");
    } else {
      targeted.set(key, index);
    }
  });
  for (const item of items) item.status = item.errorsJson.length ? "blocked" : "ready";
  return {
    summary: parsed.summary,
    riskLevel: items.some((item) => item.operation === "delete")
      ? "destructive"
      : items.some((item) =>
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
    update_medication: { operation: "update", entityType: "medication" },
    update_diagnosis: { operation: "update", entityType: "diagnosis" },
    update_allergy: { operation: "update", entityType: "allergy" },
    update_vaccine: { operation: "update", entityType: "vaccine" },
    update_visit: { operation: "update", entityType: "visit" },
    update_imaging_record: { operation: "update", entityType: "imaging" },
    update_health_note: { operation: "update", entityType: "health_note" },
    update_symptom: { operation: "update", entityType: "symptom" },
    update_weight: { operation: "update", entityType: "weight" },
    update_blood_pressure: { operation: "update", entityType: "blood_pressure" },
    update_retest_schedule: { operation: "update", entityType: "retest_schedule" },
    delete_record: { operation: "delete", entityType: "record" },
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

/**
 * An edit is checked on the row it would produce, not on the patch alone: a
 * new end date is only wrong relative to the start date already stored.
 */
async function validateUpdate(
  kind: UpdateKind,
  change: Record<string, unknown>,
  base: ValidatedChangeItem,
  loadRow: (entityType: string, id: number) => Promise<Record<string, unknown> | null>,
): Promise<void> {
  const spec = UPDATE_SPECS[kind];
  const existing = await loadRow(spec.entityType, change[spec.idKey] as number);
  if (!existing) {
    base.errorsJson.push("The record to update was not found in this profile.");
    return;
  }
  base.entityId = existing.id as number;
  base.beforeJson = { ...existing };
  if (!changedFields(kind, existing, change).length) {
    base.errorsJson.push("No changes: the record already has these values.");
    return;
  }
  const after = mergedRow(kind, existing, change);
  const before = (key: string, a: unknown, b: unknown) =>
    typeof a === "string" && typeof b === "string" && a < b ? key : null;
  if (kind === "update_medication") {
    if ((after.doseAmount == null) !== (after.doseUnit == null)) {
      base.errorsJson.push("Medication dose amount and unit must be provided together.");
    }
    if (before("endDate", after.endDate, after.startDate)) {
      base.errorsJson.push("Medication end date is before its start date.");
    }
  }
  if (kind === "update_diagnosis") {
    if (after.status !== "active" && !after.resolvedDate) {
      base.errorsJson.push("A remission or resolution date is required for an inactive diagnosis.");
    }
    if (after.status === "active" && after.resolvedDate) {
      base.errorsJson.push("An active diagnosis cannot keep a resolution date; set it to null.");
    }
    if (before("resolvedDate", after.resolvedDate, after.date)) {
      base.errorsJson.push("Diagnosis resolution date is before the diagnosis date.");
    }
  }
  if (kind === "update_allergy" && existing.severity === "anaphylactic") {
    if (after.severity !== "anaphylactic") {
      base.warningsJson.push("This lowers the severity of an anaphylactic allergy.");
    }
  }
  if (kind === "update_vaccine" && before("expiresAt", after.expiresAt, after.date)) {
    base.errorsJson.push("Vaccine expiry is before the administration date.");
  }
  if (kind === "update_blood_pressure") {
    if ((after.systolic as number) <= (after.diastolic as number)) {
      base.errorsJson.push("Systolic pressure must be higher than diastolic pressure.");
    }
  }
}

async function describeDeleteImpact(
  entityType: DeletableEntityType,
  existing: Record<string, unknown>,
  base: ValidatedChangeItem,
): Promise<void> {
  const id = existing.id as number;
  if (entityType === "allergy" && existing.severity === "anaphylactic") {
    base.errorsJson.push(
      "An anaphylactic allergy cannot be deleted; mark it resolved instead (update_allergy).",
    );
  }
  if (entityType === "medication") {
    const logs = await countMedicationLogEntries(id);
    if (logs) base.warningsJson.push(`Its ${logs} intake log entries are deleted with it.`);
  }
  if (entityType === "visit") {
    base.warningsJson.push(
      "Diagnoses, prescriptions, symptoms and imaging linked to this visit are kept but unlinked.",
    );
  }
  if (entityType === "lab_panel") {
    const results = await getPanelResults(id);
    base.warningsJson.push(`All ${results.length} results of this lab panel are deleted with it.`);
  }
  base.warningsJson.push("Deleting cannot be undone from the chat.");
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
