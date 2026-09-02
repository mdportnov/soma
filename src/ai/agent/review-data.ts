/**
 * Loads everything `buildHealthReview` / `buildChangesSince` need for one
 * profile. Kept apart from the pure review so the analysis stays testable with
 * fixtures and the DB access stays in one obvious place.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { labPanel, labResult } from "@/db/schema";
import {
  getProfile,
  getReferenceRangesByBiomarker,
  listAllergies,
  listBiomarkers,
  listBpLog,
  listDiagnoses,
  listHealthNotes,
  listImagingRecords,
  listMedications,
  listRetestSchedules,
  listSymptomLog,
  listVaccines,
  listVisits,
  listWeightLog,
} from "@/db/repos";
import type { ReviewInput, ReviewResultRow } from "./review";

/** Every lab result of the profile joined with its panel date and lab. */
export async function listAllResults(profileId: number): Promise<ReviewResultRow[]> {
  const rows = await db
    .select({
      resultId: labResult.id,
      biomarkerId: labResult.biomarkerId,
      panelId: labPanel.id,
      date: labPanel.date,
      labName: labPanel.labName,
      value: labResult.value,
      unit: labResult.unit,
      valueNormalized: labResult.valueNormalized,
      unitNormalized: labResult.unitNormalized,
      outOfRange: labResult.outOfRange,
      flag: labResult.flag,
    })
    .from(labResult)
    .innerJoin(labPanel, eq(labResult.panelId, labPanel.id))
    .where(and(eq(labPanel.profileId, profileId)));
  return rows.map((r) => ({ ...r, outOfRange: Boolean(r.outOfRange) }));
}

export async function loadReviewInput(profileId: number, today: string): Promise<ReviewInput> {
  const [
    profile,
    biomarkers,
    ranges,
    results,
    medications,
    diagnoses,
    allergies,
    retestSchedules,
    bpLog,
    weightLog,
    symptoms,
    visits,
    vaccines,
    imaging,
    notes,
  ] = await Promise.all([
    getProfile(profileId),
    listBiomarkers(),
    getReferenceRangesByBiomarker(),
    listAllResults(profileId),
    listMedications(profileId),
    listDiagnoses(profileId),
    listAllergies(profileId),
    listRetestSchedules(profileId),
    listBpLog(profileId),
    listWeightLog(profileId),
    listSymptomLog(profileId),
    listVisits(profileId),
    listVaccines(profileId),
    listImagingRecords(profileId),
    listHealthNotes(profileId),
  ]);
  return {
    today,
    profile,
    biomarkers,
    ranges,
    results,
    medications,
    diagnoses,
    allergies,
    retestSchedules,
    bpLog,
    weightLog,
    symptoms,
    visits,
    vaccines,
    imagingCount: imaging.length,
    healthNoteCount: notes.length,
  };
}
