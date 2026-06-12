import { sql } from "drizzle-orm";
import { db } from "./client";
import {
  biomarker,
  labPanel,
  visit,
  diagnosis,
  medication,
  allergy,
  vaccine,
  symptomLog,
  imagingRecord,
} from "./schema";

/**
 * Full-text search over the user's records, backed by the `fts_records`
 * FTS5 virtual table (migration 0006). The index is denormalized: each row
 * stores its display `title`/`subtitle`/`date` as UNINDEXED columns, so a
 * search needs no joins back to the source tables.
 *
 * The index is rebuilt programmatically (no SQL triggers): it holds only a few
 * hundred rows in practice, so a full rebuild is cheap and always fresh.
 */

export type EntityType =
  | "biomarker"
  | "lab_panel"
  | "visit"
  | "diagnosis"
  | "medication"
  | "allergy"
  | "vaccine"
  | "symptom"
  | "imaging";

export type SearchResult = {
  entityType: EntityType;
  entityId: number;
  title: string;
  subtitle: string;
  date: string | null;
};

type IndexRow = {
  entityType: EntityType;
  entityId: number;
  title: string;
  subtitle: string;
  date: string | null;
  content: string;
};

/** Joins non-empty parts into the searchable `content` blob. */
function blob(...parts: (string | null | undefined)[]): string {
  return parts
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(" ");
}

async function collectRows(profileId: number): Promise<IndexRow[]> {
  const rows: IndexRow[] = [];

  // Biomarkers are a shared dictionary (no profile_id); index them all.
  const biomarkers = await db
    .select({
      id: biomarker.id,
      canonicalName: biomarker.canonicalName,
      category: biomarker.category,
      aliases: biomarker.aliases,
    })
    .from(biomarker);
  for (const b of biomarkers) {
    const aliases = Array.isArray(b.aliases) ? b.aliases : [];
    rows.push({
      entityType: "biomarker",
      entityId: b.id,
      title: b.canonicalName,
      subtitle: b.category,
      date: null,
      content: blob(b.canonicalName, b.category, ...aliases),
    });
  }

  const panels = await db
    .select({
      id: labPanel.id,
      date: labPanel.date,
      labName: labPanel.labName,
      city: labPanel.city,
      country: labPanel.country,
    })
    .from(labPanel)
    .where(sql`${labPanel.profileId} = ${profileId}`);
  for (const p of panels) {
    rows.push({
      entityType: "lab_panel",
      entityId: p.id,
      title: p.labName ?? "Lab panel",
      subtitle: blob(p.city, p.country),
      date: p.date,
      content: blob(p.labName, p.city, p.country),
    });
  }

  const visits = await db
    .select({
      id: visit.id,
      date: visit.date,
      doctorName: visit.doctorName,
      clinic: visit.clinic,
      city: visit.city,
      country: visit.country,
      specialty: visit.specialty,
      notes: visit.notes,
    })
    .from(visit)
    .where(sql`${visit.profileId} = ${profileId}`);
  for (const v of visits) {
    rows.push({
      entityType: "visit",
      entityId: v.id,
      title: v.doctorName ?? v.clinic ?? v.specialty ?? "Visit",
      subtitle: blob(v.specialty, v.clinic, v.city, v.country),
      date: v.date,
      content: blob(v.doctorName, v.clinic, v.city, v.country, v.specialty, v.notes),
    });
  }

  const diagnoses = await db
    .select({
      id: diagnosis.id,
      date: diagnosis.date,
      name: diagnosis.name,
      icdCode: diagnosis.icdCode,
    })
    .from(diagnosis)
    .where(sql`${diagnosis.profileId} = ${profileId}`);
  for (const d of diagnoses) {
    rows.push({
      entityType: "diagnosis",
      entityId: d.id,
      title: d.name,
      subtitle: d.icdCode ?? "",
      date: d.date,
      content: blob(d.name, d.icdCode),
    });
  }

  const medications = await db
    .select({
      id: medication.id,
      name: medication.name,
      purpose: medication.purpose,
      startDate: medication.startDate,
    })
    .from(medication)
    .where(sql`${medication.profileId} = ${profileId}`);
  for (const m of medications) {
    rows.push({
      entityType: "medication",
      entityId: m.id,
      title: m.name,
      subtitle: m.purpose ?? "",
      date: m.startDate,
      content: blob(m.name, m.purpose),
    });
  }

  const allergies = await db
    .select({
      id: allergy.id,
      allergen: allergy.allergen,
      reaction: allergy.reaction,
      onsetDate: allergy.onsetDate,
    })
    .from(allergy)
    .where(sql`${allergy.profileId} = ${profileId}`);
  for (const a of allergies) {
    rows.push({
      entityType: "allergy",
      entityId: a.id,
      title: a.allergen,
      subtitle: a.reaction ?? "",
      date: a.onsetDate ?? null,
      content: blob(a.allergen, a.reaction),
    });
  }

  const vaccines = await db
    .select({
      id: vaccine.id,
      vaccineName: vaccine.vaccineName,
      manufacturer: vaccine.manufacturer,
      date: vaccine.date,
    })
    .from(vaccine)
    .where(sql`${vaccine.profileId} = ${profileId}`);
  for (const v of vaccines) {
    rows.push({
      entityType: "vaccine",
      entityId: v.id,
      title: v.vaccineName,
      subtitle: v.manufacturer ?? "",
      date: v.date,
      content: blob(v.vaccineName, v.manufacturer),
    });
  }

  // Symptoms: one index row per distinct name, keyed by a representative log id.
  const symptoms = await db
    .select({
      id: symptomLog.id,
      symptomName: symptomLog.symptomName,
      date: symptomLog.date,
    })
    .from(symptomLog)
    .where(sql`${symptomLog.profileId} = ${profileId}`);
  const seenSymptom = new Set<string>();
  for (const s of symptoms) {
    const key = s.symptomName.trim().toLowerCase();
    if (seenSymptom.has(key)) continue;
    seenSymptom.add(key);
    rows.push({
      entityType: "symptom",
      entityId: s.id,
      title: s.symptomName,
      subtitle: "",
      date: s.date,
      content: s.symptomName,
    });
  }

  const imaging = await db
    .select({
      id: imagingRecord.id,
      modalityType: imagingRecord.modalityType,
      bodyArea: imagingRecord.bodyArea,
      findings: imagingRecord.findings,
      date: imagingRecord.date,
    })
    .from(imagingRecord)
    .where(sql`${imagingRecord.profileId} = ${profileId}`);
  for (const im of imaging) {
    rows.push({
      entityType: "imaging",
      entityId: im.id,
      title: blob(im.modalityType, im.bodyArea) || "Imaging",
      subtitle: im.findings ?? "",
      date: im.date,
      content: blob(im.modalityType, im.bodyArea, im.findings),
    });
  }

  return rows;
}

/** Deletes all index rows for the profile, then re-inserts one row per record. */
export async function rebuildSearchIndex(profileId: number): Promise<void> {
  try {
    const rows = await collectRows(profileId);
    await db.run(sql`DELETE FROM fts_records WHERE profile_id = ${profileId}`);
    for (const r of rows) {
      await db.run(sql`
        INSERT INTO fts_records (entity_type, entity_id, profile_id, title, subtitle, date, content)
        VALUES (${r.entityType}, ${r.entityId}, ${profileId}, ${r.title}, ${r.subtitle}, ${r.date}, ${r.content})
      `);
    }
  } catch (e) {
    console.warn("rebuildSearchIndex failed", e);
  }
}

/** Rebuilds the index only if it currently has no rows for this profile. */
export async function ensureSearchIndex(profileId: number): Promise<void> {
  try {
    const rows = await db.all<{ n: number }>(
      sql`SELECT count(*) AS n FROM fts_records WHERE profile_id = ${profileId}`,
    );
    const count = Number(rows[0]?.n ?? 0);
    if (count === 0) await rebuildSearchIndex(profileId);
  } catch (e) {
    // Table may not exist yet (migration not applied) — try a full rebuild.
    console.warn("ensureSearchIndex check failed; rebuilding", e);
    await rebuildSearchIndex(profileId);
  }
}

/** Builds a safe FTS5 MATCH expression with prefix matching on the last token. */
function toMatchQuery(query: string): string {
  const tokens = query
    .trim()
    .split(/\s+/)
    // Tokens that are empty once quotes are stripped would yield `""*` — an
    // FTS5 syntax error (empty quoted phrase) — so drop them entirely.
    .filter((tok) => tok.replace(/"/g, "") !== "")
    // Wrap each token in double quotes (escaping inner quotes) so punctuation
    // can't break the FTS5 grammar.
    .map((tok) => `"${tok.replace(/"/g, '""')}"`);
  if (tokens.length === 0) return "";
  // Prefix-match the final token: "stop"* → matches "stop", "stopwatch", …
  tokens[tokens.length - 1] = `${tokens[tokens.length - 1]}*`;
  return tokens.join(" ");
}

/**
 * Runs an FTS5 MATCH query, ranked by bm25, capped at ~40 rows.
 * Returns `[]` (with a console warning) if the virtual table does not exist
 * yet — e.g. before migration 0006 has been applied to the dev DB.
 */
export async function searchRecords(profileId: number, query: string): Promise<SearchResult[]> {
  const match = toMatchQuery(query);
  if (!match) return [];

  try {
    const rows = await db.all<{
      entity_type: EntityType;
      entity_id: number;
      title: string;
      subtitle: string;
      date: string | null;
    }>(sql`
      SELECT entity_type, entity_id, title, subtitle, date
      FROM fts_records
      WHERE profile_id = ${profileId} AND fts_records MATCH ${match}
      ORDER BY bm25(fts_records)
      LIMIT 40
    `);
    return rows.map((r) => ({
      entityType: r.entity_type,
      entityId: Number(r.entity_id),
      title: r.title,
      subtitle: r.subtitle,
      date: r.date,
    }));
  } catch (e) {
    console.warn("searchRecords MATCH failed", e);
    return [];
  }
}
