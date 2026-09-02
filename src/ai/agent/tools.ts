import type { AIToolDefinition } from "../types";
import { healthChangeSetJsonSchema } from "./change-schema";
import { buildHealthContext } from "../context";
import {
  getBiomarker,
  getBiomarkerSeries,
  getDiagnosis,
  getImagingRecord,
  getHealthNote,
  getMedication,
  getPanel,
  getProfile,
  getReferenceRangesByBiomarker,
  getSymptomSeries,
  getVisit,
  listBiomarkers,
  listAllergies,
  listBpLog,
  listDiagnoses,
  listHealthNotes,
  listLifestyleLog,
  listMedications,
  listSymptomNames,
  listSymptomLog,
  listVaccines,
  listWeightLog,
} from "@/db/repos";
import { ensureSearchIndex, searchRecords } from "@/db/search";
import { normalizeLabel, similarity } from "@/lib/fuzzy";
import { ageYearsFrom, resolveRange } from "@/lib/units";
import { localIsoDate } from "@/lib/clinical-date";
import { buildChangesSince, buildHealthReview, medicationsCovering } from "./review";
import { loadReviewInput } from "./review-data";
import { buildVaccinationStatus } from "./vaccination";

const objectSchema = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

export const agentToolDefinitions: AIToolDefinition[] = [
  {
    name: "get_safety_context",
    description: "Returns the fresh safety-critical medical summary for this profile.",
    inputSchema: objectSchema({}),
  },
  {
    name: "search_records",
    description: "Searches the user's stored health records by names and note text.",
    inputSchema: objectSchema(
      {
        query: { type: "string", minLength: 1 },
        limit: { type: "integer", minimum: 1, maximum: 20 },
      },
      ["query"],
    ),
  },
  {
    name: "get_record",
    description:
      "Loads one source record after search_records returned its entityType and entityId.",
    inputSchema: objectSchema(
      {
        entityType: { type: "string" },
        entityId: { type: "integer", minimum: 1 },
      },
      ["entityType", "entityId"],
    ),
  },
  {
    name: "get_medication_history",
    description: "Returns medication and supplement courses, optionally filtered by name.",
    inputSchema: objectSchema({
      query: { type: "string" },
      limit: { type: "integer", minimum: 1, maximum: 50 },
    }),
  },
  {
    name: "get_diagnosis_history",
    description: "Returns diagnosis history, optionally filtered by name.",
    inputSchema: objectSchema({
      query: { type: "string" },
      limit: { type: "integer", minimum: 1, maximum: 50 },
    }),
  },
  {
    name: "get_health_overview",
    description:
      "One-call review of the whole record, computed locally: latest out-of-range markers with their previous reading and the change classification, notable moves, sub-optimal values, markers abnormal when last measured but not re-checked for a year, overdue re-test schedules, active medications (days on course, planned end, drug-allergy conflicts), recent blood pressure and weight, symptoms in the last 30 days, data coverage and explicit data gaps. Call it FIRST for broad questions such as 'what should I pay attention to', 'how am I doing', 'anything worrying'. Every entry has a ref for citing.",
    inputSchema: objectSchema({}),
  },
  {
    name: "get_changes_since",
    description:
      "What changed in the record since a date: each marker measured on/after the date versus its last reading before it (with the change classification), medications started/stopped, diagnoses added/resolved, visits, vaccines, symptoms and average blood pressure/weight before vs after. Without sinceDate it compares the latest lab panel with the record before it. Use for 'what changed since last time / since June / after I started X'.",
    inputSchema: objectSchema({
      sinceDate: {
        type: "string",
        description:
          "ISO date YYYY-MM-DD; omit to compare the latest panel with the previous state.",
      },
    }),
  },
  {
    name: "get_vaccination_status",
    description:
      "Personalized vaccination status against the built-in WHO-based calendar, graded exactly as the Vaccines screen: actionable items (overdue adult boosters, lapsed certificates), doses due now, upcoming, done, childhood doses never recorded (a documentation gap, NOT overdue), travel/risk antigens (contextual), and recorded shots that match no calendar antigen. Includes a legend explaining each status. Call it for any question about vaccines, boosters or certificates; never answer those from general knowledge alone.",
    inputSchema: objectSchema({}),
  },
  {
    name: "get_biomarker_trend",
    description:
      "Resolves a biomarker name and returns its full normalized time series with the reference and optimal range in effect for this profile and the medications taken at each reading.",
    inputSchema: objectSchema({ query: { type: "string", minLength: 1 } }, ["query"]),
  },
  {
    name: "get_symptom_trend",
    description: "Returns a symptom severity series and known symptom names.",
    inputSchema: objectSchema({ symptomName: { type: "string", minLength: 1 } }, ["symptomName"]),
  },
  {
    name: "get_vitals_trend",
    description: "Returns recent weight or blood-pressure readings.",
    inputSchema: objectSchema(
      {
        kind: { type: "string", enum: ["weight", "blood_pressure"] },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
      ["kind"],
    ),
  },
  {
    name: "get_health_notes",
    description:
      "Returns free-form health notes (family history, concerns, symptom patterns) newest first, optionally filtered by category.",
    inputSchema: objectSchema({
      category: {
        type: "string",
        enum: ["general", "concern", "symptom_pattern", "treatment", "history", "other"],
      },
      limit: { type: "integer", minimum: 1, maximum: 50 },
    }),
  },
  {
    name: "get_lifestyle_log",
    description: "Returns recent sleep, activity, stress and energy entries.",
    inputSchema: objectSchema({ limit: { type: "integer", minimum: 1, maximum: 60 } }),
  },
  {
    name: "draft_health_changes",
    description:
      "Drafts explicit health facts for user review. This never writes medical records. Use only when the user provided or corrected persistent data. Do not infer missing dates, types, severity, status, units or diagnoses; use create_health_note when a fact cannot safely fit a typed record.",
    inputSchema: healthChangeSetJsonSchema(),
  },
];

export async function executeReadTool(
  profileId: number,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (name === "get_safety_context") return { summary: await buildHealthContext(profileId) };
  if (name === "search_records") {
    const query = textArg(args.query, "query");
    const limit = intArg(args.limit, 10, 1, 20);
    await ensureSearchIndex(profileId);
    const results = await searchRecords(profileId, query);
    return {
      results: results.slice(0, limit).map((result) => ({
        ...result,
        ref: `${result.entityType}:${result.entityId}`,
      })),
    };
  }
  if (name === "get_record") {
    return getRecord(profileId, textArg(args.entityType, "entityType"), intArg(args.entityId));
  }
  if (name === "get_medication_history") {
    const query = optionalTextArg(args.query);
    const limit = intArg(args.limit, 30, 1, 50);
    const rows = await listMedications(profileId);
    return {
      records: filterNamed(rows, (row) => row.name, query)
        .slice(0, limit)
        .map((row) => ({ ...row, ref: `medication:${row.id}` })),
    };
  }
  if (name === "get_diagnosis_history") {
    const query = optionalTextArg(args.query);
    const limit = intArg(args.limit, 30, 1, 50);
    const rows = await listDiagnoses(profileId);
    return {
      records: filterNamed(rows, (row) => row.name, query)
        .slice(0, limit)
        .map((row) => ({ ...row, ref: `diagnosis:${row.id}` })),
    };
  }
  if (name === "get_biomarker_trend") {
    const query = textArg(args.query, "query");
    const biomarkers = await listBiomarkers();
    const target = normalizedMatch(
      query,
      biomarkers.map((item) => ({ item, labels: [item.canonicalName, ...item.aliases] })),
    );
    if (!target || target.score < 0.62) {
      return {
        match: null,
        candidates: biomarkers
          .map((item) => ({
            id: item.id,
            name: item.canonicalName,
            score: similarity(normalizeLabel(query), normalizeLabel(item.canonicalName)),
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 5),
      };
    }
    const [points, profile, rangesByBiomarker, medications] = await Promise.all([
      getBiomarkerSeries(profileId, target.item.id),
      getProfile(profileId),
      getReferenceRangesByBiomarker(),
      listMedications(profileId),
    ]);
    // The range the flags were computed against (sex/age-specific when one
    // exists) and the medications covering each reading: the two things a
    // trend cannot be read without, so the model never has to guess them.
    const range = resolveRange(target.item, rangesByBiomarker.get(target.item.id), {
      sex: profile?.sex ?? null,
      ageYears: ageYearsFrom(profile?.birthDate),
    });
    return {
      biomarker: { ...target.item, ref: `biomarker:${target.item.id}`, score: target.score },
      rangeForProfile: range,
      points: points.map((p) => ({
        ...p,
        ref: `lab_panel:${p.panelId}`,
        medicationsAtReading: medicationsCovering(medications, p.date).map((m) => m.name),
      })),
    };
  }
  if (name === "get_health_overview") {
    return buildHealthReview(await loadReviewInput(profileId, localIsoDate()));
  }
  if (name === "get_changes_since") {
    const sinceDate = optionalTextArg(args.sinceDate);
    if (sinceDate && !/^\d{4}-\d{2}-\d{2}$/.test(sinceDate)) {
      throw new Error("sinceDate must be an ISO date (YYYY-MM-DD)");
    }
    return buildChangesSince(await loadReviewInput(profileId, localIsoDate()), sinceDate);
  }
  if (name === "get_vaccination_status") {
    const [profile, vaccines] = await Promise.all([getProfile(profileId), listVaccines(profileId)]);
    return buildVaccinationStatus({
      today: localIsoDate(),
      birthDate: profile?.birthDate ?? null,
      vaccines,
    });
  }
  if (name === "get_symptom_trend") {
    const symptomName = textArg(args.symptomName, "symptomName");
    const names = await listSymptomNames(profileId);
    const target = normalizedMatch(
      symptomName,
      names.map((item) => ({ item, labels: [item] })),
    );
    if (!target || target.score < 0.72) return { points: [], knownSymptoms: names.slice(0, 30) };
    return { symptomName: target.item, points: await getSymptomSeries(profileId, target.item) };
  }
  if (name === "get_vitals_trend") {
    const kind = textArg(args.kind, "kind");
    const limit = intArg(args.limit, 30, 1, 100);
    if (kind === "weight")
      return { kind, points: (await listWeightLog(profileId)).slice(0, limit) };
    if (kind === "blood_pressure")
      return { kind, points: (await listBpLog(profileId)).slice(0, limit) };
    throw new Error("Unsupported vitals kind");
  }
  if (name === "get_health_notes") {
    const category = optionalTextArg(args.category);
    const limit = intArg(args.limit, 20, 1, 50);
    const rows = await listHealthNotes(profileId);
    return {
      records: rows
        .filter((row) => !category || row.category === category)
        .slice(0, limit)
        .map((row) => ({ ...row, ref: `health_note:${row.id}` })),
    };
  }
  if (name === "get_lifestyle_log") {
    const limit = intArg(args.limit, 30, 1, 60);
    return { records: (await listLifestyleLog(profileId)).slice(0, limit) };
  }
  throw new Error(`Unsupported tool: ${name}`);
}

async function getRecord(
  profileId: number,
  entityType: string,
  entityId: number,
): Promise<unknown> {
  if (entityType === "medication")
    return owned(await getMedication(entityId), profileId, entityType);
  if (entityType === "diagnosis") return owned(await getDiagnosis(entityId), profileId, entityType);
  if (entityType === "imaging")
    return owned(await getImagingRecord(entityId), profileId, entityType);
  if (entityType === "visit") return owned(await getVisit(entityId), profileId, entityType);
  if (entityType === "health_note")
    return owned(await getHealthNote(entityId), profileId, entityType);
  if (entityType === "lab_panel") return owned(await getPanel(entityId), profileId, entityType);
  if (entityType === "biomarker") return getBiomarker(entityId);
  if (entityType === "vaccine") {
    const row = (await listVaccines(profileId)).find((item) => item.id === entityId) ?? null;
    return row ? { ...row, ref: `vaccine:${row.id}` } : null;
  }
  if (entityType === "allergy") {
    const row = (await listAllergies(profileId)).find((item) => item.id === entityId) ?? null;
    return row ? { ...row, ref: `allergy:${row.id}` } : null;
  }
  if (entityType === "symptom") {
    const row = (await listSymptomLog(profileId)).find((item) => item.id === entityId) ?? null;
    return row ? { ...row, ref: `symptom:${row.id}` } : null;
  }
  throw new Error(`Unsupported record type: ${entityType}`);
}

function owned<T extends { id: number; profileId?: number }>(
  row: T | null,
  profileId: number,
  entityType: string,
): (T & { ref: string }) | null {
  if (!row || (row.profileId != null && row.profileId !== profileId)) return null;
  return { ...row, ref: `${entityType}:${row.id}` };
}

function filterNamed<T>(rows: T[], name: (row: T) => string, query: string | null): T[] {
  if (!query) return rows;
  const normalized = normalizeLabel(query);
  return rows.filter((row) => {
    const label = normalizeLabel(name(row));
    return (
      label.includes(normalized) ||
      normalized.includes(label) ||
      similarity(label, normalized) >= 0.72
    );
  });
}

function normalizedMatch<T>(
  query: string,
  candidates: { item: T; labels: string[] }[],
): { item: T; score: number } | null {
  const normalized = normalizeLabel(query);
  let best: { item: T; score: number } | null = null;
  for (const candidate of candidates) {
    const score = Math.max(
      ...candidate.labels.map((label) => {
        const value = normalizeLabel(label);
        return value === normalized ? 1 : similarity(normalized, value);
      }),
    );
    if (!best || score > best.score) best = { item: candidate.item, score };
  }
  return best;
}

function textArg(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} must be a string`);
  return value.trim();
}

function optionalTextArg(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function intArg(value: unknown, fallback?: number, min = 1, max = Number.MAX_SAFE_INTEGER): number {
  if (value == null && fallback != null) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new Error("Invalid integer argument");
  }
  return value;
}
