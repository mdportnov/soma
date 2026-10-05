import { z } from "zod";
import { DELETABLE_ENTITY_TYPES } from "./record-edits";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalText = z.string().trim().min(1).nullable().optional();
const assertionType = z
  .enum(["user_reported", "clinician_diagnosed", "documented", "measured"])
  .default("user_reported");

const medication = z.object({
  kind: z.literal("create_medication_course"),
  draftRef: z.string().trim().min(1).max(50).optional(),
  prescribedAtVisitRef: z.string().trim().min(1).max(50).optional(),
  name: z.string().trim().min(1),
  medicationType: z.enum(["drug", "supplement"]),
  doseAmount: z.number().finite().positive().nullable().optional(),
  doseUnit: optionalText,
  frequency: optionalText,
  times: z
    .array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/))
    .max(8)
    .optional(),
  scheduleNotes: optionalText,
  asNeeded: z.boolean().default(false),
  startDate: isoDate,
  endDate: isoDate.nullable().optional(),
  purpose: optionalText,
  assertionType,
});

const endMedication = z.object({
  kind: z.literal("end_medication_course"),
  medicationId: z.number().int().positive(),
  endDate: isoDate,
  assertionType,
});

const changeMedication = z.object({
  kind: z.literal("change_medication_regimen"),
  medicationId: z.number().int().positive(),
  effectiveDate: isoDate,
  doseAmount: z.number().finite().positive().nullable().optional(),
  doseUnit: optionalText,
  frequency: optionalText,
  times: z
    .array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/))
    .max(8)
    .optional(),
  scheduleNotes: optionalText,
  asNeeded: z.boolean().optional(),
  purpose: optionalText,
  assertionType,
});

const medicationIntake = z.object({
  kind: z.literal("log_medication_intake"),
  medicationId: z.number().int().positive(),
  date: isoDate,
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .optional(),
  taken: z.boolean().default(true),
  assertionType,
});

const diagnosis = z.object({
  kind: z.literal("create_diagnosis"),
  draftRef: z.string().trim().min(1).max(50).optional(),
  visitDraftRef: z.string().trim().min(1).max(50).optional(),
  name: z.string().trim().min(1),
  icdCode: optionalText,
  date: isoDate,
  status: z.enum(["active", "remission", "resolved"]),
  resolvedDate: isoDate.nullable().optional(),
  notes: optionalText,
  assertionType,
});

const diagnosisStatus = z.object({
  kind: z.literal("update_diagnosis_status"),
  diagnosisId: z.number().int().positive(),
  status: z.enum(["active", "remission", "resolved"]),
  resolvedDate: isoDate.nullable().optional(),
  notes: optionalText,
  assertionType,
});

const allergy = z.object({
  kind: z.literal("create_allergy"),
  allergen: z.string().trim().min(1),
  category: z.enum(["drug", "food", "environmental", "other"]),
  severity: z.enum(["mild", "moderate", "severe", "anaphylactic"]),
  reaction: optionalText,
  onsetDate: isoDate.nullable().optional(),
  notes: optionalText,
  assertionType,
});

const allergyStatus = z.object({
  kind: z.literal("update_allergy_status"),
  allergyId: z.number().int().positive(),
  status: z.enum(["active", "resolved"]),
  assertionType,
});

const symptom = z.object({
  kind: z.literal("log_symptom"),
  symptomName: z.string().trim().min(1),
  severity: z.number().int().min(1).max(10),
  date: isoDate,
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .optional(),
  notes: optionalText,
  assertionType,
});

const weight = z.object({
  kind: z.literal("log_weight"),
  weightKg: z.number().finite().positive(),
  date: isoDate,
  notes: optionalText,
  assertionType,
});

const bloodPressure = z.object({
  kind: z.literal("log_blood_pressure"),
  systolic: z.number().int().min(40).max(300),
  diastolic: z.number().int().min(20).max(200),
  heartRateBpm: z.number().int().min(20).max(260).nullable().optional(),
  date: isoDate,
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .optional(),
  position: z.enum(["sitting", "standing", "supine"]).nullable().optional(),
  armSide: z.enum(["left", "right"]).nullable().optional(),
  notes: optionalText,
  assertionType,
});

const lifestyle = z.object({
  kind: z.literal("merge_lifestyle_day"),
  date: isoDate,
  sleepHours: z.number().min(0).max(24).nullable().optional(),
  sleepQuality: z.number().int().min(1).max(5).nullable().optional(),
  trainingMinutes: z.number().int().min(0).max(1440).nullable().optional(),
  trainingIntensity: z.enum(["light", "moderate", "intense"]).nullable().optional(),
  steps: z.number().int().min(0).max(200000).nullable().optional(),
  restingHeartRate: z.number().int().min(20).max(260).nullable().optional(),
  stressLevel: z.number().int().min(1).max(5).nullable().optional(),
  energyLevel: z.number().int().min(1).max(5).nullable().optional(),
  notes: optionalText,
  assertionType,
});

const healthNote = z.object({
  kind: z.literal("create_health_note"),
  category: z.enum(["general", "concern", "symptom_pattern", "treatment", "history", "other"]),
  title: optionalText,
  summary: optionalText,
  originalText: z.string().trim().min(1),
  date: isoDate.nullable().optional(),
  datePrecision: z.enum(["day", "month", "year", "approximate", "range", "unknown"]),
  dateRaw: optionalText,
  tags: z.array(z.string().trim().min(1)).max(12).default([]),
  assertionType,
});

const visit = z.object({
  kind: z.literal("create_visit"),
  draftRef: z.string().trim().min(1).max(50).optional(),
  date: isoDate,
  doctorName: optionalText,
  clinic: optionalText,
  city: optionalText,
  country: optionalText,
  specialty: optionalText,
  notes: optionalText,
  assertionType,
});

const imaging = z.object({
  kind: z.literal("create_imaging_record"),
  date: isoDate,
  modalityType: z.enum(["xray", "ct", "mri", "ultrasound", "pet", "other"]),
  bodyArea: z.string().trim().min(1),
  findings: optionalText,
  radiologistName: optionalText,
  clinic: optionalText,
  city: optionalText,
  country: optionalText,
  assertionType,
});

const vaccine = z.object({
  kind: z.literal("create_vaccine"),
  vaccineName: z.string().trim().min(1),
  date: isoDate,
  doseNumber: z.number().int().positive().nullable().optional(),
  manufacturer: optionalText,
  batchNumber: optionalText,
  expiresAt: isoDate.nullable().optional(),
  administeredBy: optionalText,
  country: optionalText,
  notes: optionalText,
  assertionType,
});

const retestSchedule = z.object({
  kind: z.literal("create_retest_schedule"),
  label: z.string().trim().min(1),
  intervalMonths: z.number().int().min(1).max(120),
  lastTestedDate: isoDate.nullable().optional(),
  notes: optionalText,
  assertionType,
});

const profileFacts = z.object({
  kind: z.literal("update_profile_fact"),
  fields: z.object({
    birthDate: isoDate.nullable().optional(),
    sex: z.enum(["male", "female", "other"]).nullable().optional(),
    heightCm: z.number().min(50).max(260).nullable().optional(),
    bloodType: z.enum(["A", "B", "AB", "O"]).nullable().optional(),
    rhFactor: z.enum(["positive", "negative"]).nullable().optional(),
    ethnicity: optionalText,
    activityLevel: z
      .enum(["sedentary", "light", "moderate", "active", "very_active"])
      .nullable()
      .optional(),
    smoking: z.enum(["never", "former", "current"]).nullable().optional(),
    alcohol: z.enum(["none", "occasional", "moderate", "heavy"]).nullable().optional(),
    pregnancyStatus: z
      .enum(["not_pregnant", "pregnant", "postpartum", "unknown"])
      .nullable()
      .optional(),
    citizenship: optionalText,
    languages: optionalText,
    emergencyNotes: optionalText,
  }),
  assertionType,
});

// Edits of existing rows: every field is optional (omitted = unchanged) and a
// nullable one can be cleared with null. Fields map onto columns through
// UPDATE_SPECS in record-edits.ts.
const recordId = z.number().int().positive();
const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const updateMedication = z.object({
  kind: z.literal("update_medication"),
  medicationId: recordId,
  name: z.string().trim().min(1).optional(),
  medicationType: z.enum(["drug", "supplement"]).optional(),
  doseAmount: z.number().finite().positive().nullable().optional(),
  doseUnit: optionalText,
  asNeeded: z.boolean().optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.nullable().optional(),
  purpose: optionalText,
  assertionType,
});

const updateDiagnosis = z.object({
  kind: z.literal("update_diagnosis"),
  diagnosisId: recordId,
  name: z.string().trim().min(1).optional(),
  icdCode: optionalText,
  date: isoDate.optional(),
  status: z.enum(["active", "remission", "resolved"]).optional(),
  resolvedDate: isoDate.nullable().optional(),
  notes: optionalText,
  assertionType,
});

const updateAllergy = z.object({
  kind: z.literal("update_allergy"),
  allergyId: recordId,
  allergen: z.string().trim().min(1).optional(),
  category: z.enum(["drug", "food", "environmental", "other"]).optional(),
  severity: z.enum(["mild", "moderate", "severe", "anaphylactic"]).optional(),
  reaction: optionalText,
  onsetDate: isoDate.nullable().optional(),
  status: z.enum(["active", "resolved"]).optional(),
  notes: optionalText,
  assertionType,
});

const updateVaccine = z.object({
  kind: z.literal("update_vaccine"),
  vaccineId: recordId,
  vaccineName: z.string().trim().min(1).optional(),
  date: isoDate.optional(),
  doseNumber: z.number().int().positive().nullable().optional(),
  manufacturer: optionalText,
  batchNumber: optionalText,
  expiresAt: isoDate.nullable().optional(),
  administeredBy: optionalText,
  country: optionalText,
  notes: optionalText,
  assertionType,
});

const updateVisit = z.object({
  kind: z.literal("update_visit"),
  visitId: recordId,
  date: isoDate.optional(),
  doctorName: optionalText,
  clinic: optionalText,
  city: optionalText,
  country: optionalText,
  specialty: optionalText,
  notes: optionalText,
  assertionType,
});

const updateImaging = z.object({
  kind: z.literal("update_imaging_record"),
  imagingId: recordId,
  date: isoDate.optional(),
  modalityType: z.enum(["xray", "ct", "mri", "ultrasound", "pet", "other"]).optional(),
  bodyArea: z.string().trim().min(1).optional(),
  findings: optionalText,
  radiologistName: optionalText,
  clinic: optionalText,
  city: optionalText,
  country: optionalText,
  assertionType,
});

const updateHealthNote = z.object({
  kind: z.literal("update_health_note"),
  healthNoteId: recordId,
  category: z
    .enum(["general", "concern", "symptom_pattern", "treatment", "history", "other"])
    .optional(),
  title: optionalText,
  summary: optionalText,
  originalText: z.string().trim().min(1).optional(),
  date: isoDate.nullable().optional(),
  datePrecision: z.enum(["day", "month", "year", "approximate", "range", "unknown"]).optional(),
  dateRaw: optionalText,
  tags: z.array(z.string().trim().min(1)).max(12).optional(),
  assertionType,
});

const updateSymptom = z.object({
  kind: z.literal("update_symptom"),
  symptomId: recordId,
  symptomName: z.string().trim().min(1).optional(),
  severity: z.number().int().min(1).max(10).optional(),
  date: isoDate.optional(),
  time: clockTime.nullable().optional(),
  notes: optionalText,
  assertionType,
});

const updateWeight = z.object({
  kind: z.literal("update_weight"),
  weightId: recordId,
  weightKg: z.number().finite().positive().optional(),
  date: isoDate.optional(),
  notes: optionalText,
  assertionType,
});

const updateBloodPressure = z.object({
  kind: z.literal("update_blood_pressure"),
  bloodPressureId: recordId,
  systolic: z.number().int().min(40).max(300).optional(),
  diastolic: z.number().int().min(20).max(200).optional(),
  heartRateBpm: z.number().int().min(20).max(260).nullable().optional(),
  date: isoDate.optional(),
  time: clockTime.nullable().optional(),
  position: z.enum(["sitting", "standing", "supine"]).nullable().optional(),
  armSide: z.enum(["left", "right"]).nullable().optional(),
  notes: optionalText,
  assertionType,
});

const updateRetestSchedule = z.object({
  kind: z.literal("update_retest_schedule"),
  retestScheduleId: recordId,
  label: z.string().trim().min(1).optional(),
  intervalMonths: z.number().int().min(1).max(120).optional(),
  lastTestedDate: isoDate.nullable().optional(),
  notes: optionalText,
  active: z.boolean().optional(),
  assertionType,
});

const deleteRecord = z.object({
  kind: z.literal("delete_record"),
  entityType: z.enum(DELETABLE_ENTITY_TYPES),
  entityId: recordId,
  reason: z.string().trim().min(1),
});

export const healthChangeSchema = z.discriminatedUnion("kind", [
  medication,
  endMedication,
  changeMedication,
  medicationIntake,
  diagnosis,
  diagnosisStatus,
  allergy,
  allergyStatus,
  symptom,
  weight,
  bloodPressure,
  lifestyle,
  healthNote,
  visit,
  imaging,
  vaccine,
  retestSchedule,
  profileFacts,
  updateMedication,
  updateDiagnosis,
  updateAllergy,
  updateVaccine,
  updateVisit,
  updateImaging,
  updateHealthNote,
  updateSymptom,
  updateWeight,
  updateBloodPressure,
  updateRetestSchedule,
  deleteRecord,
]);

export const healthChangeSetSchema = z.object({
  summary: z.string().trim().min(1),
  items: z.array(healthChangeSchema).min(1).max(20),
});

export type HealthChange = z.infer<typeof healthChangeSchema>;
export type HealthChangeSetDraft = z.infer<typeof healthChangeSetSchema>;

export function healthChangeSetJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(healthChangeSetSchema, { target: "draft-2020-12" });
  const { $schema: _, ...rest } = schema;
  return rest;
}
