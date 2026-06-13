import { sql } from "drizzle-orm";
import { sqliteTable, integer, text, real, index } from "drizzle-orm/sqlite-core";

/**
 * Drizzle schema — single source of truth for the local SQLite database.
 *
 * Conventions:
 * - Dates ("date", "birth_date", "start_date", …) are ISO-8601 `YYYY-MM-DD` strings —
 *   sortable, timezone-free (a lab draw belongs to a calendar day, not an instant).
 * - Timestamps ("created_at", "taken_at") are ISO-8601 datetime strings (UTC).
 * - JSON columns use `text` with `{ mode: "json" }` and a typed shape.
 */

// ── profile ────────────────────────────────────────────────────────────────
// Single-user in MVP; multi-profile ready (family / sharing).
export const profile = sqliteTable("profile", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  birthDate: text("birth_date"),
  /** Biological sex — drives sex-specific biomarker reference ranges. */
  sex: text("sex", { enum: ["male", "female", "other"] }),
  /** Canonical metric storage; UI converts per `unitSystem`. */
  heightCm: real("height_cm"),
  weightKg: real("weight_kg"),
  targetWeightKg: real("target_weight_kg"),
  /** ABO blood group + Rh, kept as separate optional fields. */
  bloodType: text("blood_type", { enum: ["A", "B", "AB", "O"] }),
  rhFactor: text("rh_factor", { enum: ["positive", "negative"] }),
  /** Free-text ethnicity — affects some reference ranges (e.g. eGFR, CBC). */
  ethnicity: text("ethnicity"),
  activityLevel: text("activity_level", {
    enum: ["sedentary", "light", "moderate", "active", "very_active"],
  }),
  smoking: text("smoking", { enum: ["never", "former", "current"] }),
  alcohol: text("alcohol", { enum: ["none", "occasional", "moderate", "heavy"] }),
  /** Free-text chronic conditions / notes. */
  conditions: text("conditions"),
  /** Preferred display unit system. */
  unitSystem: text("unit_system", { enum: ["metric", "imperial"] })
    .notNull()
    .default("metric"),
  /** Emergency contact — surfaced on the emergency card export. */
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactPhone: text("emergency_contact_phone"),
  emergencyContactRelation: text("emergency_contact_relation"),
  /** Secondary emergency-card identity: citizenship + languages the user speaks. */
  citizenship: text("citizenship"),
  languages: text("languages"),
  /** Travel/health insurance — insurer, policy number, 24/7 assistance phone. */
  insurer: text("insurer"),
  insurancePolicyNumber: text("insurance_policy_number"),
  insurancePhone: text("insurance_phone"),
  /** Free-form critical notes: pacemaker, implants, transfusion refusal, … */
  emergencyNotes: text("emergency_notes"),
  /** Pregnancy status — safety-critical for ER drug/imaging decisions. */
  pregnancyStatus: text("pregnancy_status", {
    enum: ["not_pregnant", "pregnant", "postpartum", "unknown"],
  }),
  /** Resuscitation preference surfaced on the emergency card. */
  codeStatus: text("code_status", { enum: ["full_code", "dnr", "dni"] }),
  /** Organ donor registration. */
  organDonor: integer("organ_donor", { mode: "boolean" }),
  /** Set when onboarding is completed; null = onboarding not done. */
  onboardedAt: text("onboarded_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
});

// ── biomarker (reference dictionary) ───────────────────────────────────────
export const biomarker = sqliteTable(
  "biomarker",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** LOINC code where known (optional). */
    code: text("code"),
    canonicalName: text("canonical_name").notNull(),
    category: text("category").notNull(),
    /** Synonyms and translations used by the import mapper. */
    aliases: text("aliases", { mode: "json" }).$type<string[]>().notNull().default([]),
    defaultUnit: text("default_unit").notNull(),
    refLow: real("ref_low"),
    refHigh: real("ref_high"),
    optimalLow: real("optimal_low"),
    optimalHigh: real("optimal_high"),
    direction: text("direction", {
      enum: ["higher_better", "lower_better", "range"],
    })
      .notNull()
      .default("range"),
    isCustom: integer("is_custom", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("biomarker_name_idx").on(t.canonicalName)],
);

// ── biomarker_reference_range (demographic overrides) ──────────────────────
// Optional sex-/age-specific ranges that override the biomarker's generic
// refLow/refHigh when a matching profile context exists. A null sex/age bound
// means "any". computeFlag picks the most specific matching row, else falls
// back to the biomarker's own range.
export const biomarkerReferenceRange = sqliteTable(
  "biomarker_reference_range",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    biomarkerId: integer("biomarker_id")
      .notNull()
      .references(() => biomarker.id, { onDelete: "cascade" }),
    /** null = applies to any sex. */
    sex: text("sex", { enum: ["male", "female"] }),
    /** Inclusive age bounds in years; null = unbounded. */
    ageMinYears: integer("age_min_years"),
    ageMaxYears: integer("age_max_years"),
    /** Special physiological state, e.g. "pregnancy"; null = none. */
    condition: text("condition"),
    refLow: real("ref_low"),
    refHigh: real("ref_high"),
    optimalLow: real("optimal_low"),
    optimalHigh: real("optimal_high"),
  },
  (t) => [index("biomarker_ref_range_idx").on(t.biomarkerId)],
);

// ── attachment ─────────────────────────────────────────────────────────────
// Declared before lab_panel because lab_panel.source_file_id references it.
export const attachment = sqliteTable("attachment", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  profileId: integer("profile_id")
    .notNull()
    .references(() => profile.id),
  filePath: text("file_path").notNull(),
  mimeType: text("mime_type").notNull(),
  kind: text("kind", {
    enum: ["lab_pdf", "photo", "discharge", "imaging", "vaccination_cert", "other"],
  })
    .notNull()
    .default("other"),
  /** Polymorphic link: "lab_panel" | "visit" | "medication" | "diagnosis" | … */
  linkedEntityType: text("linked_entity_type"),
  linkedEntityId: integer("linked_entity_id"),
});

// ── lab_panel (one lab-draw event) ─────────────────────────────────────────
export const labPanel = sqliteTable(
  "lab_panel",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    profileId: integer("profile_id")
      .notNull()
      .references(() => profile.id),
    date: text("date").notNull(),
    labName: text("lab_name"),
    city: text("city"),
    country: text("country"),
    panelType: text("panel_type", { enum: ["blood", "urine", "other"] })
      .notNull()
      .default("blood"),
    /** Optional HH:MM draw time — diurnal markers (cortisol, testosterone, iron). */
    collectionTime: text("collection_time"),
    /** Fasting state at draw; null = unknown. Drives glucose/lipid interpretation. */
    fasting: integer("fasting", { mode: "boolean" }),
    /** Menstrual cycle day at draw (1 = first day of period); null = n/a. */
    menstrualCycleDay: integer("menstrual_cycle_day"),
    /** Free-text panel context: assay/method, "2h post-meal", lab certification… */
    notes: text("notes"),
    sourceFileId: integer("source_file_id").references(() => attachment.id),
    importMethod: text("import_method", { enum: ["manual", "ai"] })
      .notNull()
      .default("manual"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => [index("lab_panel_profile_date_idx").on(t.profileId, t.date)],
);

// ── lab_result ─────────────────────────────────────────────────────────────
export const labResult = sqliteTable(
  "lab_result",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    panelId: integer("panel_id")
      .notNull()
      .references(() => labPanel.id, { onDelete: "cascade" }),
    biomarkerId: integer("biomarker_id")
      .notNull()
      .references(() => biomarker.id),
    value: real("value").notNull(),
    unit: text("unit").notNull(),
    /** Value converted to the biomarker's default unit (when conversion is known). */
    unitNormalized: text("unit_normalized"),
    valueNormalized: real("value_normalized"),
    outOfRange: integer("out_of_range", { mode: "boolean" }).notNull().default(false),
    flag: text("flag", { enum: ["low", "high", "critical"] }),
    /** Original label string from the source document — mapping audit trail. */
    rawLabel: text("raw_label"),
  },
  (t) => [
    index("lab_result_panel_idx").on(t.panelId),
    index("lab_result_biomarker_idx").on(t.biomarkerId),
  ],
);

// ── visit ──────────────────────────────────────────────────────────────────
export const visit = sqliteTable(
  "visit",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    profileId: integer("profile_id")
      .notNull()
      .references(() => profile.id),
    date: text("date").notNull(),
    doctorName: text("doctor_name"),
    clinic: text("clinic"),
    city: text("city"),
    country: text("country"),
    specialty: text("specialty"),
    notes: text("notes"),
  },
  (t) => [index("visit_profile_date_idx").on(t.profileId, t.date)],
);

// ── prescription ───────────────────────────────────────────────────────────
// A prescription is a structured record of what was prescribed. It survives
// visit deletion (visitId is set null, not cascaded) because medication rows
// reference it; user-facing removal is archival, not hard delete.
export const prescription = sqliteTable("prescription", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  visitId: integer("visit_id").references(() => visit.id, { onDelete: "set null" }),
  drugName: text("drug_name"),
  doseAmount: real("dose_amount"),
  doseUnit: text("dose_unit"),
  frequency: text("frequency"),
  durationDays: integer("duration_days"),
  refills: integer("refills"),
  notes: text("notes"),
  sourceLinks: text("source_links", { mode: "json" }).$type<string[]>().notNull().default([]),
  archivedAt: text("archived_at"),
});

// ── medication (drugs and supplements, with intake period) ────────────────
export type MedicationSchedule = {
  /** e.g. "daily", "2x_daily", "weekly", "as_needed", "custom" */
  frequency: string;
  /** Times of day, e.g. ["08:00", "20:00"]. */
  times?: string[];
  /** Free-form, e.g. "with food", "5 days on / 2 off". */
  notes?: string;
};

export const medication = sqliteTable(
  "medication",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    profileId: integer("profile_id")
      .notNull()
      .references(() => profile.id),
    name: text("name").notNull(),
    type: text("type", { enum: ["drug", "supplement"] })
      .notNull()
      .default("supplement"),
    doseAmount: real("dose_amount"),
    doseUnit: text("dose_unit"),
    schedule: text("schedule", { mode: "json" }).$type<MedicationSchedule>(),
    /** PRN ("as needed") — not a standing daily med; surfaced separately. */
    asNeeded: integer("as_needed", { mode: "boolean" }).notNull().default(false),
    startDate: text("start_date").notNull(),
    /** null = currently taking. */
    endDate: text("end_date"),
    purpose: text("purpose"),
    prescriptionId: integer("prescription_id").references(() => prescription.id),
  },
  (t) => [index("medication_profile_idx").on(t.profileId)],
);

// ── medication_log (optional adherence tracking) ───────────────────────────
export const medicationLog = sqliteTable(
  "medication_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    medicationId: integer("medication_id")
      .notNull()
      .references(() => medication.id, { onDelete: "cascade" }),
    takenAt: text("taken_at").notNull(),
    taken: integer("taken", { mode: "boolean" }).notNull().default(true),
  },
  (t) => [index("medication_log_med_idx").on(t.medicationId)],
);

// ── diagnosis ──────────────────────────────────────────────────────────────
export const diagnosis = sqliteTable(
  "diagnosis",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    profileId: integer("profile_id")
      .notNull()
      .references(() => profile.id),
    name: text("name").notNull(),
    icdCode: text("icd_code"),
    date: text("date").notNull(),
    status: text("status", { enum: ["active", "remission", "resolved"] })
      .notNull()
      .default("active"),
    notes: text("notes"),
    /** Set when status becomes resolved/remission; informational, user-editable. */
    resolvedDate: text("resolved_date"),
    visitId: integer("visit_id").references(() => visit.id),
  },
  (t) => [index("diagnosis_profile_idx").on(t.profileId)],
);

// ── allergy ────────────────────────────────────────────────────────────────
export const allergy = sqliteTable(
  "allergy",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    profileId: integer("profile_id")
      .notNull()
      .references(() => profile.id),
    /** Free text — allergy names vary across countries/languages; no dictionary. */
    allergen: text("allergen").notNull(),
    category: text("category", { enum: ["drug", "food", "environmental", "other"] })
      .notNull()
      .default("other"),
    severity: text("severity", {
      enum: ["mild", "moderate", "severe", "anaphylactic"],
    }).notNull(),
    reaction: text("reaction"),
    onsetDate: text("onset_date"),
    status: text("status", { enum: ["active", "resolved"] })
      .notNull()
      .default("active"),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => [index("allergy_profile_idx").on(t.profileId)],
);

// ── vaccine ────────────────────────────────────────────────────────────────
// Append-only historical record: no user-visible delete, edit for typo fixes.
export const vaccine = sqliteTable(
  "vaccine",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    profileId: integer("profile_id")
      .notNull()
      .references(() => profile.id),
    vaccineName: text("vaccine_name").notNull(),
    /** Administration date. */
    date: text("date").notNull(),
    manufacturer: text("manufacturer"),
    batchNumber: text("batch_number"),
    /** Dose number within a multi-dose series (1 of 3). */
    dose: integer("dose"),
    /** Validity end (e.g. yellow fever +10y); expiry is computed, never stored. */
    expiresAt: text("expires_at"),
    administeredBy: text("administered_by"),
    country: text("country"),
    notes: text("notes"),
    attachmentId: integer("attachment_id").references(() => attachment.id),
  },
  (t) => [index("vaccine_profile_date_idx").on(t.profileId, t.date)],
);

// ── symptom_log ────────────────────────────────────────────────────────────
// Point events (not periods): free-text names, severity 1–10 (app-level check).
export const symptomLog = sqliteTable(
  "symptom_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    profileId: integer("profile_id")
      .notNull()
      .references(() => profile.id),
    date: text("date").notNull(),
    /** Optional HH:MM — multiple entries per day are allowed. */
    time: text("time"),
    symptomName: text("symptom_name").notNull(),
    severity: integer("severity").notNull(),
    notes: text("notes"),
    visitId: integer("visit_id").references(() => visit.id),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => [
    index("symptom_profile_date_idx").on(t.profileId, t.date),
    index("symptom_name_idx").on(t.symptomName),
  ],
);

// ── imaging_record (MRI / CT / X-ray / ultrasound studies) ─────────────────
export const imagingRecord = sqliteTable(
  "imaging_record",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    profileId: integer("profile_id")
      .notNull()
      .references(() => profile.id),
    date: text("date").notNull(),
    modalityType: text("modality_type", {
      enum: ["xray", "ct", "mri", "ultrasound", "pet", "other"],
    }).notNull(),
    bodyArea: text("body_area").notNull(),
    findings: text("findings"),
    radiologistName: text("radiologist_name"),
    clinic: text("clinic"),
    city: text("city"),
    country: text("country"),
    visitId: integer("visit_id").references(() => visit.id),
    attachmentId: integer("attachment_id").references(() => attachment.id),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => [index("imaging_profile_date_idx").on(t.profileId, t.date)],
);

// ── weight_log / bp_log (home measurements; charts + overlays, not timeline) ─
export const weightLog = sqliteTable(
  "weight_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    profileId: integer("profile_id")
      .notNull()
      .references(() => profile.id),
    date: text("date").notNull(),
    /** Canonical metric storage, same convention as profile.weightKg. */
    weightKg: real("weight_kg").notNull(),
    notes: text("notes"),
  },
  (t) => [index("weight_log_profile_date_idx").on(t.profileId, t.date)],
);

export const bpLog = sqliteTable(
  "bp_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    profileId: integer("profile_id")
      .notNull()
      .references(() => profile.id),
    date: text("date").notNull(),
    time: text("time"),
    systolic: integer("systolic").notNull(),
    diastolic: integer("diastolic").notNull(),
    heartRateBpm: integer("heart_rate_bpm"),
    position: text("position", { enum: ["sitting", "standing", "supine"] }),
    armSide: text("arm_side", { enum: ["left", "right"] }),
    notes: text("notes"),
  },
  (t) => [index("bp_log_profile_date_idx").on(t.profileId, t.date)],
);

// ── Inferred row types ─────────────────────────────────────────────────────
export type Profile = typeof profile.$inferSelect;
export type NewProfile = typeof profile.$inferInsert;
export type Biomarker = typeof biomarker.$inferSelect;
export type NewBiomarker = typeof biomarker.$inferInsert;
export type BiomarkerReferenceRange = typeof biomarkerReferenceRange.$inferSelect;
export type NewBiomarkerReferenceRange = typeof biomarkerReferenceRange.$inferInsert;
export type LabPanel = typeof labPanel.$inferSelect;
export type NewLabPanel = typeof labPanel.$inferInsert;
export type LabResult = typeof labResult.$inferSelect;
export type NewLabResult = typeof labResult.$inferInsert;
export type Medication = typeof medication.$inferSelect;
export type NewMedication = typeof medication.$inferInsert;
export type MedicationLog = typeof medicationLog.$inferSelect;
export type Visit = typeof visit.$inferSelect;
export type NewVisit = typeof visit.$inferInsert;
export type Diagnosis = typeof diagnosis.$inferSelect;
export type NewDiagnosis = typeof diagnosis.$inferInsert;
export type Prescription = typeof prescription.$inferSelect;
export type NewPrescription = typeof prescription.$inferInsert;
export type Attachment = typeof attachment.$inferSelect;
export type NewAttachment = typeof attachment.$inferInsert;
export type Allergy = typeof allergy.$inferSelect;
export type NewAllergy = typeof allergy.$inferInsert;
export type Vaccine = typeof vaccine.$inferSelect;
export type NewVaccine = typeof vaccine.$inferInsert;
export type SymptomLog = typeof symptomLog.$inferSelect;
export type NewSymptomLog = typeof symptomLog.$inferInsert;
export type ImagingRecord = typeof imagingRecord.$inferSelect;
export type NewImagingRecord = typeof imagingRecord.$inferInsert;
export type WeightLog = typeof weightLog.$inferSelect;
export type NewWeightLog = typeof weightLog.$inferInsert;
export type BpLog = typeof bpLog.$inferSelect;
export type NewBpLog = typeof bpLog.$inferInsert;
