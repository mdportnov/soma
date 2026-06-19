import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  allergy,
  attachment,
  biomarker,
  bpLog,
  diagnosis,
  imagingRecord,
  labPanel,
  labResult,
  medication,
  medicationLog,
  prescription,
  profile,
  symptomLog,
  vaccine,
  visit,
  weightLog,
} from "@/db/schema";

/** Full data export to JSON — no lock-in (§8). */
export async function exportAllJson(): Promise<boolean> {
  const payload = {
    exportedAt: new Date().toISOString(),
    app: "soma",
    schemaVersion: 1,
    data: {
      profiles: await db.select().from(profile),
      biomarkers: await db.select().from(biomarker),
      labPanels: await db.select().from(labPanel),
      labResults: await db.select().from(labResult),
      medications: await db.select().from(medication),
      medicationLogs: await db.select().from(medicationLog),
      visits: await db.select().from(visit),
      diagnoses: await db.select().from(diagnosis),
      prescriptions: await db.select().from(prescription),
      allergies: await db.select().from(allergy),
      vaccines: await db.select().from(vaccine),
      symptomLogs: await db.select().from(symptomLog),
      imagingRecords: await db.select().from(imagingRecord),
      weightLogs: await db.select().from(weightLog),
      bpLogs: await db.select().from(bpLog),
      attachments: await db.select().from(attachment),
    },
  };
  const path = await save({
    defaultPath: `soma-export-${payload.exportedAt.slice(0, 10)}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!path) return false;
  await writeTextFile(path, JSON.stringify(payload, null, 2));
  return true;
}

function csvEscape(v: unknown): string {
  if (v == null) return "";
  let s = String(v);
  // Neutralize spreadsheet formula injection: a field starting with =, +, -, @
  // (or a control char some apps treat as a formula lead) is executed by
  // Excel/Sheets/LibreOffice on open. Prefix a single quote so it stays text.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** Lab results as flat CSV (date, biomarker, value, unit, flags…). */
export async function exportLabsCsv(profileId: number): Promise<boolean> {
  const rows = await db
    .select({
      date: labPanel.date,
      lab: labPanel.labName,
      city: labPanel.city,
      country: labPanel.country,
      collectionTime: labPanel.collectionTime,
      fasting: labPanel.fasting,
      cycleDay: labPanel.menstrualCycleDay,
      biomarker: biomarker.canonicalName,
      category: biomarker.category,
      value: labResult.value,
      unit: labResult.unit,
      valueNormalized: labResult.valueNormalized,
      unitNormalized: labResult.unitNormalized,
      outOfRange: labResult.outOfRange,
      flag: labResult.flag,
      rawLabel: labResult.rawLabel,
    })
    .from(labResult)
    .innerJoin(labPanel, eq(labResult.panelId, labPanel.id))
    .innerJoin(biomarker, eq(labResult.biomarkerId, biomarker.id))
    .where(eq(labPanel.profileId, profileId))
    .orderBy(asc(labPanel.date));

  const header = Object.keys(rows[0] ?? { date: "", lab: "", biomarker: "", value: "", unit: "" });
  const csv = [
    header.join(","),
    ...rows.map((r) => header.map((h) => csvEscape((r as Record<string, unknown>)[h])).join(",")),
  ].join("\n");

  const path = await save({
    defaultPath: `soma-labs-${new Date().toISOString().slice(0, 10)}.csv`,
    filters: [{ name: "CSV", extensions: ["csv"] }],
  });
  if (!path) return false;
  await writeTextFile(path, csv);
  return true;
}
