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

// ── attachment ─────────────────────────────────────────────────────────────
// Declared before lab_panel because lab_panel.source_file_id references it.
export const attachment = sqliteTable("attachment", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  profileId: integer("profile_id")
    .notNull()
    .references(() => profile.id),
  filePath: text("file_path").notNull(),
  mimeType: text("mime_type").notNull(),
  kind: text("kind", { enum: ["lab_pdf", "photo", "discharge", "other"] })
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
export const prescription = sqliteTable("prescription", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  visitId: integer("visit_id")
    .notNull()
    .references(() => visit.id, { onDelete: "cascade" }),
  notes: text("notes"),
  sourceLinks: text("source_links", { mode: "json" }).$type<string[]>().notNull().default([]),
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
    visitId: integer("visit_id").references(() => visit.id),
  },
  (t) => [index("diagnosis_profile_idx").on(t.profileId)],
);

// ── Inferred row types ─────────────────────────────────────────────────────
export type Profile = typeof profile.$inferSelect;
export type NewProfile = typeof profile.$inferInsert;
export type Biomarker = typeof biomarker.$inferSelect;
export type NewBiomarker = typeof biomarker.$inferInsert;
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
