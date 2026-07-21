import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  allergy,
  biomarker,
  bpLog,
  diagnosis,
  healthNote,
  imagingRecord,
  labFinding,
  labPanel,
  labResult,
  lifestyleLog,
  medication,
  profile,
  retestSchedule,
  symptomLog,
  vaccine,
  visit,
  weightLog,
} from "../../src/db/schema";
import { computeFlag, convertToDefaultUnit } from "../../src/lib/units";
import { openDb, resolveDbPath } from "./db";
import { describeCandidates, matchBiomarker } from "./mapping";
import { WRITES_DISABLED_MESSAGE, writesAllowed } from "./guard";

const INSTRUCTIONS = `Soma is a local-first personal health database (labs, medications, visits, diagnoses, allergies, vaccines, symptoms, weight and blood pressure).
Domain rules you must follow:
- ALWAYS call get_medical_summary FIRST before interpreting any health data — it returns safety-critical context (active allergies, diagnoses, medications, blood type). Never reason about symptoms, labs or new medications without it.
- Biomarkers come from a fixed dictionary with canonical names, EN/RU aliases, a default unit, reference ranges (refLow/refHigh) and optimal ranges. Never invent biomarkers: resolve names with search_biomarkers first.
- Values are stored in the biomarker's default unit; out-of-range flags are computed against the reference range in that unit.
- All dates are ISO 8601 (YYYY-MM-DD). Medications have intake periods (startDate, endDate; endDate=null means currently taking) — when interpreting a biomarker, symptom or BP trend, correlate changes with overlapping medication periods returned by get_biomarker_trend / get_symptom_trend.
- Trends: get_symptom_trend (severity over time + overlapping meds), get_weight_trend (kg vs target), get_bp_trend (systolic/diastolic with normal/stage2/crisis flags), get_lifestyle_trend (sleep/training/stress/energy per day).
- Browse existing records before writing: list_medications, list_diagnoses, list_visits, list_lab_panels + get_lab_panel, list_vaccines, list_health_notes, list_imaging_records, list_retest_schedules. Never claim a record does or does not exist without checking the matching list tool first.
- Records link together via visitId: add_diagnosis, add_imaging_record and log_symptom accept the id of a visit from add_visit/list_visits — pass it whenever the user says a finding came from a specific appointment.
- Medications are periods, not events: add_medication starts an intake period (endDate=null means currently taking; a future startDate plans a course that has not begun), stop_medication closes an open period, update_medication edits any field of an existing row (correct a dose, fix a date, re-open a course — pass endDate=null to clear it), and delete_medication removes a mistaken row (with its adherence logs). Never add a second active row for the same drug — stop/update the old one or record a dose change as stop + add.
- Writes are validated strictly: every add_*/log_*/update_*/set_*/stop_*/delete_* tool validates dates (future dates are refused except a planned medication startDate/endDate) and enums, refuses instead of guessing, and supports dryRun=true to preview the exact row. log_symptom reuses the existing spelling of a known symptom when it matches case-insensitively; log_lifestyle keeps one row per day and merges only the fields you pass. Write tools are disabled unless the user set SOMA_MCP_ALLOW_WRITES=1 for this server; if a write is refused for that reason, tell the user to enable it in their MCP client config rather than retrying.
- Only record facts the user explicitly stated. Ask for missing required fields instead of inventing values; leave optional fields empty rather than guessing.
- This is personal medical data. Be precise, never fabricate values, and do not write anything the user did not explicitly provide.`;

const dbPath = resolveDbPath();
const db = openDb(dbPath);
if (!db.writable) {
  console.error(`soma-mcp: read-only mode — ${db.schemaNote}`);
}

const server = new McpServer({ name: "soma", version: "0.1.0" }, { instructions: INSTRUCTIONS });

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function fail(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/**
 * Write tools are opt-in via SOMA_MCP_ALLOW_WRITES. Any local client can reach
 * this server, so inserting health records is gated behind an explicit env flag
 * the user sets in their MCP client config, not left to whichever model calls a
 * tool. Read tools are always available.
 */
const WRITES_ENABLED = writesAllowed(process.env);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function resolveProfileId(requested?: number): { id: number } | { error: string } {
  const profiles = db.orm.select({ id: profile.id, name: profile.name }).from(profile).all();
  if (profiles.length === 0) {
    return { error: "No profile exists yet — complete onboarding in the Soma app first." };
  }
  if (requested != null) {
    const found = profiles.find((p) => p.id === requested);
    return found ? { id: found.id } : { error: `Profile ${requested} not found.` };
  }
  if (profiles.length > 1) {
    return {
      error: `Multiple profiles exist (${profiles.map((p) => `${p.id}: ${p.name}`).join(", ")}). Pass profileId explicitly.`,
    };
  }
  return { id: profiles[0].id };
}

function biomarkerSummary(bio: typeof biomarker.$inferSelect) {
  return {
    id: bio.id,
    canonicalName: bio.canonicalName,
    category: bio.category,
    defaultUnit: bio.defaultUnit,
    refLow: bio.refLow,
    refHigh: bio.refHigh,
    optimalLow: bio.optimalLow,
    optimalHigh: bio.optimalHigh,
    direction: bio.direction,
    aliases: bio.aliases,
  };
}

// ── tools ───────────────────────────────────────────────────────────────────

server.registerTool(
  "get_profile",
  {
    title: "Get profile",
    description:
      "Returns the user profile(s): demographics, body metrics, lifestyle and chronic conditions. Call this before interpreting any lab data — sex, age and conditions affect reference ranges.",
    inputSchema: {},
  },
  async () => {
    const rows = db.orm.select().from(profile).all();
    if (rows.length === 0) return fail("No profile exists yet — onboarding not completed.");
    return ok(rows);
  },
);

server.registerTool(
  "search_biomarkers",
  {
    title: "Search biomarkers",
    description:
      "Resolves a biomarker name (any language, lab-report spelling, abbreviation) against the Soma dictionary using the same exact/alias/fuzzy matching as the app's import pipeline. Always call this to obtain a biomarkerId before get_biomarker_trend or add_lab_panel when you are not certain of the canonical name.",
    inputSchema: {
      query: z.string().min(1).describe("Biomarker name as written, e.g. 'Витамин Д' or 'HbA1c'"),
      limit: z.number().int().min(1).max(25).default(10),
    },
  },
  async ({ query, limit }) => {
    const dictionary = db.orm.select().from(biomarker).all();
    const match = matchBiomarker(query, dictionary);
    if (match.kind === "exact" || match.kind === "fuzzy") {
      return ok({
        match: {
          ...biomarkerSummary(match.biomarker),
          confidence: match.kind,
          ...(match.kind === "fuzzy" ? { score: match.score } : {}),
        },
      });
    }
    return ok({
      match: null,
      candidates: match.candidates.slice(0, limit).map((c) => ({
        ...biomarkerSummary(c.biomarker),
        score: Number(c.score.toFixed(3)),
      })),
    });
  },
);

server.registerTool(
  "get_biomarker_trend",
  {
    title: "Get biomarker trend",
    description:
      "Returns the time series of one biomarker (values normalized to the default unit, with out-of-range flags and reference/optimal ranges) plus all medications whose intake period overlaps the series — Soma's medication-overlay view. Use it to answer 'how did X change' and 'did drug Y affect marker X'.",
    inputSchema: {
      biomarkerId: z.number().int().describe("Biomarker id from search_biomarkers"),
      profileId: z.number().int().optional(),
      from: z.string().regex(ISO_DATE).optional().describe("Inclusive lower bound, YYYY-MM-DD"),
      to: z.string().regex(ISO_DATE).optional().describe("Inclusive upper bound, YYYY-MM-DD"),
    },
  },
  async ({ biomarkerId, profileId, from, to }) => {
    const pid = resolveProfileId(profileId);
    if ("error" in pid) return fail(pid.error);

    const bio = db.orm.select().from(biomarker).where(eq(biomarker.id, biomarkerId)).get();
    if (!bio) return fail(`Biomarker ${biomarkerId} not found — resolve it via search_biomarkers.`);

    const conditions = [eq(labResult.biomarkerId, biomarkerId), eq(labPanel.profileId, pid.id)];
    if (from) conditions.push(gte(labPanel.date, from));
    if (to) conditions.push(lte(labPanel.date, to));

    const series = db.orm
      .select({
        date: labPanel.date,
        value: labResult.value,
        unit: labResult.unit,
        valueNormalized: labResult.valueNormalized,
        unitNormalized: labResult.unitNormalized,
        outOfRange: labResult.outOfRange,
        flag: labResult.flag,
        panelId: labPanel.id,
        labName: labPanel.labName,
      })
      .from(labResult)
      .innerJoin(labPanel, eq(labResult.panelId, labPanel.id))
      .where(and(...conditions))
      .orderBy(asc(labPanel.date))
      .all();

    let meds: unknown[] = [];
    if (series.length > 0) {
      const minDate = series[0].date;
      const maxDate = series[series.length - 1].date;
      meds = db.orm
        .select({
          id: medication.id,
          name: medication.name,
          type: medication.type,
          doseAmount: medication.doseAmount,
          doseUnit: medication.doseUnit,
          startDate: medication.startDate,
          endDate: medication.endDate,
          purpose: medication.purpose,
        })
        .from(medication)
        .where(
          and(
            eq(medication.profileId, pid.id),
            lte(medication.startDate, maxDate),
            or(isNull(medication.endDate), gte(medication.endDate, minDate)),
          ),
        )
        .all();
    }

    return ok({
      biomarker: biomarkerSummary(bio),
      points: series.map((r) => ({
        date: r.date,
        value: r.valueNormalized ?? r.value,
        unit: r.unitNormalized ?? r.unit,
        outOfRange: r.outOfRange,
        flag: r.flag,
        panelId: r.panelId,
        labName: r.labName,
      })),
      overlappingMedications: meds,
    });
  },
);

function overlappingMedications(profileId: number, minDate: string, maxDate: string) {
  return db.orm
    .select({
      id: medication.id,
      name: medication.name,
      type: medication.type,
      doseAmount: medication.doseAmount,
      doseUnit: medication.doseUnit,
      startDate: medication.startDate,
      endDate: medication.endDate,
      purpose: medication.purpose,
    })
    .from(medication)
    .where(
      and(
        eq(medication.profileId, profileId),
        lte(medication.startDate, maxDate),
        or(isNull(medication.endDate), gte(medication.endDate, minDate)),
      ),
    )
    .all();
}

const SEVERITY_RANK: Record<string, number> = {
  anaphylactic: 0,
  severe: 1,
  moderate: 2,
  mild: 3,
};

server.registerTool(
  "get_medical_summary",
  {
    title: "Get medical summary",
    description:
      "Call this FIRST before interpreting any health data — safety-critical context (allergies!). Returns profile basics (name, birthDate, sex, blood type+Rh, conditions), active allergies (anaphylactic first), active diagnoses, active medications, and the 5 most recent vaccines with an `expired` flag.",
    inputSchema: {
      profileId: z.number().int().optional(),
    },
  },
  async ({ profileId }) => {
    const pid = resolveProfileId(profileId);
    if ("error" in pid) return fail(pid.error);

    const p = db.orm.select().from(profile).where(eq(profile.id, pid.id)).get();
    if (!p) return fail(`Profile ${pid.id} not found.`);

    const today = new Date().toISOString().slice(0, 10);

    const allergies = db.orm
      .select({
        allergen: allergy.allergen,
        category: allergy.category,
        severity: allergy.severity,
        reaction: allergy.reaction,
      })
      .from(allergy)
      .where(and(eq(allergy.profileId, pid.id), eq(allergy.status, "active")))
      .all()
      .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9));

    const diagnoses = db.orm
      .select({
        name: diagnosis.name,
        icd: diagnosis.icdCode,
        date: diagnosis.date,
      })
      .from(diagnosis)
      .where(and(eq(diagnosis.profileId, pid.id), eq(diagnosis.status, "active")))
      .orderBy(desc(diagnosis.date))
      .all();

    const medications = db.orm
      .select({
        name: medication.name,
        doseAmount: medication.doseAmount,
        doseUnit: medication.doseUnit,
        schedule: medication.schedule,
        startDate: medication.startDate,
      })
      .from(medication)
      .where(and(eq(medication.profileId, pid.id), isNull(medication.endDate)))
      .all()
      .map((m) => ({
        name: m.name,
        dose: m.doseAmount != null ? `${m.doseAmount}${m.doseUnit ? ` ${m.doseUnit}` : ""}` : null,
        frequency: m.schedule?.frequency ?? null,
        startDate: m.startDate,
      }));

    const vaccines = db.orm
      .select({
        name: vaccine.vaccineName,
        date: vaccine.date,
        dose: vaccine.dose,
        expiresAt: vaccine.expiresAt,
      })
      .from(vaccine)
      .where(eq(vaccine.profileId, pid.id))
      .orderBy(desc(vaccine.date))
      .limit(5)
      .all()
      .map((v) => ({
        ...v,
        expired: v.expiresAt != null && v.expiresAt < today,
      }));

    return ok({
      profile: {
        id: p.id,
        name: p.name,
        birthDate: p.birthDate,
        sex: p.sex,
        bloodType:
          p.bloodType != null
            ? `${p.bloodType}${p.rhFactor === "positive" ? "+" : p.rhFactor === "negative" ? "-" : ""}`
            : null,
        conditions: p.conditions,
      },
      activeAllergies: allergies,
      activeDiagnoses: diagnoses,
      activeMedications: medications,
      recentVaccines: vaccines,
    });
  },
);

server.registerTool(
  "get_symptom_trend",
  {
    title: "Get symptom trend",
    description:
      "Returns the severity time series for one symptom (case-insensitive name match) plus medications whose intake period overlaps the series. If the name doesn't match, returns the list of distinct known symptom names so you can pick the right one.",
    inputSchema: {
      symptomName: z.string().min(1).describe("Symptom name, case-insensitive, e.g. 'headache'"),
      profileId: z.number().int().optional(),
      from: z.string().regex(ISO_DATE).optional().describe("Inclusive lower bound, YYYY-MM-DD"),
      to: z.string().regex(ISO_DATE).optional().describe("Inclusive upper bound, YYYY-MM-DD"),
    },
  },
  async ({ symptomName, profileId, from, to }) => {
    const pid = resolveProfileId(profileId);
    if ("error" in pid) return fail(pid.error);

    const conditions = [
      eq(symptomLog.profileId, pid.id),
      sql`lower(${symptomLog.symptomName}) = lower(${symptomName})`,
    ];
    if (from) conditions.push(gte(symptomLog.date, from));
    if (to) conditions.push(lte(symptomLog.date, to));

    const series = db.orm
      .select({
        date: symptomLog.date,
        time: symptomLog.time,
        severity: symptomLog.severity,
        notes: symptomLog.notes,
      })
      .from(symptomLog)
      .where(and(...conditions))
      .orderBy(asc(symptomLog.date), asc(symptomLog.time))
      .all();

    if (series.length === 0) {
      const known = db.orm
        .selectDistinct({ name: symptomLog.symptomName })
        .from(symptomLog)
        .where(eq(symptomLog.profileId, pid.id))
        .all()
        .map((r) => r.name);
      return ok({
        symptomName,
        points: [],
        knownSymptoms: known,
        note:
          known.length > 0
            ? "No entries for that symptom name. Pick one of knownSymptoms."
            : "No symptoms have been logged yet.",
      });
    }

    const meds = overlappingMedications(pid.id, series[0].date, series[series.length - 1].date);

    return ok({ symptomName, points: series, overlappingMedications: meds });
  },
);

server.registerTool(
  "get_weight_trend",
  {
    title: "Get weight trend",
    description:
      "Returns the body-weight time series (kg) for the profile plus the target weight, if set.",
    inputSchema: {
      profileId: z.number().int().optional(),
      from: z.string().regex(ISO_DATE).optional().describe("Inclusive lower bound, YYYY-MM-DD"),
      to: z.string().regex(ISO_DATE).optional().describe("Inclusive upper bound, YYYY-MM-DD"),
    },
  },
  async ({ profileId, from, to }) => {
    const pid = resolveProfileId(profileId);
    if ("error" in pid) return fail(pid.error);

    const p = db.orm
      .select({ target: profile.targetWeightKg })
      .from(profile)
      .where(eq(profile.id, pid.id))
      .get();

    const conditions = [eq(weightLog.profileId, pid.id)];
    if (from) conditions.push(gte(weightLog.date, from));
    if (to) conditions.push(lte(weightLog.date, to));

    const points = db.orm
      .select({ date: weightLog.date, weightKg: weightLog.weightKg })
      .from(weightLog)
      .where(and(...conditions))
      .orderBy(asc(weightLog.date))
      .all();

    return ok({ points, targetWeightKg: p?.target ?? null });
  },
);

function bpFlag(systolic: number, diastolic: number): "normal" | "stage2" | "crisis" {
  if (systolic > 180 || diastolic > 120) return "crisis";
  if (systolic >= 140 || diastolic >= 90) return "stage2";
  return "normal";
}

server.registerTool(
  "get_bp_trend",
  {
    title: "Get blood-pressure trend",
    description:
      "Returns the blood-pressure time series with a per-reading flag (stage2: systolic≥140 or diastolic≥90; crisis: systolic>180 or diastolic>120) and summary counts per flag.",
    inputSchema: {
      profileId: z.number().int().optional(),
      from: z.string().regex(ISO_DATE).optional().describe("Inclusive lower bound, YYYY-MM-DD"),
      to: z.string().regex(ISO_DATE).optional().describe("Inclusive upper bound, YYYY-MM-DD"),
    },
  },
  async ({ profileId, from, to }) => {
    const pid = resolveProfileId(profileId);
    if ("error" in pid) return fail(pid.error);

    const conditions = [eq(bpLog.profileId, pid.id)];
    if (from) conditions.push(gte(bpLog.date, from));
    if (to) conditions.push(lte(bpLog.date, to));

    const rows = db.orm
      .select({
        date: bpLog.date,
        time: bpLog.time,
        systolic: bpLog.systolic,
        diastolic: bpLog.diastolic,
        heartRateBpm: bpLog.heartRateBpm,
      })
      .from(bpLog)
      .where(and(...conditions))
      .orderBy(asc(bpLog.date), asc(bpLog.time))
      .all();

    const points = rows.map((r) => ({ ...r, flag: bpFlag(r.systolic, r.diastolic) }));
    const summary = { normal: 0, stage2: 0, crisis: 0 };
    for (const pt of points) summary[pt.flag] += 1;

    return ok({ points, summary });
  },
);

const labResultInput = z.object({
  label: z.string().min(1).describe("Biomarker name exactly as written in the source"),
  value: z.number().finite(),
  unit: z.string().min(1),
  biomarkerId: z
    .number()
    .int()
    .optional()
    .describe("Explicit dictionary id — skips name matching for this row"),
});

server.registerTool(
  "add_lab_panel",
  {
    title: "Add lab panel",
    description:
      "Saves one lab-draw event with its results. Every row is validated like the app's import pipeline: the label must map to a dictionary biomarker (unambiguously) and the unit must be convertible to that biomarker's default unit — otherwise nothing is written and per-row errors with candidates are returned. Set dryRun=true to validate without writing. Only write values the user explicitly provided.",
    inputSchema: {
      profileId: z.number().int().optional(),
      date: z.string().regex(ISO_DATE).describe("Sample collection date, YYYY-MM-DD"),
      labName: z.string().optional(),
      city: z.string().optional(),
      country: z.string().optional(),
      panelType: z.enum(["blood", "urine", "stool", "other"]).default("blood"),
      results: z.array(labResultInput).min(1),
      dryRun: z.boolean().default(false),
    },
  },
  async ({ profileId, date, labName, city, country, panelType, results, dryRun }) => {
    if (!WRITES_ENABLED) return fail(WRITES_DISABLED_MESSAGE);
    if (!db.writable) {
      return fail(`Database is read-only for this server: ${db.schemaNote}`);
    }
    const pid = resolveProfileId(profileId);
    if ("error" in pid) return fail(pid.error);

    const today = new Date().toISOString().slice(0, 10);
    if (date > today) return fail(`date ${date} is in the future.`);

    const dictionary = db.orm.select().from(biomarker).all();
    const byId = new Map(dictionary.map((b) => [b.id, b]));

    type PreparedRow = {
      bio: (typeof dictionary)[number];
      raw: z.infer<typeof labResultInput>;
      normalized: { value: number; unit: string };
      outOfRange: boolean;
      flag: "low" | "high" | "critical" | null;
      confidence: string;
    };
    const prepared: PreparedRow[] = [];
    const errors: string[] = [];

    for (const row of results) {
      let bio: (typeof dictionary)[number] | undefined;
      let confidence: string;
      if (row.biomarkerId != null) {
        bio = byId.get(row.biomarkerId);
        confidence = "explicit";
        if (!bio) {
          errors.push(`"${row.label}": biomarkerId ${row.biomarkerId} does not exist`);
          continue;
        }
      } else {
        const match = matchBiomarker(row.label, dictionary);
        if (match.kind === "exact" || match.kind === "fuzzy") {
          bio = match.biomarker;
          confidence = match.kind;
        } else {
          errors.push(
            `"${row.label}": ${match.kind === "ambiguous" ? "ambiguous" : "no"} match — ${describeCandidates(
              match.candidates,
            )}. Resolve via search_biomarkers and pass biomarkerId.`,
          );
          continue;
        }
      }

      const conversion = convertToDefaultUnit(row.value, row.unit, bio);
      if (!conversion.ok) {
        errors.push(
          `"${row.label}" (${bio.canonicalName}): cannot convert ${row.unit} → ${bio.defaultUnit}. Provide the value in ${bio.defaultUnit}.`,
        );
        continue;
      }

      const { outOfRange, flag } = computeFlag(conversion.value, bio);
      prepared.push({
        bio,
        raw: row,
        normalized: { value: conversion.value, unit: conversion.unit },
        outOfRange,
        flag,
        confidence,
      });
    }

    const duplicates = prepared
      .map((p) => p.bio.id)
      .filter((id, i, arr) => arr.indexOf(id) !== i)
      .map((id) => byId.get(id)?.canonicalName ?? String(id));
    if (duplicates.length > 0) {
      errors.push(`duplicate biomarkers in one panel: ${[...new Set(duplicates)].join(", ")}`);
    }

    const review = prepared.map((p) => ({
      label: p.raw.label,
      biomarker: p.bio.canonicalName,
      biomarkerId: p.bio.id,
      confidence: p.confidence,
      value: p.normalized.value,
      unit: p.normalized.unit,
      outOfRange: p.outOfRange,
      flag: p.flag,
    }));

    if (errors.length > 0) {
      return fail(JSON.stringify({ saved: false, errors, validRows: review }, null, 2));
    }
    if (dryRun) return ok({ saved: false, dryRun: true, rows: review });

    const panelId = db.orm.transaction((tx) => {
      const inserted = tx
        .insert(labPanel)
        .values({
          profileId: pid.id,
          date,
          labName: labName ?? null,
          city: city ?? null,
          country: country ?? null,
          sampleTypes: [panelType],
          importMethod: "mcp",
        })
        .returning({ id: labPanel.id })
        .get();
      for (const p of prepared) {
        tx.insert(labResult)
          .values({
            panelId: inserted.id,
            biomarkerId: p.bio.id,
            value: p.raw.value,
            unit: p.raw.unit,
            valueNormalized: p.normalized.value,
            unitNormalized: p.normalized.unit,
            outOfRange: p.outOfRange,
            flag: p.flag,
            rawLabel: p.raw.label,
          })
          .run();
      }
      return inserted.id;
    });

    return ok({ saved: true, panelId, date, rows: review });
  },
);

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Shared preamble of every write tool: writes flag, schema check, profile. */
function beginWrite(
  profileId?: number,
): { ok: true; pid: number } | { ok: false; result: ToolResult } {
  if (!WRITES_ENABLED) return { ok: false, result: fail(WRITES_DISABLED_MESSAGE) };
  if (!db.writable) {
    return { ok: false, result: fail(`Database is read-only for this server: ${db.schemaNote}`) };
  }
  const pid = resolveProfileId(profileId);
  if ("error" in pid) return { ok: false, result: fail(pid.error) };
  return { ok: true, pid: pid.id };
}

/** Validates that a visitId exists and belongs to the profile. */
function checkVisit(visitId: number, profileId: number): string | null {
  const row = db.orm
    .select({ id: visit.id, profileId: visit.profileId })
    .from(visit)
    .where(eq(visit.id, visitId))
    .get();
  if (!row || row.profileId !== profileId) {
    return `visitId ${visitId} not found for this profile — look it up with list_visits.`;
  }
  return null;
}

/** ISO date + N calendar months (UTC, day clamped by Date semantics). */
function addMonthsIso(dateIso: string, months: number): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10);
}

server.registerTool(
  "add_allergy",
  {
    title: "Add allergy",
    description:
      "Records an allergy (safety-critical). Validates the optional onset date (ISO, not future) and the severity/category enums. Set dryRun=true to preview the row without writing. Only record what the user explicitly stated.",
    inputSchema: {
      profileId: z.number().int().optional(),
      allergen: z.string().min(1).describe("What the person is allergic to, e.g. 'penicillin'"),
      category: z
        .enum(["drug", "food", "environmental", "other"])
        .default("other")
        .describe("Allergen class"),
      severity: z
        .enum(["mild", "moderate", "severe", "anaphylactic"])
        .describe("Worst observed reaction severity"),
      reaction: z.string().optional().describe("Observed reaction, e.g. 'hives, swelling'"),
      onsetDate: z
        .string()
        .regex(ISO_DATE)
        .optional()
        .describe("When it first appeared, YYYY-MM-DD"),
      notes: z.string().optional(),
      dryRun: z.boolean().default(false),
    },
  },
  async ({ profileId, allergen, category, severity, reaction, onsetDate, notes, dryRun }) => {
    if (!WRITES_ENABLED) return fail(WRITES_DISABLED_MESSAGE);
    if (!db.writable) return fail(`Database is read-only for this server: ${db.schemaNote}`);
    const pid = resolveProfileId(profileId);
    if ("error" in pid) return fail(pid.error);
    if (onsetDate && onsetDate > todayIso())
      return fail(`onsetDate ${onsetDate} is in the future.`);

    const row = {
      profileId: pid.id,
      allergen,
      category,
      severity,
      reaction: reaction ?? null,
      onsetDate: onsetDate ?? null,
      status: "active" as const,
      notes: notes ?? null,
    };
    if (dryRun) return ok({ saved: false, dryRun: true, row });

    const inserted = db.orm.insert(allergy).values(row).returning({ id: allergy.id }).get();
    return ok({ saved: true, id: inserted.id, row });
  },
);

server.registerTool(
  "add_vaccine",
  {
    title: "Add vaccine",
    description:
      "Records a vaccination. Validates the administration date (ISO, not future) and the optional expiresAt date. Set dryRun=true to preview the row. Only record what the user explicitly provided.",
    inputSchema: {
      profileId: z.number().int().optional(),
      vaccineName: z.string().min(1).describe("e.g. 'Tdap', 'Influenza 2025'"),
      date: z.string().regex(ISO_DATE).describe("Administration date, YYYY-MM-DD"),
      doseNumber: z.number().int().min(1).optional().describe("Dose in the series, e.g. 2"),
      manufacturer: z.string().optional(),
      batchNumber: z.string().optional(),
      expiresAt: z.string().regex(ISO_DATE).optional().describe("Booster / immunity expiry date"),
      administeredBy: z.string().optional(),
      country: z.string().optional(),
      notes: z.string().optional(),
      dryRun: z.boolean().default(false),
    },
  },
  async ({
    profileId,
    vaccineName,
    date,
    doseNumber,
    manufacturer,
    batchNumber,
    expiresAt,
    administeredBy,
    country,
    notes,
    dryRun,
  }) => {
    if (!WRITES_ENABLED) return fail(WRITES_DISABLED_MESSAGE);
    if (!db.writable) return fail(`Database is read-only for this server: ${db.schemaNote}`);
    const pid = resolveProfileId(profileId);
    if ("error" in pid) return fail(pid.error);
    if (date > todayIso()) return fail(`date ${date} is in the future.`);

    const row = {
      profileId: pid.id,
      vaccineName,
      date,
      dose: doseNumber ?? null,
      manufacturer: manufacturer ?? null,
      batchNumber: batchNumber ?? null,
      expiresAt: expiresAt ?? null,
      administeredBy: administeredBy ?? null,
      country: country ?? null,
      notes: notes ?? null,
    };
    if (dryRun) return ok({ saved: false, dryRun: true, row });

    const inserted = db.orm.insert(vaccine).values(row).returning({ id: vaccine.id }).get();
    return ok({ saved: true, id: inserted.id, row });
  },
);

server.registerTool(
  "log_symptom",
  {
    title: "Log symptom",
    description:
      "Logs a symptom occurrence with a 1–10 severity. Validates the date (default today, not future) and optional HH:MM time. If the symptom name matches an existing one case-insensitively, the existing spelling is reused for trend consistency (the response reports which spelling was used). Set dryRun=true to preview.",
    inputSchema: {
      profileId: z.number().int().optional(),
      symptomName: z.string().min(1).describe("e.g. 'headache', 'nausea'"),
      severity: z
        .number()
        .int()
        .min(1)
        .max(10)
        .describe("Subjective severity 1 (mild) – 10 (worst)"),
      date: z.string().regex(ISO_DATE).optional().describe("YYYY-MM-DD, defaults to today"),
      time: z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
        .optional()
        .describe("Time of day, HH:MM (24h)"),
      notes: z.string().optional(),
      visitId: z
        .number()
        .int()
        .optional()
        .describe("Visit where this symptom was reported (from add_visit/list_visits)"),
      dryRun: z.boolean().default(false),
    },
  },
  async ({ profileId, symptomName, severity, date, time, notes, visitId, dryRun }) => {
    if (!WRITES_ENABLED) return fail(WRITES_DISABLED_MESSAGE);
    if (!db.writable) return fail(`Database is read-only for this server: ${db.schemaNote}`);
    const pid = resolveProfileId(profileId);
    if ("error" in pid) return fail(pid.error);

    const effectiveDate = date ?? todayIso();
    if (effectiveDate > todayIso()) return fail(`date ${effectiveDate} is in the future.`);
    if (visitId != null) {
      const err = checkVisit(visitId, pid.id);
      if (err) return fail(err);
    }

    const existing = db.orm
      .selectDistinct({ name: symptomLog.symptomName })
      .from(symptomLog)
      .where(
        and(
          eq(symptomLog.profileId, pid.id),
          sql`lower(${symptomLog.symptomName}) = lower(${symptomName})`,
        ),
      )
      .get();
    const canonicalName = existing?.name ?? symptomName;
    const reusedSpelling = existing != null && existing.name !== symptomName;

    const row = {
      profileId: pid.id,
      symptomName: canonicalName,
      severity,
      date: effectiveDate,
      time: time ?? null,
      notes: notes ?? null,
      visitId: visitId ?? null,
    };
    if (dryRun) {
      return ok({ saved: false, dryRun: true, row, reusedSpelling, requestedName: symptomName });
    }

    const inserted = db.orm.insert(symptomLog).values(row).returning({ id: symptomLog.id }).get();
    return ok({ saved: true, id: inserted.id, row, reusedSpelling, requestedName: symptomName });
  },
);

// ── medications ─────────────────────────────────────────────────────────────

function medicationSummary(m: typeof medication.$inferSelect) {
  return {
    id: m.id,
    name: m.name,
    type: m.type,
    doseAmount: m.doseAmount,
    doseUnit: m.doseUnit,
    schedule: m.schedule,
    asNeeded: m.asNeeded,
    startDate: m.startDate,
    endDate: m.endDate,
    purpose: m.purpose,
  };
}

server.registerTool(
  "list_medications",
  {
    title: "List medications",
    description:
      "Lists medications and supplements with their intake periods. status='active' (default) returns rows currently being taken (endDate null or in the future), 'past' returns finished courses, 'all' returns everything. Call this before add_medication or stop_medication to see what already exists.",
    inputSchema: {
      profileId: z.number().int().optional(),
      status: z.enum(["active", "past", "all"]).default("active"),
    },
  },
  async ({ profileId, status }) => {
    const pid = resolveProfileId(profileId);
    if ("error" in pid) return fail(pid.error);
    const today = todayIso();

    const conditions = [eq(medication.profileId, pid.id)];
    if (status === "active") {
      conditions.push(or(isNull(medication.endDate), gte(medication.endDate, today))!);
    } else if (status === "past") {
      conditions.push(isNotNull(medication.endDate), lt(medication.endDate, today));
    }

    const rows = db.orm
      .select()
      .from(medication)
      .where(and(...conditions))
      .orderBy(desc(medication.startDate))
      .all();
    return ok({ status, medications: rows.map(medicationSummary) });
  },
);

server.registerTool(
  "add_medication",
  {
    title: "Add medication",
    description:
      "Starts a medication/supplement intake period. A medication is a period, not an event: endDate=null means currently taking. Refuses a second active row for the same name — use stop_medication first (record a dose change as stop + add). Dose requires both doseAmount and doseUnit. Set dryRun=true to preview the row. Only record what the user explicitly stated.",
    inputSchema: {
      profileId: z.number().int().optional(),
      name: z.string().min(1).describe("Drug or supplement name, e.g. 'Vitamin D3', 'Accutane'"),
      type: z.enum(["drug", "supplement"]).default("supplement"),
      doseAmount: z.number().positive().optional().describe("Dose per intake, e.g. 5000"),
      doseUnit: z.string().min(1).optional().describe("Dose unit, e.g. 'IU', 'mg'"),
      frequency: z
        .string()
        .optional()
        .describe("Intake cadence, e.g. 'daily', '2x_daily', 'weekly', 'as_needed', 'custom'"),
      times: z
        .array(z.string().regex(TIME_RE))
        .optional()
        .describe("Times of day, HH:MM (24h), e.g. ['08:00','20:00']"),
      scheduleNotes: z
        .string()
        .optional()
        .describe("Free-form schedule detail, e.g. 'with food', '5 days on / 2 off'"),
      asNeeded: z
        .boolean()
        .default(false)
        .describe("PRN medication taken only when needed, not on a standing schedule"),
      startDate: z
        .string()
        .regex(ISO_DATE)
        .optional()
        .describe(
          "First day of intake, YYYY-MM-DD; defaults to today. May be in the future to plan a course that has not started yet.",
        ),
      endDate: z
        .string()
        .regex(ISO_DATE)
        .optional()
        .describe("Last day of a finished or fixed-length course; omit if currently taking"),
      purpose: z
        .string()
        .optional()
        .describe("Why it is taken, e.g. 'acne', 'vitamin D deficiency'"),
      dryRun: z.boolean().default(false),
    },
  },
  async (input) => {
    const w = beginWrite(input.profileId);
    if (!w.ok) return w.result;
    const today = todayIso();

    const startDate = input.startDate ?? today;
    // A future startDate is allowed: a course can be planned before it begins
    // (e.g. a supplement that starts after another one finishes).
    if (input.endDate && input.endDate < startDate) {
      return fail(`endDate ${input.endDate} is before startDate ${startDate}.`);
    }
    if ((input.doseAmount == null) !== (input.doseUnit == null)) {
      return fail("Provide doseAmount and doseUnit together (or neither).");
    }

    const stillTaking = input.endDate == null || input.endDate >= today;
    if (stillTaking) {
      const existing = db.orm
        .select()
        .from(medication)
        .where(
          and(
            eq(medication.profileId, w.pid),
            sql`lower(${medication.name}) = lower(${input.name})`,
            or(isNull(medication.endDate), gte(medication.endDate, today)),
          ),
        )
        .get();
      if (existing) {
        return fail(
          `An active medication "${existing.name}" already exists (id ${existing.id}, since ${existing.startDate}). Stop it with stop_medication first, or record a past course with an explicit endDate.`,
        );
      }
    }

    const hasSchedule =
      input.frequency != null || input.times != null || input.scheduleNotes != null;
    const row = {
      profileId: w.pid,
      name: input.name,
      type: input.type,
      doseAmount: input.doseAmount ?? null,
      doseUnit: input.doseUnit ?? null,
      schedule: hasSchedule
        ? {
            frequency: input.frequency ?? "custom",
            ...(input.times ? { times: input.times } : {}),
            ...(input.scheduleNotes ? { notes: input.scheduleNotes } : {}),
          }
        : null,
      asNeeded: input.asNeeded,
      startDate,
      endDate: input.endDate ?? null,
      purpose: input.purpose ?? null,
    };
    if (input.dryRun) return ok({ saved: false, dryRun: true, row });

    const inserted = db.orm.insert(medication).values(row).returning({ id: medication.id }).get();
    return ok({ saved: true, id: inserted.id, row });
  },
);

server.registerTool(
  "stop_medication",
  {
    title: "Stop medication",
    description:
      "Closes a medication's intake period by setting endDate (default today). Identify the medication by medicationId or by name (case-insensitive match among currently-taken rows); an ambiguous or unknown name returns the candidates instead of guessing. A future endDate is allowed for a planned course end. Set dryRun=true to preview.",
    inputSchema: {
      profileId: z.number().int().optional(),
      medicationId: z.number().int().optional().describe("Id from list_medications"),
      name: z.string().min(1).optional().describe("Medication name, used when id is unknown"),
      endDate: z
        .string()
        .regex(ISO_DATE)
        .optional()
        .describe("Last day of intake, YYYY-MM-DD; defaults to today"),
      dryRun: z.boolean().default(false),
    },
  },
  async ({ profileId, medicationId, name, endDate, dryRun }) => {
    const w = beginWrite(profileId);
    if (!w.ok) return w.result;
    if (medicationId == null && name == null) {
      return fail("Pass medicationId or name to identify the medication.");
    }

    let target: typeof medication.$inferSelect | undefined;
    if (medicationId != null) {
      target = db.orm.select().from(medication).where(eq(medication.id, medicationId)).get();
      if (!target || target.profileId !== w.pid) {
        return fail(`Medication ${medicationId} not found — check list_medications.`);
      }
    } else {
      const matches = db.orm
        .select()
        .from(medication)
        .where(
          and(
            eq(medication.profileId, w.pid),
            sql`lower(${medication.name}) = lower(${name})`,
            isNull(medication.endDate),
          ),
        )
        .all();
      if (matches.length === 0) {
        const active = db.orm
          .select({ id: medication.id, name: medication.name })
          .from(medication)
          .where(and(eq(medication.profileId, w.pid), isNull(medication.endDate)))
          .all();
        return fail(
          `No currently-taken medication named "${name}". Active medications: ${
            active.length > 0 ? active.map((m) => `${m.id}: ${m.name}`).join(", ") : "none"
          }.`,
        );
      }
      if (matches.length > 1) {
        return fail(
          `Multiple active medications match "${name}": ${matches.map((m) => `${m.id} (since ${m.startDate})`).join(", ")}. Pass medicationId.`,
        );
      }
      target = matches[0];
    }

    if (target.endDate != null) {
      return fail(
        `"${target.name}" (id ${target.id}) already has endDate ${target.endDate}. Nothing to stop.`,
      );
    }
    const effectiveEnd = endDate ?? todayIso();
    if (effectiveEnd < target.startDate) {
      return fail(`endDate ${effectiveEnd} is before startDate ${target.startDate}.`);
    }

    const after = { ...medicationSummary(target), endDate: effectiveEnd };
    if (dryRun) return ok({ saved: false, dryRun: true, before: medicationSummary(target), after });

    db.orm
      .update(medication)
      .set({ endDate: effectiveEnd })
      .where(eq(medication.id, target.id))
      .run();
    return ok({ saved: true, before: medicationSummary(target), after });
  },
);

server.registerTool(
  "update_medication",
  {
    title: "Update medication",
    description:
      "Edits an existing medication/supplement row identified by medicationId (from list_medications). Only the fields you pass are changed; everything else is kept. Use this to correct a dose, rename, fix a start/end date, or re-open a course that was closed too early. Pass endDate=null to clear the end date (mark it as currently taking); pass purpose or scheduleNotes as an empty string to clear them. Set dryRun=true to preview the before/after diff. Only record what the user explicitly stated.",
    inputSchema: {
      profileId: z.number().int().optional(),
      medicationId: z.number().int().describe("Id from list_medications"),
      name: z.string().min(1).optional().describe("New name"),
      type: z.enum(["drug", "supplement"]).optional(),
      doseAmount: z.number().positive().optional().describe("New dose per intake"),
      doseUnit: z.string().min(1).optional().describe("New dose unit, e.g. 'IU', 'mg'"),
      frequency: z.string().optional().describe("Intake cadence, e.g. 'daily'"),
      times: z.array(z.string().regex(TIME_RE)).optional().describe("Times of day, HH:MM (24h)"),
      scheduleNotes: z
        .string()
        .optional()
        .describe("Free-form schedule detail; empty string clears it"),
      asNeeded: z.boolean().optional().describe("PRN (taken only when needed)"),
      startDate: z
        .string()
        .regex(ISO_DATE)
        .optional()
        .describe("New first day of intake, YYYY-MM-DD (may be in the future)"),
      endDate: z
        .string()
        .regex(ISO_DATE)
        .nullable()
        .optional()
        .describe("New last day of intake, YYYY-MM-DD; null clears it (currently taking)"),
      purpose: z.string().optional().describe("Why it is taken; empty string clears it"),
      dryRun: z.boolean().default(false),
    },
  },
  async (input) => {
    const w = beginWrite(input.profileId);
    if (!w.ok) return w.result;

    const target = db.orm
      .select()
      .from(medication)
      .where(eq(medication.id, input.medicationId))
      .get();
    if (!target || target.profileId !== w.pid) {
      return fail(`Medication ${input.medicationId} not found — check list_medications.`);
    }

    const finalStartDate = input.startDate ?? target.startDate;
    const finalEndDate = input.endDate === undefined ? target.endDate : input.endDate; // null clears
    if (finalEndDate != null && finalEndDate < finalStartDate) {
      return fail(`endDate ${finalEndDate} is before startDate ${finalStartDate}.`);
    }

    const finalDoseAmount = input.doseAmount ?? target.doseAmount;
    const finalDoseUnit = input.doseUnit ?? target.doseUnit;
    if ((finalDoseAmount == null) !== (finalDoseUnit == null)) {
      return fail("doseAmount and doseUnit must be set together (or neither).");
    }

    const scheduleTouched =
      input.frequency !== undefined ||
      input.times !== undefined ||
      input.scheduleNotes !== undefined;
    let finalSchedule = target.schedule;
    if (scheduleTouched) {
      const base = target.schedule;
      const notes =
        input.scheduleNotes === undefined
          ? base?.notes
          : input.scheduleNotes === ""
            ? undefined
            : input.scheduleNotes;
      const timesRaw = input.times === undefined ? base?.times : input.times;
      const times = timesRaw && timesRaw.length > 0 ? timesRaw : undefined;
      const frequency = input.frequency ?? base?.frequency ?? "custom";
      const rebuilt = {
        frequency,
        ...(times ? { times } : {}),
        ...(notes ? { notes } : {}),
      };
      finalSchedule = rebuilt.frequency === "custom" && !times && !notes ? null : rebuilt;
    }

    const finalName = input.name ?? target.name;
    const today = todayIso();
    const stillTaking = finalEndDate == null || finalEndDate >= today;
    if (stillTaking) {
      const clash = db.orm
        .select({ id: medication.id, name: medication.name, startDate: medication.startDate })
        .from(medication)
        .where(
          and(
            eq(medication.profileId, w.pid),
            sql`lower(${medication.name}) = lower(${finalName})`,
            sql`${medication.id} <> ${target.id}`,
            or(isNull(medication.endDate), gte(medication.endDate, today)),
          ),
        )
        .get();
      if (clash) {
        return fail(
          `Another active medication "${clash.name}" already exists (id ${clash.id}, since ${clash.startDate}). Close or delete it first.`,
        );
      }
    }

    const changes = {
      name: finalName,
      type: input.type ?? target.type,
      doseAmount: finalDoseAmount,
      doseUnit: finalDoseUnit,
      schedule: finalSchedule,
      asNeeded: input.asNeeded ?? target.asNeeded,
      startDate: finalStartDate,
      endDate: finalEndDate,
      purpose:
        input.purpose === undefined ? target.purpose : input.purpose === "" ? null : input.purpose,
    };
    const after = { id: target.id, ...changes };
    if (input.dryRun) {
      return ok({ saved: false, dryRun: true, before: medicationSummary(target), after });
    }

    db.orm.update(medication).set(changes).where(eq(medication.id, target.id)).run();
    return ok({ saved: true, before: medicationSummary(target), after });
  },
);

server.registerTool(
  "delete_medication",
  {
    title: "Delete medication",
    description:
      "Permanently deletes a medication/supplement row identified by medicationId (from list_medications), along with any adherence logs attached to it. Use only to remove a mistaken entry — to end an ongoing course use stop_medication, to fix a value use update_medication. Set dryRun=true to preview what would be deleted.",
    inputSchema: {
      profileId: z.number().int().optional(),
      medicationId: z.number().int().describe("Id from list_medications"),
      dryRun: z.boolean().default(false),
    },
  },
  async ({ profileId, medicationId, dryRun }) => {
    const w = beginWrite(profileId);
    if (!w.ok) return w.result;

    const target = db.orm.select().from(medication).where(eq(medication.id, medicationId)).get();
    if (!target || target.profileId !== w.pid) {
      return fail(`Medication ${medicationId} not found — check list_medications.`);
    }
    const deleted = medicationSummary(target);
    if (dryRun) return ok({ deleted: false, dryRun: true, row: deleted });

    // medication_log rows cascade on delete (foreign_keys pragma is ON).
    db.orm.delete(medication).where(eq(medication.id, target.id)).run();
    return ok({ deleted: true, row: deleted });
  },
);

// ── diagnoses ───────────────────────────────────────────────────────────────

server.registerTool(
  "list_diagnoses",
  {
    title: "List diagnoses",
    description:
      "Lists diagnoses with status (active / remission / resolved), ICD code, dates and the linked visit if any. Call this before add_diagnosis to avoid duplicates and before update_diagnosis_status to find the id.",
    inputSchema: {
      profileId: z.number().int().optional(),
      status: z.enum(["active", "remission", "resolved", "all"]).default("all"),
    },
  },
  async ({ profileId, status }) => {
    const pid = resolveProfileId(profileId);
    if ("error" in pid) return fail(pid.error);

    const conditions = [eq(diagnosis.profileId, pid.id)];
    if (status !== "all") conditions.push(eq(diagnosis.status, status));

    const rows = db.orm
      .select()
      .from(diagnosis)
      .where(and(...conditions))
      .orderBy(desc(diagnosis.date))
      .all();
    return ok({ status, diagnoses: rows });
  },
);

server.registerTool(
  "add_diagnosis",
  {
    title: "Add diagnosis",
    description:
      "Records a diagnosis. Refuses a duplicate of an active diagnosis with the same name — change its status with update_diagnosis_status instead. Pass visitId (from add_visit/list_visits) when the diagnosis was made at a known appointment. Only record a clinician-stated or user-stated diagnosis; never infer one from symptoms or labs. Set dryRun=true to preview.",
    inputSchema: {
      profileId: z.number().int().optional(),
      name: z.string().min(1).describe("Diagnosis name as stated, e.g. 'Acne vulgaris'"),
      icdCode: z.string().optional().describe("ICD-10 code if known, e.g. 'L70.0' — do not guess"),
      date: z.string().regex(ISO_DATE).describe("Diagnosis date, YYYY-MM-DD"),
      status: z.enum(["active", "remission", "resolved"]).default("active"),
      resolvedDate: z
        .string()
        .regex(ISO_DATE)
        .optional()
        .describe("When it resolved / went into remission; only with a non-active status"),
      notes: z.string().optional(),
      visitId: z.number().int().optional().describe("Visit where this was diagnosed"),
      dryRun: z.boolean().default(false),
    },
  },
  async ({ profileId, name, icdCode, date, status, resolvedDate, notes, visitId, dryRun }) => {
    const w = beginWrite(profileId);
    if (!w.ok) return w.result;
    const today = todayIso();
    if (date > today) return fail(`date ${date} is in the future.`);
    if (resolvedDate != null) {
      if (status === "active") return fail("resolvedDate only applies to remission/resolved.");
      if (resolvedDate > today) return fail(`resolvedDate ${resolvedDate} is in the future.`);
      if (resolvedDate < date) return fail(`resolvedDate ${resolvedDate} is before date ${date}.`);
    }
    if (visitId != null) {
      const err = checkVisit(visitId, w.pid);
      if (err) return fail(err);
    }
    if (status === "active") {
      const dup = db.orm
        .select({ id: diagnosis.id, name: diagnosis.name, date: diagnosis.date })
        .from(diagnosis)
        .where(
          and(
            eq(diagnosis.profileId, w.pid),
            eq(diagnosis.status, "active"),
            sql`lower(${diagnosis.name}) = lower(${name})`,
          ),
        )
        .get();
      if (dup) {
        return fail(
          `Active diagnosis "${dup.name}" already exists (id ${dup.id}, ${dup.date}). Use update_diagnosis_status to change it.`,
        );
      }
    }

    const row = {
      profileId: w.pid,
      name,
      icdCode: icdCode ?? null,
      date,
      status,
      resolvedDate: resolvedDate ?? null,
      notes: notes ?? null,
      visitId: visitId ?? null,
    };
    if (dryRun) return ok({ saved: false, dryRun: true, row });

    const inserted = db.orm.insert(diagnosis).values(row).returning({ id: diagnosis.id }).get();
    return ok({ saved: true, id: inserted.id, row });
  },
);

server.registerTool(
  "update_diagnosis_status",
  {
    title: "Update diagnosis status",
    description:
      "Changes a diagnosis's status (active / remission / resolved). Moving to remission/resolved stamps resolvedDate (default today); moving back to active clears it. Find the id with list_diagnoses. Set dryRun=true to preview.",
    inputSchema: {
      profileId: z.number().int().optional(),
      diagnosisId: z.number().int().describe("Id from list_diagnoses"),
      status: z.enum(["active", "remission", "resolved"]),
      resolvedDate: z
        .string()
        .regex(ISO_DATE)
        .optional()
        .describe("When it resolved / went into remission, YYYY-MM-DD; defaults to today"),
      dryRun: z.boolean().default(false),
    },
  },
  async ({ profileId, diagnosisId, status, resolvedDate, dryRun }) => {
    const w = beginWrite(profileId);
    if (!w.ok) return w.result;

    const row = db.orm.select().from(diagnosis).where(eq(diagnosis.id, diagnosisId)).get();
    if (!row || row.profileId !== w.pid) {
      return fail(`Diagnosis ${diagnosisId} not found — check list_diagnoses.`);
    }
    if (row.status === status) return fail(`Diagnosis "${row.name}" is already ${status}.`);

    const today = todayIso();
    const effectiveResolved = status === "active" ? null : (resolvedDate ?? today);
    if (effectiveResolved != null) {
      if (effectiveResolved > today) {
        return fail(`resolvedDate ${effectiveResolved} is in the future.`);
      }
      if (effectiveResolved < row.date) {
        return fail(`resolvedDate ${effectiveResolved} is before diagnosis date ${row.date}.`);
      }
    }

    const before = {
      id: row.id,
      name: row.name,
      status: row.status,
      resolvedDate: row.resolvedDate,
    };
    const after = { ...before, status, resolvedDate: effectiveResolved };
    if (dryRun) return ok({ saved: false, dryRun: true, before, after });

    db.orm
      .update(diagnosis)
      .set({ status, resolvedDate: effectiveResolved })
      .where(eq(diagnosis.id, row.id))
      .run();
    return ok({ saved: true, before, after });
  },
);

// ── visits ──────────────────────────────────────────────────────────────────

server.registerTool(
  "list_visits",
  {
    title: "List doctor visits",
    description:
      "Lists doctor visits (date, doctor, specialty, clinic, location, notes) with any diagnoses linked to each visit. Use the returned visit id to link diagnoses, symptoms and imaging records to an appointment.",
    inputSchema: {
      profileId: z.number().int().optional(),
      from: z.string().regex(ISO_DATE).optional().describe("Inclusive lower bound, YYYY-MM-DD"),
      to: z.string().regex(ISO_DATE).optional().describe("Inclusive upper bound, YYYY-MM-DD"),
    },
  },
  async ({ profileId, from, to }) => {
    const pid = resolveProfileId(profileId);
    if ("error" in pid) return fail(pid.error);

    const conditions = [eq(visit.profileId, pid.id)];
    if (from) conditions.push(gte(visit.date, from));
    if (to) conditions.push(lte(visit.date, to));

    const rows = db.orm
      .select()
      .from(visit)
      .where(and(...conditions))
      .orderBy(desc(visit.date))
      .all();

    const linked =
      rows.length > 0
        ? db.orm
            .select({ visitId: diagnosis.visitId, id: diagnosis.id, name: diagnosis.name })
            .from(diagnosis)
            .where(
              inArray(
                diagnosis.visitId,
                rows.map((v) => v.id),
              ),
            )
            .all()
        : [];

    return ok({
      visits: rows.map((v) => ({
        ...v,
        diagnoses: linked
          .filter((d) => d.visitId === v.id)
          .map((d) => ({ id: d.id, name: d.name })),
      })),
    });
  },
);

server.registerTool(
  "add_visit",
  {
    title: "Add doctor visit",
    description:
      "Records a doctor visit that already happened (date must not be in the future — this is a record, not an appointment planner). The returned id can be passed as visitId to add_diagnosis, add_imaging_record and log_symptom to tie findings to this appointment. Set dryRun=true to preview.",
    inputSchema: {
      profileId: z.number().int().optional(),
      date: z.string().regex(ISO_DATE).describe("Visit date, YYYY-MM-DD"),
      doctorName: z.string().optional(),
      specialty: z.string().optional().describe("e.g. 'dermatology', 'cardiology'"),
      clinic: z.string().optional(),
      city: z.string().optional(),
      country: z.string().optional(),
      notes: z
        .string()
        .optional()
        .describe("What was discussed / concluded, as the user stated it"),
      dryRun: z.boolean().default(false),
    },
  },
  async ({ profileId, date, doctorName, specialty, clinic, city, country, notes, dryRun }) => {
    const w = beginWrite(profileId);
    if (!w.ok) return w.result;
    if (date > todayIso()) return fail(`date ${date} is in the future.`);

    const row = {
      profileId: w.pid,
      date,
      doctorName: doctorName ?? null,
      specialty: specialty ?? null,
      clinic: clinic ?? null,
      city: city ?? null,
      country: country ?? null,
      notes: notes ?? null,
    };
    if (dryRun) return ok({ saved: false, dryRun: true, row });

    const inserted = db.orm.insert(visit).values(row).returning({ id: visit.id }).get();
    return ok({
      saved: true,
      id: inserted.id,
      row,
      hint: "Pass this id as visitId to add_diagnosis / add_imaging_record / log_symptom to link records to this visit.",
    });
  },
);

// ── home measurements ───────────────────────────────────────────────────────

server.registerTool(
  "log_weight",
  {
    title: "Log weight",
    description:
      "Logs a body-weight measurement in kilograms (convert from lbs before calling: kg = lbs / 2.20462, round to 0.1). If an entry already exists for that date it is reported back and a second entry is still allowed. Set dryRun=true to preview.",
    inputSchema: {
      profileId: z.number().int().optional(),
      weightKg: z.number().min(20).max(400).describe("Weight in kg, e.g. 71.4"),
      date: z.string().regex(ISO_DATE).optional().describe("YYYY-MM-DD, defaults to today"),
      notes: z.string().optional(),
      dryRun: z.boolean().default(false),
    },
  },
  async ({ profileId, weightKg, date, notes, dryRun }) => {
    const w = beginWrite(profileId);
    if (!w.ok) return w.result;
    const effectiveDate = date ?? todayIso();
    if (effectiveDate > todayIso()) return fail(`date ${effectiveDate} is in the future.`);

    const sameDay = db.orm
      .select({ id: weightLog.id, weightKg: weightLog.weightKg })
      .from(weightLog)
      .where(and(eq(weightLog.profileId, w.pid), eq(weightLog.date, effectiveDate)))
      .all();

    const row = { profileId: w.pid, date: effectiveDate, weightKg, notes: notes ?? null };
    if (dryRun) return ok({ saved: false, dryRun: true, row, existingSameDate: sameDay });

    const inserted = db.orm.insert(weightLog).values(row).returning({ id: weightLog.id }).get();
    return ok({ saved: true, id: inserted.id, row, existingSameDate: sameDay });
  },
);

server.registerTool(
  "log_blood_pressure",
  {
    title: "Log blood pressure",
    description:
      "Logs a blood-pressure reading (systolic/diastolic mmHg, optional heart rate, body position and arm side). Validates systolic > diastolic. The response echoes the same normal/stage2/crisis flag used by get_bp_trend. Set dryRun=true to preview.",
    inputSchema: {
      profileId: z.number().int().optional(),
      systolic: z.number().int().min(60).max(260).describe("Systolic pressure, mmHg"),
      diastolic: z.number().int().min(30).max(200).describe("Diastolic pressure, mmHg"),
      heartRateBpm: z.number().int().min(25).max(250).optional().describe("Pulse, beats/min"),
      date: z.string().regex(ISO_DATE).optional().describe("YYYY-MM-DD, defaults to today"),
      time: z.string().regex(TIME_RE).optional().describe("Time of day, HH:MM (24h)"),
      position: z.enum(["sitting", "standing", "supine"]).optional(),
      armSide: z.enum(["left", "right"]).optional(),
      notes: z.string().optional(),
      dryRun: z.boolean().default(false),
    },
  },
  async (input) => {
    const w = beginWrite(input.profileId);
    if (!w.ok) return w.result;
    const effectiveDate = input.date ?? todayIso();
    if (effectiveDate > todayIso()) return fail(`date ${effectiveDate} is in the future.`);
    if (input.systolic <= input.diastolic) {
      return fail(
        `systolic (${input.systolic}) must be greater than diastolic (${input.diastolic}) — check the reading.`,
      );
    }

    const row = {
      profileId: w.pid,
      date: effectiveDate,
      time: input.time ?? null,
      systolic: input.systolic,
      diastolic: input.diastolic,
      heartRateBpm: input.heartRateBpm ?? null,
      position: input.position ?? null,
      armSide: input.armSide ?? null,
      notes: input.notes ?? null,
    };
    const flag = bpFlag(input.systolic, input.diastolic);
    if (input.dryRun) return ok({ saved: false, dryRun: true, row, flag });

    const inserted = db.orm.insert(bpLog).values(row).returning({ id: bpLog.id }).get();
    return ok({ saved: true, id: inserted.id, row, flag });
  },
);

// ── lifestyle ───────────────────────────────────────────────────────────────

const LIFESTYLE_FIELDS = [
  "sleepHours",
  "sleepQuality",
  "trainingMinutes",
  "trainingIntensity",
  "steps",
  "restingHeartRate",
  "stressLevel",
  "energyLevel",
  "notes",
] as const;

server.registerTool(
  "log_lifestyle",
  {
    title: "Log lifestyle day",
    description:
      "Records the daily lifestyle context (sleep, training, steps, resting HR, subjective stress/energy). Exactly one row exists per day: if the date already has one, only the fields you pass are updated and the rest keep their values — so it is safe to log sleep in the morning and training in the evening. All subjective scales are 1–5. Pass at least one metric. Set dryRun=true to preview.",
    inputSchema: {
      profileId: z.number().int().optional(),
      date: z.string().regex(ISO_DATE).optional().describe("YYYY-MM-DD, defaults to today"),
      sleepHours: z.number().min(0).max(24).optional().describe("Total sleep last night, hours"),
      sleepQuality: z
        .number()
        .int()
        .min(1)
        .max(5)
        .optional()
        .describe("Subjective sleep quality, 1 (poor) – 5 (excellent)"),
      trainingMinutes: z
        .number()
        .int()
        .min(0)
        .max(1440)
        .optional()
        .describe("Total training/activity minutes for the day"),
      trainingIntensity: z
        .enum(["light", "moderate", "intense"])
        .optional()
        .describe("Perceived training intensity; only when training happened"),
      steps: z.number().int().min(0).max(200000).optional().describe("Step count"),
      restingHeartRate: z
        .number()
        .int()
        .min(25)
        .max(250)
        .optional()
        .describe("Resting heart rate, bpm"),
      stressLevel: z
        .number()
        .int()
        .min(1)
        .max(5)
        .optional()
        .describe("Subjective stress, 1 (calm) – 5 (very stressed)"),
      energyLevel: z
        .number()
        .int()
        .min(1)
        .max(5)
        .optional()
        .describe("Subjective energy, 1 (drained) – 5 (energetic)"),
      notes: z.string().optional(),
      dryRun: z.boolean().default(false),
    },
  },
  async (input) => {
    const w = beginWrite(input.profileId);
    if (!w.ok) return w.result;
    const effectiveDate = input.date ?? todayIso();
    if (effectiveDate > todayIso()) return fail(`date ${effectiveDate} is in the future.`);

    const provided = LIFESTYLE_FIELDS.filter((f) => input[f] != null);
    if (provided.length === 0) {
      return fail(`Pass at least one field: ${LIFESTYLE_FIELDS.join(", ")}.`);
    }

    const existing = db.orm
      .select()
      .from(lifestyleLog)
      .where(and(eq(lifestyleLog.profileId, w.pid), eq(lifestyleLog.date, effectiveDate)))
      .get();

    const patch = Object.fromEntries(provided.map((f) => [f, input[f]]));
    const row = existing
      ? { ...existing, ...patch }
      : {
          profileId: w.pid,
          date: effectiveDate,
          sleepHours: input.sleepHours ?? null,
          sleepQuality: input.sleepQuality ?? null,
          trainingMinutes: input.trainingMinutes ?? null,
          trainingIntensity: input.trainingIntensity ?? null,
          steps: input.steps ?? null,
          restingHeartRate: input.restingHeartRate ?? null,
          stressLevel: input.stressLevel ?? null,
          energyLevel: input.energyLevel ?? null,
          notes: input.notes ?? null,
          source: "manual" as const,
        };
    const action = existing ? "updated" : "created";
    if (input.dryRun) return ok({ saved: false, dryRun: true, action, row });

    if (existing) {
      db.orm.update(lifestyleLog).set(patch).where(eq(lifestyleLog.id, existing.id)).run();
      return ok({ saved: true, action, id: existing.id, row });
    }
    const inserted = db.orm
      .insert(lifestyleLog)
      .values(row)
      .returning({ id: lifestyleLog.id })
      .get();
    return ok({ saved: true, action, id: inserted.id, row });
  },
);

server.registerTool(
  "get_lifestyle_trend",
  {
    title: "Get lifestyle trend",
    description:
      "Returns the daily lifestyle series (sleep, training, steps, resting HR, stress, energy — one row per day) plus per-field averages over the window. Correlate it with get_symptom_trend / get_bp_trend / get_biomarker_trend when the user asks why a metric moved.",
    inputSchema: {
      profileId: z.number().int().optional(),
      from: z.string().regex(ISO_DATE).optional().describe("Inclusive lower bound, YYYY-MM-DD"),
      to: z.string().regex(ISO_DATE).optional().describe("Inclusive upper bound, YYYY-MM-DD"),
    },
  },
  async ({ profileId, from, to }) => {
    const pid = resolveProfileId(profileId);
    if ("error" in pid) return fail(pid.error);

    const conditions = [eq(lifestyleLog.profileId, pid.id)];
    if (from) conditions.push(gte(lifestyleLog.date, from));
    if (to) conditions.push(lte(lifestyleLog.date, to));

    const points = db.orm
      .select()
      .from(lifestyleLog)
      .where(and(...conditions))
      .orderBy(asc(lifestyleLog.date))
      .all();

    const numericFields = [
      "sleepHours",
      "sleepQuality",
      "trainingMinutes",
      "steps",
      "restingHeartRate",
      "stressLevel",
      "energyLevel",
    ] as const;
    const averages: Record<string, { avg: number; days: number } | null> = {};
    for (const f of numericFields) {
      const values = points.map((p) => p[f]).filter((v): v is number => v != null);
      averages[f] =
        values.length > 0
          ? {
              avg: Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)),
              days: values.length,
            }
          : null;
    }

    return ok({ points, averages });
  },
);

// ── health notes (journal) ──────────────────────────────────────────────────

server.registerTool(
  "list_health_notes",
  {
    title: "List health notes",
    description:
      "Lists free-form health journal notes, newest first, with optional filters: category, date window, tag, or a case-insensitive text query over title/summary/text. Use it to recall what the user previously described in their own words.",
    inputSchema: {
      profileId: z.number().int().optional(),
      category: z
        .enum(["general", "concern", "symptom_pattern", "treatment", "history", "other"])
        .optional(),
      from: z.string().regex(ISO_DATE).optional().describe("Inclusive lower bound, YYYY-MM-DD"),
      to: z.string().regex(ISO_DATE).optional().describe("Inclusive upper bound, YYYY-MM-DD"),
      tag: z.string().optional().describe("Exact tag match, case-insensitive"),
      query: z.string().optional().describe("Substring search over title, summary and text"),
      limit: z.number().int().min(1).max(200).default(50),
    },
  },
  async ({ profileId, category, from, to, tag, query, limit }) => {
    const pid = resolveProfileId(profileId);
    if ("error" in pid) return fail(pid.error);

    const conditions = [eq(healthNote.profileId, pid.id)];
    if (category) conditions.push(eq(healthNote.category, category));
    if (from) conditions.push(gte(healthNote.date, from));
    if (to) conditions.push(lte(healthNote.date, to));

    let rows = db.orm
      .select()
      .from(healthNote)
      .where(and(...conditions))
      .orderBy(desc(healthNote.date), desc(healthNote.createdAt))
      .all();

    if (tag) {
      const wanted = tag.toLowerCase();
      rows = rows.filter((n) => n.tags.some((t) => t.toLowerCase() === wanted));
    }
    if (query) {
      const q = query.toLowerCase();
      rows = rows.filter((n) =>
        [n.title, n.summary, n.originalText].some((s) => s?.toLowerCase().includes(q)),
      );
    }

    return ok({ total: rows.length, notes: rows.slice(0, limit) });
  },
);

server.registerTool(
  "add_health_note",
  {
    title: "Add health note",
    description:
      "Saves a free-form health journal note — context that doesn't fit a structured record (a concern, an observed pattern, family history, a treatment story). Keep `text` verbatim in the user's own words; put your condensed version in `summary`. If the date is vague ('last spring'), pick the closest ISO date, set datePrecision accordingly and keep the user's phrase in dateRaw. Set dryRun=true to preview.",
    inputSchema: {
      profileId: z.number().int().optional(),
      text: z.string().min(1).describe("The note verbatim, in the user's own words"),
      title: z.string().optional().describe("Short headline, e.g. 'Recurring morning headaches'"),
      summary: z.string().optional().describe("1–2 sentence condensed version of the text"),
      category: z
        .enum(["general", "concern", "symptom_pattern", "treatment", "history", "other"])
        .default("general"),
      date: z
        .string()
        .regex(ISO_DATE)
        .optional()
        .describe("Date the note refers to (not today's date), YYYY-MM-DD"),
      datePrecision: z
        .enum(["day", "month", "year", "approximate", "range", "unknown"])
        .optional()
        .describe("How precise `date` is; defaults to 'day' when date is set, else 'unknown'"),
      dateRaw: z
        .string()
        .optional()
        .describe("The user's original date phrase, e.g. 'last spring'"),
      tags: z.array(z.string().min(1)).default([]).describe("Short lowercase topic tags"),
      dryRun: z.boolean().default(false),
    },
  },
  async ({
    profileId,
    text,
    title,
    summary,
    category,
    date,
    datePrecision,
    dateRaw,
    tags,
    dryRun,
  }) => {
    const w = beginWrite(profileId);
    if (!w.ok) return w.result;
    if (date && date > todayIso()) return fail(`date ${date} is in the future.`);

    const row = {
      profileId: w.pid,
      category,
      title: title ?? null,
      summary: summary ?? null,
      originalText: text,
      date: date ?? null,
      datePrecision: datePrecision ?? (date ? ("day" as const) : ("unknown" as const)),
      dateRaw: dateRaw ?? null,
      tags,
    };
    if (dryRun) return ok({ saved: false, dryRun: true, row });

    const inserted = db.orm.insert(healthNote).values(row).returning({ id: healthNote.id }).get();
    return ok({ saved: true, id: inserted.id, row });
  },
);

// ── imaging ─────────────────────────────────────────────────────────────────

server.registerTool(
  "list_imaging_records",
  {
    title: "List imaging records",
    description:
      "Lists imaging studies (X-ray, CT, MRI, ultrasound, PET) with body area, findings and where they were done.",
    inputSchema: {
      profileId: z.number().int().optional(),
      modalityType: z.enum(["xray", "ct", "mri", "ultrasound", "pet", "other"]).optional(),
      from: z.string().regex(ISO_DATE).optional().describe("Inclusive lower bound, YYYY-MM-DD"),
      to: z.string().regex(ISO_DATE).optional().describe("Inclusive upper bound, YYYY-MM-DD"),
    },
  },
  async ({ profileId, modalityType, from, to }) => {
    const pid = resolveProfileId(profileId);
    if ("error" in pid) return fail(pid.error);

    const conditions = [eq(imagingRecord.profileId, pid.id)];
    if (modalityType) conditions.push(eq(imagingRecord.modalityType, modalityType));
    if (from) conditions.push(gte(imagingRecord.date, from));
    if (to) conditions.push(lte(imagingRecord.date, to));

    const rows = db.orm
      .select()
      .from(imagingRecord)
      .where(and(...conditions))
      .orderBy(desc(imagingRecord.date))
      .all();
    return ok({ imagingRecords: rows });
  },
);

server.registerTool(
  "add_imaging_record",
  {
    title: "Add imaging record",
    description:
      "Records an imaging study (X-ray, CT, MRI, ultrasound, PET). Copy `findings` from the radiology report / user's words — never interpret or extend them. Pass visitId when the study belongs to a known appointment. Set dryRun=true to preview.",
    inputSchema: {
      profileId: z.number().int().optional(),
      date: z.string().regex(ISO_DATE).describe("Study date, YYYY-MM-DD"),
      modalityType: z.enum(["xray", "ct", "mri", "ultrasound", "pet", "other"]),
      bodyArea: z.string().min(1).describe("What was scanned, e.g. 'lumbar spine', 'abdomen'"),
      findings: z.string().optional().describe("Findings/conclusion as reported, verbatim"),
      radiologistName: z.string().optional(),
      clinic: z.string().optional(),
      city: z.string().optional(),
      country: z.string().optional(),
      visitId: z.number().int().optional().describe("Visit this study belongs to"),
      dryRun: z.boolean().default(false),
    },
  },
  async (input) => {
    const w = beginWrite(input.profileId);
    if (!w.ok) return w.result;
    if (input.date > todayIso()) return fail(`date ${input.date} is in the future.`);
    if (input.visitId != null) {
      const err = checkVisit(input.visitId, w.pid);
      if (err) return fail(err);
    }

    const row = {
      profileId: w.pid,
      date: input.date,
      modalityType: input.modalityType,
      bodyArea: input.bodyArea,
      findings: input.findings ?? null,
      radiologistName: input.radiologistName ?? null,
      clinic: input.clinic ?? null,
      city: input.city ?? null,
      country: input.country ?? null,
      visitId: input.visitId ?? null,
    };
    if (input.dryRun) return ok({ saved: false, dryRun: true, row });

    const inserted = db.orm
      .insert(imagingRecord)
      .values(row)
      .returning({ id: imagingRecord.id })
      .get();
    return ok({ saved: true, id: inserted.id, row });
  },
);

// ── retest schedules ────────────────────────────────────────────────────────

function retestStatus(nextDue: string | null): "unanchored" | "overdue" | "due_soon" | "scheduled" {
  if (nextDue == null) return "unanchored";
  const today = todayIso();
  if (nextDue < today) return "overdue";
  if (nextDue <= addMonthsIso(today, 1)) return "due_soon";
  return "scheduled";
}

server.registerTool(
  "list_retest_schedules",
  {
    title: "List retest schedules",
    description:
      "Lists re-testing reminders ('re-check Vitamin D every 6 months') with the computed next due date and a status: overdue, due_soon (within a month), scheduled, or unanchored (no last-tested date yet). Use it to answer 'what labs am I due for'.",
    inputSchema: {
      profileId: z.number().int().optional(),
      includeInactive: z.boolean().default(false).describe("Also return paused schedules"),
    },
  },
  async ({ profileId, includeInactive }) => {
    const pid = resolveProfileId(profileId);
    if ("error" in pid) return fail(pid.error);

    const conditions = [eq(retestSchedule.profileId, pid.id)];
    if (!includeInactive) conditions.push(eq(retestSchedule.active, true));

    const rows = db.orm
      .select()
      .from(retestSchedule)
      .where(and(...conditions))
      .all()
      .map((r) => {
        const nextDueDate =
          r.lastTestedDate != null ? addMonthsIso(r.lastTestedDate, r.intervalMonths) : null;
        return { ...r, nextDueDate, dueStatus: retestStatus(nextDueDate) };
      })
      .sort((a, b) => (a.nextDueDate ?? "9999").localeCompare(b.nextDueDate ?? "9999"));

    return ok({ schedules: rows });
  },
);

server.registerTool(
  "set_retest_schedule",
  {
    title: "Set retest schedule",
    description:
      "Creates or updates a re-testing cadence ('re-check TSH every 12 months'). Matched by label case-insensitively: an existing schedule with the same label is updated, otherwise a new one is created. Link a dictionary biomarker via biomarkerId (from search_biomarkers) when the label is a single biomarker. lastTestedDate anchors the cadence — next due = lastTestedDate + intervalMonths. Set active=false to pause. Set dryRun=true to preview.",
    inputSchema: {
      profileId: z.number().int().optional(),
      label: z.string().min(1).describe("What to re-test, e.g. 'Lipid panel', 'Vitamin D'"),
      intervalMonths: z.number().int().min(1).max(120).describe("Months between re-tests"),
      biomarkerId: z
        .number()
        .int()
        .optional()
        .describe("Dictionary biomarker id from search_biomarkers, when applicable"),
      lastTestedDate: z
        .string()
        .regex(ISO_DATE)
        .optional()
        .describe("Most recent test date, YYYY-MM-DD — the cadence anchor"),
      notes: z.string().optional(),
      active: z.boolean().default(true).describe("false pauses the schedule without deleting it"),
      dryRun: z.boolean().default(false),
    },
  },
  async ({
    profileId,
    label,
    intervalMonths,
    biomarkerId,
    lastTestedDate,
    notes,
    active,
    dryRun,
  }) => {
    const w = beginWrite(profileId);
    if (!w.ok) return w.result;
    if (lastTestedDate && lastTestedDate > todayIso()) {
      return fail(`lastTestedDate ${lastTestedDate} is in the future.`);
    }
    if (biomarkerId != null) {
      const bio = db.orm
        .select({ id: biomarker.id })
        .from(biomarker)
        .where(eq(biomarker.id, biomarkerId))
        .get();
      if (!bio) return fail(`Biomarker ${biomarkerId} not found — resolve via search_biomarkers.`);
    }

    const existing = db.orm
      .select()
      .from(retestSchedule)
      .where(
        and(
          eq(retestSchedule.profileId, w.pid),
          sql`lower(${retestSchedule.label}) = lower(${label})`,
        ),
      )
      .get();

    const row = {
      profileId: w.pid,
      label: existing?.label ?? label,
      intervalMonths,
      biomarkerId: biomarkerId ?? existing?.biomarkerId ?? null,
      lastTestedDate: lastTestedDate ?? existing?.lastTestedDate ?? null,
      notes: notes ?? existing?.notes ?? null,
      active,
    };
    const nextDueDate =
      row.lastTestedDate != null ? addMonthsIso(row.lastTestedDate, intervalMonths) : null;
    const action = existing ? "updated" : "created";
    if (dryRun) return ok({ saved: false, dryRun: true, action, row, nextDueDate });

    if (existing) {
      db.orm.update(retestSchedule).set(row).where(eq(retestSchedule.id, existing.id)).run();
      return ok({ saved: true, action, id: existing.id, row, nextDueDate });
    }
    const inserted = db.orm
      .insert(retestSchedule)
      .values(row)
      .returning({ id: retestSchedule.id })
      .get();
    return ok({ saved: true, action, id: inserted.id, row, nextDueDate });
  },
);

// ── lab browsing ────────────────────────────────────────────────────────────

server.registerTool(
  "list_lab_panels",
  {
    title: "List lab panels",
    description:
      "Lists lab-draw events (date, lab, location, specimen types, fasting state) with per-panel counts of results, out-of-range results and unstructured findings. Use get_lab_panel for the actual values and get_biomarker_trend for one marker over time.",
    inputSchema: {
      profileId: z.number().int().optional(),
      from: z.string().regex(ISO_DATE).optional().describe("Inclusive lower bound, YYYY-MM-DD"),
      to: z.string().regex(ISO_DATE).optional().describe("Inclusive upper bound, YYYY-MM-DD"),
    },
  },
  async ({ profileId, from, to }) => {
    const pid = resolveProfileId(profileId);
    if ("error" in pid) return fail(pid.error);

    const conditions = [eq(labPanel.profileId, pid.id)];
    if (from) conditions.push(gte(labPanel.date, from));
    if (to) conditions.push(lte(labPanel.date, to));

    const panels = db.orm
      .select()
      .from(labPanel)
      .where(and(...conditions))
      .orderBy(desc(labPanel.date))
      .all();
    if (panels.length === 0) return ok({ panels: [] });

    const ids = panels.map((p) => p.id);
    const resultCounts = db.orm
      .select({
        panelId: labResult.panelId,
        results: sql<number>`count(*)`,
        outOfRange: sql<number>`sum(case when ${labResult.outOfRange} then 1 else 0 end)`,
      })
      .from(labResult)
      .where(inArray(labResult.panelId, ids))
      .groupBy(labResult.panelId)
      .all();
    const findingCounts = db.orm
      .select({ panelId: labFinding.panelId, findings: sql<number>`count(*)` })
      .from(labFinding)
      .where(inArray(labFinding.panelId, ids))
      .groupBy(labFinding.panelId)
      .all();

    return ok({
      panels: panels.map((p) => ({
        id: p.id,
        date: p.date,
        labName: p.labName,
        city: p.city,
        country: p.country,
        sampleTypes: p.sampleTypes,
        fasting: p.fasting,
        collectionTime: p.collectionTime,
        notes: p.notes,
        resultCount: resultCounts.find((c) => c.panelId === p.id)?.results ?? 0,
        outOfRangeCount: resultCounts.find((c) => c.panelId === p.id)?.outOfRange ?? 0,
        findingCount: findingCounts.find((c) => c.panelId === p.id)?.findings ?? 0,
      })),
    });
  },
);

server.registerTool(
  "get_lab_panel",
  {
    title: "Get lab panel",
    description:
      "Returns one lab panel in full: draw context (date, lab, fasting, collection time) plus every result normalized to the biomarker's default unit with reference/optimal ranges and flags, and any unstructured findings (qualitative results, unmapped analytes). Find panel ids with list_lab_panels.",
    inputSchema: {
      profileId: z.number().int().optional(),
      panelId: z.number().int().describe("Panel id from list_lab_panels"),
    },
  },
  async ({ profileId, panelId }) => {
    const pid = resolveProfileId(profileId);
    if ("error" in pid) return fail(pid.error);

    const panel = db.orm.select().from(labPanel).where(eq(labPanel.id, panelId)).get();
    if (!panel || panel.profileId !== pid.id) {
      return fail(`Panel ${panelId} not found — check list_lab_panels.`);
    }

    const results = db.orm
      .select({
        biomarkerId: labResult.biomarkerId,
        name: biomarker.canonicalName,
        category: biomarker.category,
        value: labResult.value,
        unit: labResult.unit,
        valueNormalized: labResult.valueNormalized,
        unitNormalized: labResult.unitNormalized,
        outOfRange: labResult.outOfRange,
        flag: labResult.flag,
        refLow: biomarker.refLow,
        refHigh: biomarker.refHigh,
        optimalLow: biomarker.optimalLow,
        optimalHigh: biomarker.optimalHigh,
      })
      .from(labResult)
      .innerJoin(biomarker, eq(labResult.biomarkerId, biomarker.id))
      .where(eq(labResult.panelId, panelId))
      .all();

    const findings = db.orm
      .select({
        rawLabel: labFinding.rawLabel,
        nameEn: labFinding.nameEn,
        valueText: labFinding.valueText,
        unit: labFinding.unit,
        refRangeText: labFinding.refRangeText,
      })
      .from(labFinding)
      .where(eq(labFinding.panelId, panelId))
      .all();

    return ok({
      panel: {
        id: panel.id,
        date: panel.date,
        labName: panel.labName,
        city: panel.city,
        country: panel.country,
        sampleTypes: panel.sampleTypes,
        fasting: panel.fasting,
        collectionTime: panel.collectionTime,
        menstrualCycleDay: panel.menstrualCycleDay,
        notes: panel.notes,
      },
      results: results.map((r) => ({
        ...r,
        value: r.valueNormalized ?? r.value,
        unit: r.unitNormalized ?? r.unit,
      })),
      findings,
    });
  },
);

// ── vaccines ────────────────────────────────────────────────────────────────

server.registerTool(
  "list_vaccines",
  {
    title: "List vaccines",
    description:
      "Full vaccination history (get_medical_summary shows only the 5 most recent): name, date, dose number in the series, manufacturer, validity and an `expired` flag. Use it for 'am I covered for X' and travel-vaccine questions.",
    inputSchema: {
      profileId: z.number().int().optional(),
    },
  },
  async ({ profileId }) => {
    const pid = resolveProfileId(profileId);
    if ("error" in pid) return fail(pid.error);
    const today = todayIso();

    const rows = db.orm
      .select()
      .from(vaccine)
      .where(eq(vaccine.profileId, pid.id))
      .orderBy(desc(vaccine.date))
      .all()
      .map((v) => ({ ...v, expired: v.expiresAt != null && v.expiresAt < today }));
    return ok({ vaccines: rows });
  },
);

// ── profile ─────────────────────────────────────────────────────────────────

server.registerTool(
  "update_profile",
  {
    title: "Update profile",
    description:
      "Updates lifestyle and body fields on the profile: height, current/target weight snapshots, activity level, smoking, alcohol, chronic-conditions text. Pass only the fields the user stated; pass an empty string to clear a text field. For weight measurements over time prefer log_weight — this only updates the profile snapshot. Set dryRun=true to preview the before/after diff.",
    inputSchema: {
      profileId: z.number().int().optional(),
      heightCm: z.number().min(50).max(260).optional(),
      weightKg: z.number().min(20).max(400).optional().describe("Current-weight snapshot, kg"),
      targetWeightKg: z.number().min(20).max(400).optional(),
      activityLevel: z.enum(["sedentary", "light", "moderate", "active", "very_active"]).optional(),
      smoking: z.enum(["never", "former", "current"]).optional(),
      alcohol: z.enum(["none", "occasional", "moderate", "heavy"]).optional(),
      conditions: z
        .string()
        .optional()
        .describe("Free-text chronic conditions / health notes; '' clears it"),
      dryRun: z.boolean().default(false),
    },
  },
  async (input) => {
    const w = beginWrite(input.profileId);
    if (!w.ok) return w.result;

    const p = db.orm.select().from(profile).where(eq(profile.id, w.pid)).get();
    if (!p) return fail(`Profile ${w.pid} not found.`);

    const patch: Record<string, unknown> = {};
    for (const f of [
      "heightCm",
      "weightKg",
      "targetWeightKg",
      "activityLevel",
      "smoking",
      "alcohol",
    ] as const) {
      if (input[f] != null) patch[f] = input[f];
    }
    if (input.conditions != null)
      patch.conditions = input.conditions === "" ? null : input.conditions;
    if (Object.keys(patch).length === 0) return fail("Pass at least one field to update.");

    const before = Object.fromEntries(
      Object.keys(patch).map((k) => [k, p[k as keyof typeof p] ?? null]),
    );
    if (input.dryRun) return ok({ saved: false, dryRun: true, before, after: patch });

    db.orm.update(profile).set(patch).where(eq(profile.id, w.pid)).run();
    return ok({ saved: true, before, after: patch });
  },
);

// ── resources ───────────────────────────────────────────────────────────────

server.registerResource(
  "biomarker-dictionary",
  "soma://biomarkers",
  {
    title: "Biomarker dictionary",
    description:
      "Full Soma biomarker dictionary: canonical names, EN/RU aliases, default units, reference and optimal ranges.",
    mimeType: "application/json",
  },
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(db.orm.select().from(biomarker).all().map(biomarkerSummary), null, 2),
      },
    ],
  }),
);

// ── startup ─────────────────────────────────────────────────────────────────

console.error(`soma-mcp: serving ${dbPath}${db.writable ? "" : " (read-only)"}`);
await server.connect(new StdioServerTransport());
