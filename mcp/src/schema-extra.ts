import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { profile, visit } from "../../src/db/schema";

/**
 * Tables added by Soma migrations 0002+ (allergy, vaccine, symptom_log,
 * imaging_record, weight_log, bp_log) plus the extra diagnosis columns.
 *
 * These are NOT in this checkout's `src/db/schema.ts` (the app's schema and its
 * migrations are owned by a separate batch / worktree). The MCP server is the
 * read/write surface for them, so the Drizzle definitions live here, mapping to
 * the exact SQLite table/column names the migration creates. The runtime
 * `db.writable` gate already refuses writes whenever the live DB hasn't applied
 * the matching migration, so querying a not-yet-created table never corrupts
 * data — it simply surfaces in read-only mode.
 *
 * Conventions mirror src/db/schema.ts: ISO-8601 `YYYY-MM-DD` date strings,
 * UTC datetime strings for timestamps, snake_case columns.
 */

// ── allergy ──────────────────────────────────────────────────────────────────
export const allergy = sqliteTable(
  "allergy",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    profileId: integer("profile_id")
      .notNull()
      .references(() => profile.id),
    allergen: text("allergen").notNull(),
    category: text("category", { enum: ["drug", "food", "environmental", "other"] })
      .notNull()
      .default("other"),
    severity: text("severity", {
      enum: ["mild", "moderate", "severe", "anaphylactic"],
    }).notNull(),
    reaction: text("reaction"),
    onsetDate: text("onset_date"),
    /** "active" | "resolved" — only active allergies are safety-relevant. */
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

// ── vaccine ──────────────────────────────────────────────────────────────────
export const vaccine = sqliteTable(
  "vaccine",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    profileId: integer("profile_id")
      .notNull()
      .references(() => profile.id),
    vaccineName: text("vaccine_name").notNull(),
    date: text("date").notNull(),
    doseNumber: integer("dose_number"),
    manufacturer: text("manufacturer"),
    batchNumber: text("batch_number"),
    /** Booster / immunity expiry, ISO date — null when not applicable. */
    expiresAt: text("expires_at"),
    administeredBy: text("administered_by"),
    country: text("country"),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => [index("vaccine_profile_date_idx").on(t.profileId, t.date)],
);

// ── symptom_log ──────────────────────────────────────────────────────────────
export const symptomLog = sqliteTable(
  "symptom_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    profileId: integer("profile_id")
      .notNull()
      .references(() => profile.id),
    symptomName: text("symptom_name").notNull(),
    /** 1–10 subjective severity. */
    severity: integer("severity").notNull(),
    date: text("date").notNull(),
    /** Optional HH:MM time of day. */
    time: text("time"),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => [index("symptom_log_profile_date_idx").on(t.profileId, t.date)],
);

// ── imaging_record ───────────────────────────────────────────────────────────
export const imagingRecord = sqliteTable(
  "imaging_record",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    profileId: integer("profile_id")
      .notNull()
      .references(() => profile.id),
    modality: text("modality").notNull(),
    bodyPart: text("body_part"),
    date: text("date").notNull(),
    facility: text("facility"),
    findings: text("findings"),
    impression: text("impression"),
    visitId: integer("visit_id").references(() => visit.id),
    notes: text("notes"),
  },
  (t) => [index("imaging_record_profile_date_idx").on(t.profileId, t.date)],
);

// ── weight_log ───────────────────────────────────────────────────────────────
export const weightLog = sqliteTable(
  "weight_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    profileId: integer("profile_id")
      .notNull()
      .references(() => profile.id),
    date: text("date").notNull(),
    weightKg: real("weight_kg").notNull(),
    notes: text("notes"),
  },
  (t) => [index("weight_log_profile_date_idx").on(t.profileId, t.date)],
);

// ── bp_log ───────────────────────────────────────────────────────────────────
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
    notes: text("notes"),
  },
  (t) => [index("bp_log_profile_date_idx").on(t.profileId, t.date)],
);

export type Allergy = typeof allergy.$inferSelect;
export type Vaccine = typeof vaccine.$inferSelect;
export type SymptomLog = typeof symptomLog.$inferSelect;
export type WeightLog = typeof weightLog.$inferSelect;
export type BpLog = typeof bpLog.$inferSelect;
