import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { and, asc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import { biomarker, labPanel, labResult, medication, profile } from "../../src/db/schema";
import { computeFlag, convertToDefaultUnit } from "../../src/lib/units";
import { openDb, resolveDbPath } from "./db";
import { describeCandidates, matchBiomarker } from "./mapping";

const INSTRUCTIONS = `Soma is a local-first personal health database (labs, medications, visits, diagnoses).
Domain rules you must follow:
- Biomarkers come from a fixed dictionary with canonical names, EN/RU aliases, a default unit, reference ranges (refLow/refHigh) and optimal ranges. Never invent biomarkers: resolve names with search_biomarkers first.
- Values are stored in the biomarker's default unit; out-of-range flags are computed against the reference range in that unit.
- All dates are ISO 8601 (YYYY-MM-DD). Medications have intake periods (startDate, endDate; endDate=null means currently taking) — when interpreting a biomarker trend, correlate changes with overlapping medication periods returned by get_biomarker_trend.
- Writes are validated strictly: add_lab_panel refuses unmapped biomarkers and unknown unit conversions instead of guessing. Use dryRun=true first when unsure.
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
      panelType: z.enum(["blood", "urine", "other"]).default("blood"),
      results: z.array(labResultInput).min(1),
      dryRun: z.boolean().default(false),
    },
  },
  async ({ profileId, date, labName, city, country, panelType, results, dryRun }) => {
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
      return fail(
        JSON.stringify({ saved: false, errors, validRows: review }, null, 2),
      );
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
          panelType,
          importMethod: "manual",
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
