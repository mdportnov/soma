import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "./client";
import {
  allergy,
  attachment,
  biomarker,
  biomarkerReferenceRange,
  bpLog,
  diagnosis,
  imagingRecord,
  labPanel,
  labResult,
  medication,
  prescription,
  profile,
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
  type LabPanel,
  type LabResult,
  type Medication,
  type NewAllergy,
  type NewAttachment,
  type NewBiomarker,
  type NewBpLog,
  type NewDiagnosis,
  type NewImagingRecord,
  type NewLabPanel,
  type NewLabResult,
  type NewMedication,
  type NewPrescription,
  type NewProfile,
  type NewSymptomLog,
  type NewVaccine,
  type NewVisit,
  type NewWeightLog,
  type Profile,
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
  const all = await db.select().from(profile).limit(1);
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
  await db.update(profile).set(data).where(eq(profile.id, id));
  // Sex/age drive demographic reference ranges → recompute stored flags so an
  // existing panel reflects the corrected range, not the one used at import.
  if ("sex" in data || "birthDate" in data) {
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

/** Removes attachment rows polymorphically linked to a now-deleted entity. */
async function deleteLinkedAttachments(entityType: string, entityId: number) {
  await db
    .delete(attachment)
    .where(
      and(eq(attachment.linkedEntityType, entityType), eq(attachment.linkedEntityId, entityId)),
    );
}

export async function deletePanel(panelId: number) {
  await db.delete(labResult).where(eq(labResult.panelId, panelId));
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
  if (rows[0]?.severity === "anaphylactic") {
    throw new Error("Anaphylactic allergies cannot be deleted — mark as resolved instead.");
  }
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
    ...panels.map(
      (p): TimelineEvent => ({
        kind: "lab_panel",
        id: p.id,
        date: p.date,
        title: p.labName ? `Labs — ${p.labName}` : "Lab panel",
        subtitle: [p.city, p.country].filter(Boolean).join(", ") || null,
        outOfRangeCount: p.outOfRangeCount,
        resultCount: p.resultCount,
      }),
    ),
    ...visits.map(
      (v): TimelineEvent => ({
        kind: "visit",
        id: v.id,
        date: v.date,
        title: v.doctorName
          ? `Visit — ${v.doctorName}`
          : `Visit${v.specialty ? ` — ${v.specialty}` : ""}`,
        subtitle: [v.clinic, v.city].filter(Boolean).join(", ") || v.specialty,
      }),
    ),
    ...diagnoses.map(
      (d): TimelineEvent => ({
        kind: "diagnosis",
        id: d.id,
        date: d.date,
        title: d.name,
        subtitle: d.icdCode,
        status: d.status,
      }),
    ),
    ...meds.map(
      (m): TimelineEvent => ({
        kind: "medication",
        id: m.id,
        date: m.startDate,
        endDate: m.endDate,
        title: m.name,
        subtitle: m.doseAmount ? `${m.doseAmount} ${m.doseUnit ?? ""}`.trim() : null,
        type: m.type,
      }),
    ),
    // Allergies anchor on onset date; entries without one have no place on a timeline.
    ...allergies
      .filter((a) => a.onsetDate != null)
      .map(
        (a): TimelineEvent => ({
          kind: "allergy",
          id: a.id,
          date: a.onsetDate!,
          title: a.allergen,
          subtitle: a.reaction,
          severity: a.severity,
        }),
      ),
    ...vaccines.map(
      (v): TimelineEvent => ({
        kind: "vaccine",
        id: v.id,
        date: v.date,
        title: v.vaccineName,
        subtitle: v.dose != null ? `Dose ${v.dose}` : null,
      }),
    ),
    // Severity filtering (≥ 6 by default) happens in the UI, not here.
    ...symptoms.map(
      (s): TimelineEvent => ({
        kind: "symptom",
        id: s.id,
        date: s.date,
        title: s.symptomName,
        subtitle: s.notes,
        severity: s.severity,
      }),
    ),
    ...imaging.map(
      (i): TimelineEvent => ({
        kind: "imaging",
        id: i.id,
        date: i.date,
        title: `${i.modalityType.toUpperCase()} — ${i.bodyArea}`,
        subtitle: i.clinic,
      }),
    ),
  ];

  return events.sort((a, b) => b.date.localeCompare(a.date));
}
