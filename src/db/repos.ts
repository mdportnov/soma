import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "./client";
import {
  attachment,
  biomarker,
  diagnosis,
  labPanel,
  labResult,
  medication,
  prescription,
  profile,
  visit,
  type Biomarker,
  type Diagnosis,
  type LabPanel,
  type LabResult,
  type Medication,
  type NewAttachment,
  type NewBiomarker,
  type NewDiagnosis,
  type NewLabPanel,
  type NewLabResult,
  type NewMedication,
  type NewPrescription,
  type NewVisit,
  type Visit,
} from "./schema";
import { computeFlag, convertToDefaultUnit } from "@/lib/units";

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

export async function getProfile(id: number) {
  const rows = await db.select().from(profile).where(eq(profile.id, id));
  return rows[0] ?? null;
}

export async function updateProfile(
  id: number,
  data: Partial<{
    name: string;
    birthDate: string | null;
    sex: "male" | "female" | "other" | null;
  }>,
) {
  await db.update(profile).set(data).where(eq(profile.id, id));
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

// ── lab panels & results ───────────────────────────────────────────────────

export type PanelWithCount = LabPanel & { resultCount: number; outOfRangeCount: number };

export async function listPanels(profileId: number): Promise<PanelWithCount[]> {
  const rows = await db
    .select({
      panel: labPanel,
      resultCount: count(labResult.id),
      outOfRangeCount: sql<number>`coalesce(sum(${labResult.outOfRange}), 0)`,
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
  }));
}

export type ResultWithBiomarker = LabResult & { biomarker: Biomarker };

export async function getPanel(panelId: number) {
  const rows = await db.select().from(labPanel).where(eq(labPanel.id, panelId));
  return rows[0] ?? null;
}

export async function getPanelResults(panelId: number): Promise<ResultWithBiomarker[]> {
  const rows = await db
    .select({ result: labResult, bio: biomarker })
    .from(labResult)
    .innerJoin(biomarker, eq(labResult.biomarkerId, biomarker.id))
    .where(eq(labResult.panelId, panelId))
    .orderBy(asc(biomarker.category), asc(biomarker.canonicalName));
  return rows.map((r) => ({ ...r.result, biomarker: r.bio }));
}

export type ResultInput = {
  biomarkerId: number;
  value: number;
  unit: string;
  rawLabel?: string | null;
};

/** Creates a panel with results; computes normalization + flags per result. */
export async function createPanelWithResults(
  panelData: NewLabPanel,
  results: ResultInput[],
  biomarkersById: Map<number, Biomarker>,
): Promise<number> {
  const [panelRow] = await db.insert(labPanel).values(panelData).returning({ id: labPanel.id });
  if (results.length) {
    const values: NewLabResult[] = results.map((r) => {
      const bio = biomarkersById.get(r.biomarkerId);
      let unitNormalized: string | null = null;
      let valueNormalized: number | null = null;
      let outOfRange = false;
      let flag: "low" | "high" | "critical" | null = null;
      if (bio) {
        const conv = convertToDefaultUnit(r.value, r.unit, bio);
        if (conv.ok) {
          unitNormalized = conv.unit;
          valueNormalized = conv.value;
          ({ outOfRange, flag } = computeFlag(conv.value, bio));
        }
      }
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
      };
    });
    await db.insert(labResult).values(values);
  }
  return panelRow.id;
}

export async function deletePanel(panelId: number) {
  await db.delete(labResult).where(eq(labResult.panelId, panelId));
  await db.delete(labPanel).where(eq(labPanel.id, panelId));
}

export type SeriesPoint = {
  date: string;
  value: number;
  unit: string;
  outOfRange: boolean;
  flag: string | null;
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
      panelId: labPanel.id,
      labName: labPanel.labName,
    })
    .from(labResult)
    .innerJoin(labPanel, eq(labResult.panelId, labPanel.id))
    .where(and(eq(labPanel.profileId, profileId), eq(labResult.biomarkerId, biomarkerId)))
    .orderBy(asc(labPanel.date));
  return rows.map((r) => ({ ...r, outOfRange: Boolean(r.outOfRange) }));
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
    })
    .from(labResult)
    .innerJoin(labPanel, eq(labResult.panelId, labPanel.id))
    .where(eq(labPanel.profileId, profileId))
    .orderBy(asc(labPanel.date));
  const latest = new Map<number, (typeof rows)[number]>();
  for (const r of rows) latest.set(r.biomarkerId, r); // ordered asc → last write wins
  return latest;
}

// ── medications ────────────────────────────────────────────────────────────

export async function listMedications(profileId: number): Promise<Medication[]> {
  return db
    .select()
    .from(medication)
    .where(eq(medication.profileId, profileId))
    .orderBy(desc(isNull(medication.endDate)), desc(medication.startDate));
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
  await db.delete(prescription).where(eq(prescription.visitId, id));
  await db.update(diagnosis).set({ visitId: null }).where(eq(diagnosis.visitId, id));
  await db.delete(visit).where(eq(visit.id, id));
}

export async function listDiagnoses(profileId: number): Promise<Diagnosis[]> {
  return db
    .select()
    .from(diagnosis)
    .where(eq(diagnosis.profileId, profileId))
    .orderBy(desc(diagnosis.date));
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

// ── attachments ────────────────────────────────────────────────────────────

export async function createAttachment(data: NewAttachment): Promise<number> {
  const [row] = await db.insert(attachment).values(data).returning({ id: attachment.id });
  return row.id;
}

export async function updateAttachment(id: number, data: Partial<NewAttachment>) {
  await db.update(attachment).set(data).where(eq(attachment.id, id));
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
    };

export async function getTimeline(profileId: number): Promise<TimelineEvent[]> {
  const [panels, visits, diagnoses, meds] = await Promise.all([
    listPanels(profileId),
    listVisits(profileId),
    listDiagnoses(profileId),
    listMedications(profileId),
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
  ];

  return events.sort((a, b) => b.date.localeCompare(a.date));
}
