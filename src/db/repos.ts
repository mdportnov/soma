import { and, asc, count, desc, eq, inArray, isNull, like, sql } from "drizzle-orm";
import { db } from "./client";
import { assertAllergyDeletable } from "./guards";
import { deleteAttachmentFile } from "../lib/attachments";
import {
  allergy,
  attachment,
  biomarker,
  biomarkerReferenceRange,
  bpLog,
  diagnosis,
  healthNote,
  imagingRecord,
  labPanel,
  labFinding,
  labResult,
  lifestyleLog,
  medication,
  medicationLog,
  prescription,
  profile,
  retestSchedule,
  symptomLog,
  vaccine,
  visit,
  weightLog,
  type Allergy,
  type Attachment,
  type Biomarker,
  type BpLog,
  type Diagnosis,
  type ImagingRecord,
  type HealthNote,
  type LabPanel,
  type LabFinding,
  type LabResult,
  type LifestyleLog,
  type Medication,
  type MedicationLog,
  type NewAllergy,
  type NewAttachment,
  type NewBiomarker,
  type NewBpLog,
  type NewDiagnosis,
  type NewImagingRecord,
  type NewHealthNote,
  type NewLabPanel,
  type NewLabFinding,
  type NewLabResult,
  type NewLifestyleLog,
  type NewMedication,
  type NewPrescription,
  type NewProfile,
  type NewRetestSchedule,
  type NewSymptomLog,
  type NewVaccine,
  type NewVisit,
  type NewWeightLog,
  type Profile,
  type RetestSchedule,
  type SymptomLog,
  type Vaccine,
  type Visit,
  type WeightLog,
} from "./schema";
import {
  ageYearsFrom,
  computeFlag,
  convertToDefaultUnit,
  resolveRange,
  type DemographicRange,
  type ProfileContext,
} from "@/lib/units";
import {
  changeBetween,
  pointFromResult,
  type BiomarkerChange,
  type ChangeSeverity,
  type ValuePoint,
} from "@/lib/insights";

// ── profiles ───────────────────────────────────────────────────────────────

const ACTIVE_PROFILE_KEY = "soma.activeProfileId";

export async function ensureActiveProfile(): Promise<number> {
  const stored = localStorage.getItem(ACTIVE_PROFILE_KEY);
  if (stored) {
    const existing = await db
      .select()
      .from(profile)
      .where(eq(profile.id, Number(stored)));
    if (existing.length) return existing[0].id;
  }
  const all = await db.select().from(profile).orderBy(asc(profile.id)).limit(1);
  if (all.length) {
    localStorage.setItem(ACTIVE_PROFILE_KEY, String(all[0].id));
    return all[0].id;
  }
  const [created] = await db
    .insert(profile)
    .values({ name: "My profile" })
    .returning({ id: profile.id });
  localStorage.setItem(ACTIVE_PROFILE_KEY, String(created.id));
  return created.id;
}

export async function getProfile(id: number): Promise<Profile | null> {
  const rows = await db.select().from(profile).where(eq(profile.id, id));
  return rows[0] ?? null;
}

export type ProfileUpdate = Partial<Omit<NewProfile, "id" | "createdAt">>;

export async function updateProfile(id: number, data: ProfileUpdate) {
  // Sex/age drive demographic reference ranges → recompute stored flags so an
  // existing panel reflects the corrected range, not the one used at import.
  // `draftToUpdate` always sends sex+birthDate, so a key-presence check would
  // recompute on every profile save; compare against the stored row instead and
  // recompute only on a real demographic change (the recompute is O(all results)).
  const probeDemographics = "sex" in data || "birthDate" in data;
  const before = probeDemographics ? await getProfile(id) : null;
  await db.update(profile).set(data).where(eq(profile.id, id));
  const demographicsChanged =
    before != null &&
    (("sex" in data && data.sex !== before.sex) ||
      ("birthDate" in data && data.birthDate !== before.birthDate));
  if (demographicsChanged) {
    await recomputeFlagsForProfile(id);
  }
}

/**
 * Re-derives normalization + out-of-range flags for every lab result of a
 * profile, using the profile's current sex/age-specific ranges. Called when the
 * demographic context changes (onboarding, profile edit).
 */
export async function recomputeFlagsForProfile(profileId: number): Promise<void> {
  const prof = await getProfile(profileId);
  if (!prof) return;
  const [biomarkers, ranges] = await Promise.all([
    listBiomarkers(),
    getReferenceRangesByBiomarker(),
  ]);
  const bioById = new Map(biomarkers.map((b) => [b.id, b]));
  const rows = await db
    .select({
      id: labResult.id,
      biomarkerId: labResult.biomarkerId,
      value: labResult.value,
      unit: labResult.unit,
      date: labPanel.date,
    })
    .from(labResult)
    .innerJoin(labPanel, eq(labResult.panelId, labPanel.id))
    .where(eq(labPanel.profileId, profileId));
  for (const r of rows) {
    const bio = bioById.get(r.biomarkerId);
    let unitNormalized: string | null = null;
    let valueNormalized: number | null = null;
    let outOfRange = false;
    let flag: "low" | "high" | "critical" | null = null;
    if (bio) {
      const conv = convertToDefaultUnit(r.value, r.unit, bio);
      if (conv.ok) {
        unitNormalized = conv.unit;
        valueNormalized = conv.value;
        const ctx: ProfileContext = {
          sex: prof.sex ?? null,
          ageYears: ageYearsFrom(prof.birthDate, new Date(`${r.date.slice(0, 10)}T00:00:00Z`)),
        };
        const effective = resolveRange(bio, ranges.get(r.biomarkerId), ctx);
        ({ outOfRange, flag } = computeFlag(conv.value, effective, bio));
      }
    }
    await db
      .update(labResult)
      .set({ unitNormalized, valueNormalized, outOfRange, flag })
      .where(eq(labResult.id, r.id));
  }
}

/** True when the active profile has finished onboarding. */
export async function isOnboarded(id: number): Promise<boolean> {
  const rows = await db
    .select({ onboardedAt: profile.onboardedAt })
    .from(profile)
    .where(eq(profile.id, id));
  return !!rows[0]?.onboardedAt;
}

/** Persists onboarding answers and stamps completion. */
export async function completeOnboarding(id: number, data: ProfileUpdate) {
  await db
    .update(profile)
    .set({ ...data, onboardedAt: new Date().toISOString() })
    .where(eq(profile.id, id));
  if ("sex" in data || "birthDate" in data) {
    await recomputeFlagsForProfile(id);
  }
}

// ── biomarkers ─────────────────────────────────────────────────────────────

export async function listBiomarkers(): Promise<Biomarker[]> {
  return db.select().from(biomarker).orderBy(asc(biomarker.category), asc(biomarker.canonicalName));
}

export async function getBiomarker(id: number): Promise<Biomarker | null> {
  const rows = await db.select().from(biomarker).where(eq(biomarker.id, id));
  return rows[0] ?? null;
}

export async function createBiomarker(data: NewBiomarker): Promise<number> {
  const [row] = await db.insert(biomarker).values(data).returning({ id: biomarker.id });
  return row.id;
}

export async function updateBiomarker(id: number, data: Partial<NewBiomarker>) {
  await db.update(biomarker).set(data).where(eq(biomarker.id, id));
}

export type BiomarkerDictionaryEdit = {
  refLow: number | null;
  refHigh: number | null;
  optimalLow: number | null;
  optimalHigh: number | null;
  aliases: string[];
};

/**
 * Edits a dictionary entry's ranges and aliases from the in-app editor, stamping
 * `isUserModified` so the startup seed reconciliation (`syncBiomarkers`) stops
 * overriding it — the edit then persists across launches, for seeded entries too.
 */
export async function updateBiomarkerDictionary(id: number, data: BiomarkerDictionaryEdit) {
  await db
    .update(biomarker)
    .set({ ...data, isUserModified: true })
    .where(eq(biomarker.id, id));
}

/** All demographic reference ranges, grouped by biomarker id. */
export async function getReferenceRangesByBiomarker(): Promise<Map<number, DemographicRange[]>> {
  const rows = await db.select().from(biomarkerReferenceRange);
  const map = new Map<number, DemographicRange[]>();
  for (const r of rows) {
    const list = map.get(r.biomarkerId) ?? [];
    list.push({
      sex: r.sex,
      ageMinYears: r.ageMinYears,
      ageMaxYears: r.ageMaxYears,
      condition: r.condition,
      refLow: r.refLow,
      refHigh: r.refHigh,
      optimalLow: r.optimalLow,
      optimalHigh: r.optimalHigh,
    });
    map.set(r.biomarkerId, list);
  }
  return map;
}

// ── lab panels & results ───────────────────────────────────────────────────

export type PanelWithCount = LabPanel & {
  resultCount: number;
  outOfRangeCount: number;
  /** Results still awaiting the user's verification (uncertain AI mappings). */
  needsReviewCount: number;
};

export async function listPanels(profileId: number): Promise<PanelWithCount[]> {
  const rows = await db
    .select({
      panel: labPanel,
      resultCount: count(labResult.id),
      outOfRangeCount: sql<number>`coalesce(sum(${labResult.outOfRange}), 0)`,
      needsReviewCount: sql<number>`coalesce(sum(case when ${labResult.reviewedAt} is null then 1 else 0 end), 0)`,
    })
    .from(labPanel)
    .leftJoin(labResult, eq(labResult.panelId, labPanel.id))
    .where(eq(labPanel.profileId, profileId))
    .groupBy(labPanel.id)
    .orderBy(desc(labPanel.date), desc(labPanel.id));
  return rows.map((r) => ({
    ...r.panel,
    resultCount: r.resultCount,
    outOfRangeCount: Number(r.outOfRangeCount),
    needsReviewCount: Number(r.needsReviewCount),
  }));
}

export type ResultWithBiomarker = LabResult & { biomarker: Biomarker };

export async function getPanel(panelId: number) {
  const rows = await db.select().from(labPanel).where(eq(labPanel.id, panelId));
  return rows[0] ?? null;
}

export async function getPanelResults(panelId: number): Promise<ResultWithBiomarker[]> {
  // NB: don't `select({ result: labResult, bio: biomarker })` across a join —
  // both tables expose an `id` column, and the sqlite-proxy driver maps rows
  // positionally from a name-keyed object, so the duplicate name collapses and
  // shifts every later value (corrupting the JSON `aliases` mapping). Fetch each
  // table separately and stitch them in JS, where names can't collide.
  const results = await db.select().from(labResult).where(eq(labResult.panelId, panelId));
  if (!results.length) return [];

  const bioIds = [...new Set(results.map((r) => r.biomarkerId))];
  const bios = await db.select().from(biomarker).where(inArray(biomarker.id, bioIds));
  const byId = new Map(bios.map((b) => [b.id, b]));

  return results
    .flatMap((r) => {
      const bio = byId.get(r.biomarkerId);
      return bio ? [{ ...r, biomarker: bio }] : [];
    })
    .sort(
      (a, b) =>
        a.biomarker.category.localeCompare(b.biomarker.category) ||
        a.biomarker.canonicalName.localeCompare(b.biomarker.canonicalName),
    );
}

export type ResultConfidence = "exact" | "translated" | "fuzzy" | "ai" | "manual";

export type ResultInput = {
  biomarkerId: number;
  value: number;
  unit: string;
  rawLabel?: string | null;
  /** 1-based source-document page, carried for "open original → jump to page". */
  sourcePage?: number | null;
  /** Mapping provenance from the import pipeline; defaults by import method. */
  confidence?: ResultConfidence | null;
  /** Explicit review state. When omitted it is derived: AI imports with an
   *  uncertain (translated/fuzzy/ai) or unconvertible mapping start unreviewed. */
  reviewedAt?: string | null;
};

/** Creates a panel with results; computes normalization + flags per result. */
export async function createPanelWithResults(
  panelData: NewLabPanel,
  results: ResultInput[],
  biomarkersById: Map<number, Biomarker>,
): Promise<number> {
  const [panelRow] = await db.insert(labPanel).values(panelData).returning({ id: labPanel.id });
  if (results.length) {
    // Flags are computed against the profile's sex/age-specific range when one
    // exists — a single generic range mis-flags large populations.
    const prof = await getProfile(panelData.profileId);
    const ctx: ProfileContext = {
      sex: prof?.sex ?? null,
      ageYears: ageYearsFrom(prof?.birthDate, new Date(`${panelData.date.slice(0, 10)}T00:00:00Z`)),
    };
    const rangesByBiomarker = await getReferenceRangesByBiomarker();
    // Only AI imports carry uncertainty — manual entries are author-trusted and
    // never enter the "needs review" queue.
    const isAi = panelData.importMethod === "ai";
    const now = new Date().toISOString();
    const values: NewLabResult[] = results.map((r) => {
      const bio = biomarkersById.get(r.biomarkerId);
      let unitNormalized: string | null = null;
      let valueNormalized: number | null = null;
      let outOfRange = false;
      let flag: "low" | "high" | "critical" | null = null;
      let convertible = false;
      if (bio) {
        const conv = convertToDefaultUnit(r.value, r.unit, bio);
        if (conv.ok) {
          convertible = true;
          unitNormalized = conv.unit;
          valueNormalized = conv.value;
          const effective = resolveRange(bio, rangesByBiomarker.get(r.biomarkerId), ctx);
          ({ outOfRange, flag } = computeFlag(conv.value, effective, bio));
        }
      }
      const confidence: ResultConfidence = r.confidence ?? (isAi ? "ai" : "manual");
      const uncertain =
        confidence === "translated" || confidence === "fuzzy" || confidence === "ai";
      // A row needs review when its mapping is uncertain or its unit couldn't be
      // normalized (so no flag/trend) — but the caller may override explicitly.
      const needsReview = isAi && (uncertain || (bio != null && !convertible));
      const reviewedAt = r.reviewedAt !== undefined ? r.reviewedAt : needsReview ? null : now;
      return {
        panelId: panelRow.id,
        biomarkerId: r.biomarkerId,
        value: r.value,
        unit: r.unit,
        unitNormalized,
        valueNormalized,
        outOfRange,
        flag,
        rawLabel: r.rawLabel ?? null,
        sourcePage: r.sourcePage ?? null,
        confidence,
        reviewedAt,
      };
    });
    // The sqlite-proxy driver runs each statement on a pooled connection, so a
    // cross-statement BEGIN/COMMIT isn't reliable. Instead, compensate: if the
    // results insert fails, roll back the just-created panel so we never leave an
    // orphaned empty panel that looks like a successful (but data-less) import.
    try {
      await db.insert(labResult).values(values);
    } catch (e) {
      await db.delete(labPanel).where(eq(labPanel.id, panelRow.id));
      throw e;
    }
  }
  return panelRow.id;
}

// ── lab_finding ──────────────────────────────────────────────────────────────

/**
 * Insert a panel's additional findings. Same compensate-on-failure pattern as
 * createPanelWithResults: a failed findings insert must not leave a panel that
 * looks like a clean import.
 */
export async function createPanelFindings(
  panelId: number,
  findings: Omit<NewLabFinding, "panelId" | "createdAt">[],
): Promise<void> {
  if (!findings.length) return;
  try {
    await db.insert(labFinding).values(findings.map((f) => ({ ...f, panelId })));
  } catch (e) {
    await db.delete(labPanel).where(eq(labPanel.id, panelId));
    throw e;
  }
}

export async function getFindingsByPanel(panelId: number): Promise<LabFinding[]> {
  return db.select().from(labFinding).where(eq(labFinding.panelId, panelId));
}

/** Latest findings across a profile's panels (most recent panels first) — feeds
 *  the AI health context so the assistant sees non-dictionary results too. */
export async function getRecentFindings(
  profileId: number,
  limit = 15,
): Promise<{ rawLabel: string; nameEn: string | null; valueText: string; unit: string | null; date: string }[]> {
  return db
    .select({
      rawLabel: labFinding.rawLabel,
      nameEn: labFinding.nameEn,
      valueText: labFinding.valueText,
      unit: labFinding.unit,
      date: labPanel.date,
    })
    .from(labFinding)
    .innerJoin(labPanel, eq(labFinding.panelId, labPanel.id))
    .where(eq(labPanel.profileId, profileId))
    .orderBy(desc(labPanel.date), desc(labFinding.id))
    .limit(limit);
}

export type FindingWithPanel = LabFinding & { date: string; labName: string | null };

/** Every finding of a profile with its panel date/lab — the aggregated
 *  cross-panel findings view on the labs page. */
export async function getAllFindings(profileId: number): Promise<FindingWithPanel[]> {
  const rows = await db
    .select({ finding: labFinding, date: labPanel.date, labName: labPanel.labName })
    .from(labFinding)
    .innerJoin(labPanel, eq(labFinding.panelId, labPanel.id))
    .where(eq(labPanel.profileId, profileId))
    .orderBy(desc(labPanel.date), desc(labFinding.id));
  return rows.map((r) => ({ ...r.finding, date: r.date, labName: r.labName }));
}

export async function updateFinding(
  id: number,
  patch: Partial<Pick<LabFinding, "rawLabel" | "nameEn" | "valueText" | "unit" | "refRangeText">>,
): Promise<void> {
  await db.update(labFinding).set(patch).where(eq(labFinding.id, id));
}

export async function deleteFinding(id: number): Promise<void> {
  await db.delete(labFinding).where(eq(labFinding.id, id));
}

/**
 * Removes attachment rows polymorphically linked to a now-deleted entity, and
 * deletes their backing files from disk. The file paths are read before the
 * rows are dropped; file removal is best-effort (a leaked file is only wasted
 * disk space, whereas a dangling row would keep pointing at a stale document).
 */
async function deleteLinkedAttachments(entityType: string, entityId: number) {
  const rows = await db
    .select({ filePath: attachment.filePath })
    .from(attachment)
    .where(
      and(eq(attachment.linkedEntityType, entityType), eq(attachment.linkedEntityId, entityId)),
    );
  await db
    .delete(attachment)
    .where(
      and(eq(attachment.linkedEntityType, entityType), eq(attachment.linkedEntityId, entityId)),
    );
  for (const row of rows) {
    if (row.filePath) await deleteAttachmentFile(row.filePath);
  }
}

export async function deletePanel(panelId: number) {
  await db.delete(labResult).where(eq(labResult.panelId, panelId));
  await db.delete(labFinding).where(eq(labFinding.panelId, panelId));
  await db.delete(labPanel).where(eq(labPanel.id, panelId));
  // Panel (and its FK to source_file_id) is gone — clear the orphaned attachment.
  await deleteLinkedAttachments("lab_panel", panelId);
}

export type SeriesPoint = {
  date: string;
  value: number;
  unit: string;
  outOfRange: boolean;
  flag: string | null;
  /** False when unit conversion failed: value is in its raw unit, range not evaluated. */
  evaluated: boolean;
  panelId: number;
  labName: string | null;
};

/** Time series of normalized values for one biomarker (trend chart). */
export async function getBiomarkerSeries(
  profileId: number,
  biomarkerId: number,
): Promise<SeriesPoint[]> {
  const rows = await db
    .select({
      date: labPanel.date,
      value: sql<number>`coalesce(${labResult.valueNormalized}, ${labResult.value})`,
      unit: sql<string>`coalesce(${labResult.unitNormalized}, ${labResult.unit})`,
      outOfRange: labResult.outOfRange,
      flag: labResult.flag,
      evaluated: sql<number>`(${labResult.valueNormalized} is not null)`,
      panelId: labPanel.id,
      labName: labPanel.labName,
    })
    .from(labResult)
    .innerJoin(labPanel, eq(labResult.panelId, labPanel.id))
    .where(and(eq(labPanel.profileId, profileId), eq(labResult.biomarkerId, biomarkerId)))
    .orderBy(asc(labPanel.date), asc(labPanel.id));
  return rows.map((r) => ({
    ...r,
    outOfRange: Boolean(r.outOfRange),
    evaluated: Boolean(r.evaluated),
  }));
}

/** Latest normalized value per biomarker — biomarker list page / dashboard. */
export async function getLatestResults(profileId: number) {
  const rows = await db
    .select({
      biomarkerId: labResult.biomarkerId,
      date: labPanel.date,
      value: sql<number>`coalesce(${labResult.valueNormalized}, ${labResult.value})`,
      unit: sql<string>`coalesce(${labResult.unitNormalized}, ${labResult.unit})`,
      outOfRange: labResult.outOfRange,
      flag: labResult.flag,
      evaluated: sql<number>`(${labResult.valueNormalized} is not null)`,
    })
    .from(labResult)
    .innerJoin(labPanel, eq(labResult.panelId, labPanel.id))
    .where(eq(labPanel.profileId, profileId))
    .orderBy(asc(labPanel.date), asc(labPanel.id));
  const latest = new Map<number, (typeof rows)[number]>();
  for (const r of rows) latest.set(r.biomarkerId, r); // ordered asc, id tiebreak → last write wins
  return latest;
}

// ── cross-panel correlation (§ "what changed since last time") ──────────────

export type PanelChange = {
  result: ResultWithBiomarker;
  /** The same biomarker's reading just before this panel, if any. */
  previous: (ValuePoint & { panelId: number }) | null;
  /** Classified move from `previous` to this result; null when incomparable. */
  change: BiomarkerChange | null;
};

/**
 * For every result in a panel, finds the same biomarker's previous reading and
 * classifies the change — the data behind the panel's "notable changes" view.
 * "Previous" is the latest reading strictly before this panel in (date, id)
 * order, so re-importing an older panel still compares against the right point.
 */
export async function getPanelChanges(panelId: number): Promise<PanelChange[]> {
  const panel = await getPanel(panelId);
  if (!panel) return [];
  const results = await getPanelResults(panelId);
  if (!results.length) return [];

  const biomarkerIds = [...new Set(results.map((r) => r.biomarkerId))];
  const history = await db
    .select({
      biomarkerId: labResult.biomarkerId,
      panelId: labPanel.id,
      date: labPanel.date,
      value: labResult.value,
      unit: labResult.unit,
      valueNormalized: labResult.valueNormalized,
      unitNormalized: labResult.unitNormalized,
      outOfRange: labResult.outOfRange,
      flag: labResult.flag,
    })
    .from(labResult)
    .innerJoin(labPanel, eq(labResult.panelId, labPanel.id))
    .where(
      and(eq(labPanel.profileId, panel.profileId), inArray(labResult.biomarkerId, biomarkerIds)),
    )
    .orderBy(asc(labPanel.date), asc(labPanel.id));

  const byBiomarker = new Map<number, typeof history>();
  for (const h of history) {
    const list = byBiomarker.get(h.biomarkerId) ?? [];
    list.push(h);
    byBiomarker.set(h.biomarkerId, list);
  }

  return results.map((result) => {
    const series = byBiomarker.get(result.biomarkerId) ?? [];
    let prevRow: (typeof history)[number] | null = null;
    for (const h of series) {
      if (h.date < panel.date || (h.date === panel.date && h.panelId < panel.id)) prevRow = h;
    }
    if (!prevRow) return { result, previous: null, change: null };
    const previous = { ...pointFromResult(prevRow), panelId: prevRow.panelId };
    const current = pointFromResult({ ...result, date: panel.date });
    return { result, previous, change: changeBetween(previous, current, result.biomarker) };
  });
}

/** The most recent panel with its per-result changes — dashboard summary. */
export async function getLatestPanelChanges(
  profileId: number,
): Promise<{ panel: LabPanel; changes: PanelChange[] } | null> {
  const rows = await db
    .select()
    .from(labPanel)
    .where(eq(labPanel.profileId, profileId))
    .orderBy(desc(labPanel.date), desc(labPanel.id))
    .limit(1);
  if (!rows.length) return null;
  return { panel: rows[0], changes: await getPanelChanges(rows[0].id) };
}

export type PanelShift = { severity: ChangeSeverity; count: number };

const SHIFT_RANK: Record<ChangeSeverity, number> = { info: 0, watch: 1, alert: 2 };

/**
 * For every panel, the strongest notable shift it introduced versus the prior
 * reading of each biomarker — used to highlight "something moved here" dots on
 * the timeline. One pass over the whole history: results are streamed in
 * (biomarker, date) order and each transition is attributed to the later panel.
 */
export async function getPanelShiftSeverities(profileId: number): Promise<Map<number, PanelShift>> {
  const rows = await db
    .select({
      panelId: labPanel.id,
      date: labPanel.date,
      biomarkerId: labResult.biomarkerId,
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
      direction: biomarker.direction,
    })
    .from(labResult)
    .innerJoin(labPanel, eq(labResult.panelId, labPanel.id))
    .innerJoin(biomarker, eq(labResult.biomarkerId, biomarker.id))
    .where(eq(labPanel.profileId, profileId))
    .orderBy(asc(labResult.biomarkerId), asc(labPanel.date), asc(labPanel.id));

  const byPanel = new Map<number, PanelShift>();
  let prev: (typeof rows)[number] | null = null;
  for (const row of rows) {
    if (prev && prev.biomarkerId === row.biomarkerId && prev.panelId !== row.panelId) {
      const change = changeBetween(pointFromResult(prev), pointFromResult(row), row);
      if (change?.notable) {
        const existing = byPanel.get(row.panelId);
        const severity =
          existing && SHIFT_RANK[existing.severity] >= SHIFT_RANK[change.severity]
            ? existing.severity
            : change.severity;
        byPanel.set(row.panelId, { severity, count: (existing?.count ?? 0) + 1 });
      }
    }
    prev = row;
  }
  return byPanel;
}

// ── medications ────────────────────────────────────────────────────────────

export async function listMedications(profileId: number): Promise<Medication[]> {
  return db
    .select()
    .from(medication)
    .where(eq(medication.profileId, profileId))
    .orderBy(desc(isNull(medication.endDate)), desc(medication.startDate));
}

export async function getMedication(id: number): Promise<Medication | null> {
  const rows = await db.select().from(medication).where(eq(medication.id, id));
  return rows[0] ?? null;
}

export async function createMedication(data: NewMedication): Promise<number> {
  const [row] = await db.insert(medication).values(data).returning({ id: medication.id });
  return row.id;
}

export async function updateMedication(id: number, data: Partial<NewMedication>) {
  await db.update(medication).set(data).where(eq(medication.id, id));
}

export async function deleteMedication(id: number) {
  await db.delete(medication).where(eq(medication.id, id));
}

// ── medication adherence log ───────────────────────────────────────────────

export async function listMedicationLog(medicationId: number): Promise<MedicationLog[]> {
  return db
    .select()
    .from(medicationLog)
    .where(eq(medicationLog.medicationId, medicationId))
    .orderBy(desc(medicationLog.takenAt));
}

/**
 * Records one intake for today (taken or skipped). At most one entry per calendar
 * day: a same-day log already present is left untouched, so double-tapping
 * "Mark taken" can't inflate adherence. Returns true when a row was inserted.
 */
export async function logMedicationIntake(medicationId: number, taken = true): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10);
  const existing = await db
    .select({ id: medicationLog.id })
    .from(medicationLog)
    .where(
      and(eq(medicationLog.medicationId, medicationId), like(medicationLog.takenAt, `${day}%`)),
    );
  if (existing.length) return false;
  await db.insert(medicationLog).values({ medicationId, takenAt: new Date().toISOString(), taken });
  return true;
}

export async function deleteMedicationLogEntry(id: number): Promise<void> {
  await db.delete(medicationLog).where(eq(medicationLog.id, id));
}

// ── visits / diagnoses / prescriptions ─────────────────────────────────────

export async function listVisits(profileId: number): Promise<Visit[]> {
  return db.select().from(visit).where(eq(visit.profileId, profileId)).orderBy(desc(visit.date));
}

export async function getVisit(id: number): Promise<Visit | null> {
  const rows = await db.select().from(visit).where(eq(visit.id, id));
  return rows[0] ?? null;
}

export async function createVisit(data: NewVisit): Promise<number> {
  const [row] = await db.insert(visit).values(data).returning({ id: visit.id });
  return row.id;
}

export async function updateVisit(id: number, data: Partial<NewVisit>) {
  await db.update(visit).set(data).where(eq(visit.id, id));
}

export async function deleteVisit(id: number) {
  // Prescriptions survive visit deletion (medication rows reference them).
  await db.update(prescription).set({ visitId: null }).where(eq(prescription.visitId, id));
  await db.update(diagnosis).set({ visitId: null }).where(eq(diagnosis.visitId, id));
  await db.update(symptomLog).set({ visitId: null }).where(eq(symptomLog.visitId, id));
  await db.update(imagingRecord).set({ visitId: null }).where(eq(imagingRecord.visitId, id));
  await db.delete(visit).where(eq(visit.id, id));
  await deleteLinkedAttachments("visit", id);
}

export async function listDiagnoses(profileId: number): Promise<Diagnosis[]> {
  return db
    .select()
    .from(diagnosis)
    .where(eq(diagnosis.profileId, profileId))
    .orderBy(desc(diagnosis.date));
}

export async function getDiagnosis(id: number): Promise<Diagnosis | null> {
  const rows = await db.select().from(diagnosis).where(eq(diagnosis.id, id));
  return rows[0] ?? null;
}

export async function createDiagnosis(data: NewDiagnosis): Promise<number> {
  const [row] = await db.insert(diagnosis).values(data).returning({ id: diagnosis.id });
  return row.id;
}

export async function updateDiagnosis(id: number, data: Partial<NewDiagnosis>) {
  await db.update(diagnosis).set(data).where(eq(diagnosis.id, id));
}

export async function deleteDiagnosis(id: number) {
  await db.delete(diagnosis).where(eq(diagnosis.id, id));
}

export async function listPrescriptionsForVisit(visitId: number) {
  return db.select().from(prescription).where(eq(prescription.visitId, visitId));
}

export async function createPrescription(data: NewPrescription): Promise<number> {
  const [row] = await db.insert(prescription).values(data).returning({ id: prescription.id });
  return row.id;
}

export async function listDiagnosesForVisit(visitId: number) {
  return db.select().from(diagnosis).where(eq(diagnosis.visitId, visitId));
}

/**
 * Medications whose prescription belongs to this visit — the visit → prescription
 * → medication edge surfaced as a single read. Empty when the visit produced no
 * prescriptions or none were promoted to a tracked medication.
 */
export async function listMedicationsForVisit(visitId: number): Promise<Medication[]> {
  const rxIds = await db
    .select({ id: prescription.id })
    .from(prescription)
    .where(eq(prescription.visitId, visitId));
  if (!rxIds.length) return [];
  return db
    .select()
    .from(medication)
    .where(
      inArray(
        medication.prescriptionId,
        rxIds.map((r) => r.id),
      ),
    );
}

export type DiagnosisRelations = {
  /** The visit that produced the diagnosis, if it is linked to one. */
  visit: Visit | null;
  /** Medications treating it: prescribed at that visit, or whose purpose names it. */
  medications: Medication[];
};

/**
 * Resolves the graph around a diagnosis: the visit it came from and the
 * medications treating it. There is no direct medication↔diagnosis foreign key,
 * so the link is inferred two ways — medications prescribed at the diagnosis's
 * visit, and medications whose free-text `purpose` mentions the diagnosis name.
 */
export async function getDiagnosisRelations(d: Diagnosis): Promise<DiagnosisRelations> {
  const [visit, viaVisit, byPurpose] = await Promise.all([
    d.visitId ? getVisit(d.visitId) : Promise.resolve(null),
    d.visitId ? listMedicationsForVisit(d.visitId) : Promise.resolve<Medication[]>([]),
    db
      .select()
      .from(medication)
      .where(
        and(
          eq(medication.profileId, d.profileId),
          sql`${medication.purpose} is not null and instr(lower(${medication.purpose}), lower(${d.name})) > 0`,
        ),
      ),
  ]);
  const byId = new Map<number, Medication>();
  for (const m of [...viaVisit, ...byPurpose]) byId.set(m.id, m);
  return { visit, medications: [...byId.values()] };
}

export type MedicationRelations = {
  /** The visit that prescribed it (via prescription → visit), if any. */
  visit: Visit | null;
  /** Diagnoses it likely treats: diagnoses of its visit, plus name-in-purpose matches. */
  diagnoses: Diagnosis[];
};

/**
 * Resolves the graph around a medication: the prescribing visit and the
 * diagnoses it treats. The visit is reached through its prescription; diagnoses
 * are inferred from that visit's diagnoses and from any diagnosis whose name
 * appears in the medication's `purpose` text.
 */
export async function getMedicationRelations(m: Medication): Promise<MedicationRelations> {
  let visit: Visit | null = null;
  if (m.prescriptionId != null) {
    const rx = await db
      .select({ visitId: prescription.visitId })
      .from(prescription)
      .where(eq(prescription.id, m.prescriptionId))
      .limit(1);
    const visitId = rx[0]?.visitId ?? null;
    if (visitId != null) visit = await getVisit(visitId);
  }
  const [viaVisit, byPurpose] = await Promise.all([
    visit ? listDiagnosesForVisit(visit.id) : Promise.resolve<Diagnosis[]>([]),
    m.purpose
      ? db
          .select()
          .from(diagnosis)
          .where(
            and(
              eq(diagnosis.profileId, m.profileId),
              sql`instr(lower(${m.purpose}), lower(${diagnosis.name})) > 0`,
            ),
          )
      : Promise.resolve<Diagnosis[]>([]),
  ]);
  const byId = new Map<number, Diagnosis>();
  for (const d of [...viaVisit, ...byPurpose]) byId.set(d.id, d);
  return { visit, diagnoses: [...byId.values()] };
}

// ── allergies ──────────────────────────────────────────────────────────────

export async function listAllergies(profileId: number): Promise<Allergy[]> {
  return db
    .select()
    .from(allergy)
    .where(eq(allergy.profileId, profileId))
    .orderBy(asc(allergy.status), asc(allergy.allergen));
}

export async function createAllergy(data: NewAllergy): Promise<number> {
  const [row] = await db.insert(allergy).values(data).returning({ id: allergy.id });
  return row.id;
}

export async function updateAllergy(id: number, data: Partial<NewAllergy>) {
  await db.update(allergy).set(data).where(eq(allergy.id, id));
}

/**
 * Deleting anaphylactic allergies is blocked at the repo layer (not just UI):
 * critical safety data must be resolved, never silently removed.
 */
export async function deleteAllergy(id: number) {
  const rows = await db
    .select({ severity: allergy.severity })
    .from(allergy)
    .where(eq(allergy.id, id));
  assertAllergyDeletable(rows[0]?.severity);
  await db.delete(allergy).where(eq(allergy.id, id));
}

// ── vaccines ───────────────────────────────────────────────────────────────
// Append-only: no delete function on purpose; edits allowed for typo fixes.

export async function listVaccines(profileId: number): Promise<Vaccine[]> {
  return db
    .select()
    .from(vaccine)
    .where(eq(vaccine.profileId, profileId))
    .orderBy(asc(vaccine.vaccineName), asc(vaccine.date));
}

export async function createVaccine(data: NewVaccine): Promise<number> {
  const [row] = await db.insert(vaccine).values(data).returning({ id: vaccine.id });
  return row.id;
}

export async function updateVaccine(id: number, data: Partial<NewVaccine>) {
  await db.update(vaccine).set(data).where(eq(vaccine.id, id));
}

// ── symptom log ────────────────────────────────────────────────────────────

export async function listSymptomLog(profileId: number): Promise<SymptomLog[]> {
  return db
    .select()
    .from(symptomLog)
    .where(eq(symptomLog.profileId, profileId))
    .orderBy(desc(symptomLog.date), desc(symptomLog.time));
}

export type SymptomPoint = {
  date: string;
  time: string | null;
  severity: number;
  notes: string | null;
};

/** Time series of one symptom (chart overlay), case-insensitive name match. */
export async function getSymptomSeries(
  profileId: number,
  symptomName: string,
): Promise<SymptomPoint[]> {
  const rows = await db
    .select({
      date: symptomLog.date,
      time: symptomLog.time,
      severity: symptomLog.severity,
      notes: symptomLog.notes,
    })
    .from(symptomLog)
    .where(
      and(
        eq(symptomLog.profileId, profileId),
        sql`lower(${symptomLog.symptomName}) = lower(${symptomName})`,
      ),
    )
    .orderBy(asc(symptomLog.date));
  return rows;
}

/** Distinct previously-used names for the autocomplete (preserves first-seen spelling). */
export async function listSymptomNames(profileId: number): Promise<string[]> {
  const rows = await db
    .select({ name: symptomLog.symptomName })
    .from(symptomLog)
    .where(eq(symptomLog.profileId, profileId))
    .orderBy(asc(symptomLog.symptomName));
  const seen = new Map<string, string>();
  for (const r of rows) {
    const key = r.name.toLowerCase();
    if (!seen.has(key)) seen.set(key, r.name);
  }
  return [...seen.values()];
}

export async function createSymptomEntry(data: NewSymptomLog): Promise<number> {
  const [row] = await db.insert(symptomLog).values(data).returning({ id: symptomLog.id });
  return row.id;
}

export async function updateSymptomEntry(id: number, data: Partial<NewSymptomLog>) {
  await db.update(symptomLog).set(data).where(eq(symptomLog.id, id));
}

export async function deleteSymptomEntry(id: number) {
  await db.delete(symptomLog).where(eq(symptomLog.id, id));
}

// ── imaging records ────────────────────────────────────────────────────────

export async function listImagingRecords(profileId: number): Promise<ImagingRecord[]> {
  return db
    .select()
    .from(imagingRecord)
    .where(eq(imagingRecord.profileId, profileId))
    .orderBy(desc(imagingRecord.date));
}

export async function getImagingRecord(id: number): Promise<ImagingRecord | null> {
  const rows = await db.select().from(imagingRecord).where(eq(imagingRecord.id, id));
  return rows[0] ?? null;
}

export async function createImagingRecord(data: NewImagingRecord): Promise<number> {
  const [row] = await db.insert(imagingRecord).values(data).returning({ id: imagingRecord.id });
  return row.id;
}

export async function updateImagingRecord(id: number, data: Partial<NewImagingRecord>) {
  await db.update(imagingRecord).set(data).where(eq(imagingRecord.id, id));
}

export async function deleteImagingRecord(id: number) {
  await db.delete(imagingRecord).where(eq(imagingRecord.id, id));
}

// ── weight / blood-pressure logs ───────────────────────────────────────────

export async function listWeightLog(profileId: number): Promise<WeightLog[]> {
  return db
    .select()
    .from(weightLog)
    .where(eq(weightLog.profileId, profileId))
    .orderBy(desc(weightLog.date));
}

export async function createWeightEntry(data: NewWeightLog): Promise<number> {
  const [row] = await db.insert(weightLog).values(data).returning({ id: weightLog.id });
  return row.id;
}

export async function updateWeightEntry(id: number, data: Partial<NewWeightLog>) {
  await db.update(weightLog).set(data).where(eq(weightLog.id, id));
}

export async function deleteWeightEntry(id: number) {
  await db.delete(weightLog).where(eq(weightLog.id, id));
}

export async function listBpLog(profileId: number): Promise<BpLog[]> {
  return db
    .select()
    .from(bpLog)
    .where(eq(bpLog.profileId, profileId))
    .orderBy(desc(bpLog.date), desc(bpLog.time));
}

export async function createBpEntry(data: NewBpLog): Promise<number> {
  const [row] = await db.insert(bpLog).values(data).returning({ id: bpLog.id });
  return row.id;
}

export async function updateBpEntry(id: number, data: Partial<NewBpLog>) {
  await db.update(bpLog).set(data).where(eq(bpLog.id, id));
}

export async function deleteBpEntry(id: number) {
  await db.delete(bpLog).where(eq(bpLog.id, id));
}

// ── lifestyle log (daily sleep / training / stress context) ─────────────────

/** All lifestyle entries for a profile, newest day first. */
export async function listLifestyleLog(profileId: number): Promise<LifestyleLog[]> {
  return db
    .select()
    .from(lifestyleLog)
    .where(eq(lifestyleLog.profileId, profileId))
    .orderBy(desc(lifestyleLog.date));
}

/** The single lifestyle entry for one calendar day, if present. */
export async function getLifestyleByDate(
  profileId: number,
  date: string,
): Promise<LifestyleLog | null> {
  const rows = await db
    .select()
    .from(lifestyleLog)
    .where(and(eq(lifestyleLog.profileId, profileId), eq(lifestyleLog.date, date)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Upserts the lifestyle entry for a (profile, date): there is at most one row
 * per day (enforced by a unique index), so a same-day save updates in place
 * rather than stacking duplicate rows. Returns the row id.
 */
export async function upsertLifestyleLog(data: NewLifestyleLog): Promise<number> {
  const existing = await getLifestyleByDate(data.profileId, data.date);
  if (existing) {
    const { id: _id, profileId: _p, date: _d, createdAt: _c, ...patch } = data;
    await db.update(lifestyleLog).set(patch).where(eq(lifestyleLog.id, existing.id));
    return existing.id;
  }
  const [row] = await db.insert(lifestyleLog).values(data).returning({ id: lifestyleLog.id });
  return row.id;
}

export async function deleteLifestyleLog(id: number): Promise<void> {
  await db.delete(lifestyleLog).where(eq(lifestyleLog.id, id));
}

export async function listHealthNotes(profileId: number): Promise<HealthNote[]> {
  return db
    .select()
    .from(healthNote)
    .where(eq(healthNote.profileId, profileId))
    .orderBy(desc(healthNote.date), desc(healthNote.id));
}

export async function getHealthNote(id: number): Promise<HealthNote | null> {
  const rows = await db.select().from(healthNote).where(eq(healthNote.id, id));
  return rows[0] ?? null;
}

export async function createHealthNote(data: NewHealthNote): Promise<number> {
  const [row] = await db.insert(healthNote).values(data).returning({ id: healthNote.id });
  return row.id;
}

/** Recent lifestyle entries (oldest-first) within the last `days` — AI context + trends. */
export async function getRecentLifestyle(profileId: number, days = 30): Promise<LifestyleLog[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const rows = await db
    .select()
    .from(lifestyleLog)
    .where(and(eq(lifestyleLog.profileId, profileId), sql`${lifestyleLog.date} >= ${since}`))
    .orderBy(asc(lifestyleLog.date));
  return rows;
}

// ── retest schedules (scheduled re-testing → notifications feed) ─────────────

export async function listRetestSchedules(profileId: number): Promise<RetestSchedule[]> {
  return db
    .select()
    .from(retestSchedule)
    .where(eq(retestSchedule.profileId, profileId))
    .orderBy(asc(retestSchedule.label));
}

export async function createRetestSchedule(data: NewRetestSchedule): Promise<number> {
  const [row] = await db.insert(retestSchedule).values(data).returning({ id: retestSchedule.id });
  return row.id;
}

export async function updateRetestSchedule(id: number, data: Partial<NewRetestSchedule>) {
  await db.update(retestSchedule).set(data).where(eq(retestSchedule.id, id));
}

export async function deleteRetestSchedule(id: number) {
  await db.delete(retestSchedule).where(eq(retestSchedule.id, id));
}

// ── notification feed (derived, read-only) ──────────────────────────────────
// The feed is computed, never stored: medication-intake nudges + due/overdue
// re-tests. It is purely informational — no OS notifications are ever raised.
// `buildNotificationFeed` (src/lib/notifications.ts) folds this into feed items.

export type NotificationFeedData = {
  today: string;
  /** Standing (non-PRN) medications that are active today. */
  medications: Medication[];
  /** Ids of medications already logged (taken or skipped) today. */
  loggedTodayMedIds: number[];
  /** Active re-test schedules. */
  retestSchedules: RetestSchedule[];
};

export async function getNotificationFeedData(profileId: number): Promise<NotificationFeedData> {
  const today = new Date().toISOString().slice(0, 10);
  const [meds, schedules, todayLogs] = await Promise.all([
    listMedications(profileId),
    db
      .select()
      .from(retestSchedule)
      .where(and(eq(retestSchedule.profileId, profileId), eq(retestSchedule.active, true)))
      .orderBy(asc(retestSchedule.label)),
    db
      .select({ medicationId: medicationLog.medicationId })
      .from(medicationLog)
      .innerJoin(medication, eq(medicationLog.medicationId, medication.id))
      .where(and(eq(medication.profileId, profileId), like(medicationLog.takenAt, `${today}%`))),
  ]);
  const standing = meds.filter(
    (m) => !m.asNeeded && (m.endDate == null || m.endDate >= today) && m.startDate <= today,
  );
  return {
    today,
    medications: standing,
    loggedTodayMedIds: [...new Set(todayLogs.map((r) => r.medicationId))],
    retestSchedules: schedules,
  };
}

// ── emergency card (computed aggregate, read-only) ─────────────────────────

export type EmergencyCardData = {
  profile: Profile;
  activeAllergies: Allergy[];
  resolvedAllergies: Allergy[];
  /** Standing (daily/scheduled) medications currently taken. */
  activeMedications: Medication[];
  /** Currently-held PRN ("as needed") medications, listed separately. */
  asNeededMedications: Medication[];
  activeDiagnoses: Diagnosis[];
  recentVaccines: Vaccine[];
};

const SEVERITY_ORDER = { anaphylactic: 0, severe: 1, moderate: 2, mild: 3 } as const;

export async function getEmergencyCard(profileId: number): Promise<EmergencyCardData | null> {
  const p = await getProfile(profileId);
  if (!p) return null;
  const [allergies, meds, diagnoses, vaccines] = await Promise.all([
    listAllergies(profileId),
    listMedications(profileId),
    listDiagnoses(profileId),
    listVaccines(profileId),
  ]);
  const bySeverity = (a: Allergy, b: Allergy) =>
    SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
  return {
    profile: p,
    activeAllergies: allergies.filter((a) => a.status === "active").sort(bySeverity),
    resolvedAllergies: allergies.filter((a) => a.status === "resolved").sort(bySeverity),
    activeMedications: meds.filter((m) => m.endDate == null && !m.asNeeded),
    asNeededMedications: meds.filter((m) => m.endDate == null && m.asNeeded),
    activeDiagnoses: diagnoses.filter((d) => d.status === "active"),
    recentVaccines: [...vaccines].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
  };
}

// ── doctor report (computed aggregate, read-only) ──────────────────────────
// A printable clinical summary for a doctor's visit: current problems, meds,
// allergies, and the lab/visit/imaging history within a chosen window. Composed
// from the existing repos so the PDF generator (src/lib/doctor-report-pdf.ts)
// stays a pure renderer over this shape.

export type DoctorReportOptions = {
  /** Inclusive ISO `YYYY-MM-DD` lower bound for time-bounded sections; null = all. */
  fromDate?: string | null;
  /** Inclusive ISO `YYYY-MM-DD` upper bound; null = up to today. */
  toDate?: string | null;
  /** Cap on lab panels rendered in full (newest first); the rest are omitted. */
  maxPanels?: number;
  /** Section toggles — let the user tailor what the doctor sees. */
  sections?: Partial<Record<DoctorReportSection, boolean>>;
};

export type DoctorReportSection =
  | "diagnoses"
  | "medications"
  | "allergies"
  | "labs"
  | "visits"
  | "imaging"
  | "vaccines"
  | "lifestyle";

export type DoctorReportPanel = { panel: LabPanel; results: ResultWithBiomarker[] };

export type DoctorReportAbnormal = {
  biomarker: Biomarker;
  value: number;
  unit: string;
  flag: string | null;
  date: string;
};

export type DoctorReportData = {
  profile: Profile;
  generatedAt: string;
  range: { from: string | null; to: string | null };
  sections: Record<DoctorReportSection, boolean>;
  activeDiagnoses: Diagnosis[];
  inactiveDiagnoses: Diagnosis[];
  activeMedications: Medication[];
  asNeededMedications: Medication[];
  pastMedications: Medication[];
  activeAllergies: Allergy[];
  resolvedAllergies: Allergy[];
  /** Latest out-of-range markers across all history — the "abnormal now" snapshot. */
  abnormalLatest: DoctorReportAbnormal[];
  /** Lab panels within range, newest first, full results, capped at `maxPanels`. */
  panels: DoctorReportPanel[];
  visits: Visit[];
  imaging: ImagingRecord[];
  vaccines: Vaccine[];
  /** Recent lifestyle entries within range (oldest-first) for the context summary. */
  lifestyle: LifestyleLog[];
};

const ALL_REPORT_SECTIONS: DoctorReportSection[] = [
  "diagnoses",
  "medications",
  "allergies",
  "labs",
  "visits",
  "imaging",
  "vaccines",
  "lifestyle",
];

/** True when `date` (YYYY-MM-DD) falls within the optional [from, to] bounds. */
function withinRange(date: string, from: string | null, to: string | null): boolean {
  const d = date.slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

export async function getDoctorReportData(
  profileId: number,
  opts: DoctorReportOptions = {},
): Promise<DoctorReportData | null> {
  const p = await getProfile(profileId);
  if (!p) return null;

  const from = opts.fromDate ?? null;
  const to = opts.toDate ?? null;
  const maxPanels = opts.maxPanels ?? 8;
  const sections = Object.fromEntries(
    ALL_REPORT_SECTIONS.map((s) => [s, opts.sections?.[s] ?? true]),
  ) as Record<DoctorReportSection, boolean>;

  const [allergies, meds, diagnoses, vaccines, visits, imaging, panels, latest, biomarkers, life] =
    await Promise.all([
      listAllergies(profileId),
      listMedications(profileId),
      listDiagnoses(profileId),
      listVaccines(profileId),
      listVisits(profileId),
      listImagingRecords(profileId),
      listPanels(profileId),
      getLatestResults(profileId),
      listBiomarkers(),
      listLifestyleLog(profileId),
    ]);

  const bySeverity = (a: Allergy, b: Allergy) =>
    SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];

  // Latest out-of-range snapshot (independent of the date window — "abnormal now").
  const bioById = new Map(biomarkers.map((b) => [b.id, b]));
  const abnormalLatest: DoctorReportAbnormal[] = [];
  for (const [biomarkerId, r] of latest) {
    if (!r.outOfRange) continue;
    const bio = bioById.get(biomarkerId);
    if (!bio) continue;
    abnormalLatest.push({
      biomarker: bio,
      value: r.value,
      unit: r.unit,
      flag: r.flag,
      date: r.date,
    });
  }
  abnormalLatest.sort((a, b) => a.biomarker.canonicalName.localeCompare(b.biomarker.canonicalName));

  // Lab panels in range, newest first, with full results (capped).
  const panelsInRange = panels.filter((pn) => withinRange(pn.date, from, to)).slice(0, maxPanels);
  const reportPanels: DoctorReportPanel[] = await Promise.all(
    panelsInRange.map(async (pn) => ({ panel: pn, results: await getPanelResults(pn.id) })),
  );

  return {
    profile: p,
    generatedAt: new Date().toISOString(),
    range: { from, to },
    sections,
    activeDiagnoses: diagnoses.filter((d) => d.status === "active"),
    inactiveDiagnoses: diagnoses.filter((d) => d.status !== "active"),
    activeMedications: meds.filter((m) => m.endDate == null && !m.asNeeded),
    asNeededMedications: meds.filter((m) => m.endDate == null && m.asNeeded),
    pastMedications: meds.filter((m) => m.endDate != null),
    activeAllergies: allergies.filter((a) => a.status === "active").sort(bySeverity),
    resolvedAllergies: allergies.filter((a) => a.status === "resolved").sort(bySeverity),
    abnormalLatest,
    panels: reportPanels,
    visits: visits.filter((v) => withinRange(v.date, from, to)),
    imaging: imaging.filter((i) => withinRange(i.date, from, to)),
    vaccines: [...vaccines].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12),
    lifestyle: [...life]
      .filter((l) => withinRange(l.date, from, to))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

// ── attachments ────────────────────────────────────────────────────────────

export async function createAttachment(data: NewAttachment): Promise<number> {
  const [row] = await db.insert(attachment).values(data).returning({ id: attachment.id });
  return row.id;
}

export async function updateAttachment(id: number, data: Partial<NewAttachment>) {
  await db.update(attachment).set(data).where(eq(attachment.id, id));
}

export async function getAttachment(id: number): Promise<Attachment | null> {
  const rows = await db.select().from(attachment).where(eq(attachment.id, id));
  return rows[0] ?? null;
}

/** The source document a lab panel was imported from, or null if entered by hand. */
export async function getPanelSource(panelId: number): Promise<Attachment | null> {
  const panel = await getPanel(panelId);
  if (!panel?.sourceFileId) return null;
  return getAttachment(panel.sourceFileId);
}

/** Attachment linked to a polymorphic entity (visit, vaccine, …), if any. */
export async function getLinkedAttachment(
  entityType: string,
  entityId: number,
): Promise<Attachment | null> {
  const rows = await db
    .select()
    .from(attachment)
    .where(
      and(eq(attachment.linkedEntityType, entityType), eq(attachment.linkedEntityId, entityId)),
    )
    .limit(1);
  return rows[0] ?? null;
}

// ── needs-review queue ─────────────────────────────────────────────────────

/** Number of panels with at least one result still awaiting verification. */
export async function countPanelsNeedingReview(profileId: number): Promise<number> {
  const rows = await db
    .select({ panelId: labResult.panelId })
    .from(labResult)
    .innerJoin(labPanel, eq(labResult.panelId, labPanel.id))
    .where(and(eq(labPanel.profileId, profileId), isNull(labResult.reviewedAt)))
    .groupBy(labResult.panelId);
  return rows.length;
}

/** Marks one result as verified by the user (clears it from the review queue). */
export async function markResultReviewed(resultId: number): Promise<void> {
  await db
    .update(labResult)
    .set({ reviewedAt: new Date().toISOString() })
    .where(eq(labResult.id, resultId));
}

/** Clears every outstanding review flag on a panel in one pass. */
export async function markPanelReviewed(panelId: number): Promise<void> {
  await db
    .update(labResult)
    .set({ reviewedAt: new Date().toISOString() })
    .where(and(eq(labResult.panelId, panelId), isNull(labResult.reviewedAt)));
}

// ── unified timeline (§3: query union, no dedicated table) ────────────────

export type TimelineEvent =
  | {
      kind: "lab_panel";
      id: number;
      date: string;
      title: string;
      subtitle: string | null;
      outOfRangeCount: number;
      resultCount: number;
    }
  | { kind: "visit"; id: number; date: string; title: string; subtitle: string | null }
  | {
      kind: "diagnosis";
      id: number;
      date: string;
      title: string;
      subtitle: string | null;
      status: string;
    }
  | {
      kind: "medication";
      id: number;
      date: string;
      endDate: string | null;
      title: string;
      subtitle: string | null;
      type: "drug" | "supplement";
    }
  | {
      kind: "allergy";
      id: number;
      date: string;
      title: string;
      subtitle: string | null;
      severity: "mild" | "moderate" | "severe" | "anaphylactic";
    }
  | { kind: "vaccine"; id: number; date: string; title: string; subtitle: string | null }
  | {
      kind: "symptom";
      id: number;
      date: string;
      title: string;
      subtitle: string | null;
      severity: number;
    }
  | { kind: "imaging"; id: number; date: string; title: string; subtitle: string | null };

export async function getTimeline(profileId: number): Promise<TimelineEvent[]> {
  const [panels, visits, diagnoses, meds, allergies, vaccines, symptoms, imaging] =
    await Promise.all([
      listPanels(profileId),
      listVisits(profileId),
      listDiagnoses(profileId),
      listMedications(profileId),
      listAllergies(profileId),
      listVaccines(profileId),
      listSymptomLog(profileId),
      listImagingRecords(profileId),
    ]);

  const events: TimelineEvent[] = [
    ...panels.map((p): TimelineEvent => ({
      kind: "lab_panel",
      id: p.id,
      date: p.date,
      title: p.labName ? `Labs — ${p.labName}` : "Lab panel",
      subtitle: [p.city, p.country].filter(Boolean).join(", ") || null,
      outOfRangeCount: p.outOfRangeCount,
      resultCount: p.resultCount,
    })),
    ...visits.map((v): TimelineEvent => ({
      kind: "visit",
      id: v.id,
      date: v.date,
      title: v.doctorName
        ? `Visit — ${v.doctorName}`
        : `Visit${v.specialty ? ` — ${v.specialty}` : ""}`,
      subtitle: [v.clinic, v.city].filter(Boolean).join(", ") || v.specialty,
    })),
    ...diagnoses.map((d): TimelineEvent => ({
      kind: "diagnosis",
      id: d.id,
      date: d.date,
      title: d.name,
      subtitle: d.icdCode,
      status: d.status,
    })),
    ...meds.map((m): TimelineEvent => ({
      kind: "medication",
      id: m.id,
      date: m.startDate,
      endDate: m.endDate,
      title: m.name,
      subtitle: m.doseAmount ? `${m.doseAmount} ${m.doseUnit ?? ""}`.trim() : null,
      type: m.type,
    })),
    // Allergies anchor on onset date; entries without one have no place on a timeline.
    ...allergies
      .filter((a) => a.onsetDate != null)
      .map((a): TimelineEvent => ({
        kind: "allergy",
        id: a.id,
        date: a.onsetDate!,
        title: a.allergen,
        subtitle: a.reaction,
        severity: a.severity,
      })),
    ...vaccines.map((v): TimelineEvent => ({
      kind: "vaccine",
      id: v.id,
      date: v.date,
      title: v.vaccineName,
      subtitle: v.dose != null ? `Dose ${v.dose}` : null,
    })),
    // Severity filtering (≥ 6 by default) happens in the UI, not here.
    ...symptoms.map((s): TimelineEvent => ({
      kind: "symptom",
      id: s.id,
      date: s.date,
      title: s.symptomName,
      subtitle: s.notes,
      severity: s.severity,
    })),
    ...imaging.map((i): TimelineEvent => ({
      kind: "imaging",
      id: i.id,
      date: i.date,
      title: `${i.modalityType.toUpperCase()} — ${i.bodyArea}`,
      subtitle: i.clinic,
    })),
  ];

  return events.sort((a, b) => b.date.localeCompare(a.date));
}
