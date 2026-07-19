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
  getSymptomSeries,
  getVisit,
  listBiomarkers,
  listAllergies,
  listBpLog,
  listDiagnoses,
  listLifestyleLog,
  listMedications,
  listSymptomNames,
  listSymptomLog,
  listVaccines,
  listWeightLog,
} from "@/db/repos";
import { ensureSearchIndex, searchRecords } from "@/db/search";
import { normalizeLabel, similarity } from "@/lib/fuzzy";

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
    name: "get_biomarker_trend",
    description: "Resolves a biomarker name and returns its normalized time series.",
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
    const points = await getBiomarkerSeries(profileId, target.item.id);
    return {
      biomarker: { ...target.item, ref: `biomarker:${target.item.id}`, score: target.score },
      points,
    };
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
