import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { and, asc, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  allergy,
  biomarker,
  bpLog,
  diagnosis,
  labPanel,
  labResult,
  medication,
  profile,
  symptomLog,
  vaccine,
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
- Trends: get_symptom_trend (severity over time + overlapping meds), get_weight_trend (kg vs target), get_bp_trend (systolic/diastolic with normal/stage2/crisis flags).
- Writes are validated strictly: add_lab_panel, add_allergy, add_vaccine and log_symptom validate dates (no future dates) and enums, refuse instead of guessing, and support dryRun=true to preview the exact row. log_symptom reuses the existing spelling of a known symptom when it matches case-insensitively. Write tools are disabled unless the user set SOMA_MCP_ALLOW_WRITES=1 for this server; if a write is refused for that reason, tell the user to enable it in their MCP client config rather than retrying.
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
      dryRun: z.boolean().default(false),
    },
  },
  async ({ profileId, symptomName, severity, date, time, notes, dryRun }) => {
    if (!WRITES_ENABLED) return fail(WRITES_DISABLED_MESSAGE);
    if (!db.writable) return fail(`Database is read-only for this server: ${db.schemaNote}`);
    const pid = resolveProfileId(profileId);
    if ("error" in pid) return fail(pid.error);

    const effectiveDate = date ?? todayIso();
    if (effectiveDate > todayIso()) return fail(`date ${effectiveDate} is in the future.`);

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
    };
    if (dryRun) {
      return ok({ saved: false, dryRun: true, row, reusedSpelling, requestedName: symptomName });
    }

    const inserted = db.orm.insert(symptomLog).values(row).returning({ id: symptomLog.id }).get();
    return ok({ saved: true, id: inserted.id, row, reusedSpelling, requestedName: symptomName });
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
