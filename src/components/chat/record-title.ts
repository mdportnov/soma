import {
  getAttachment,
  getBiomarker,
  getDiagnosis,
  getHealthNote,
  getImagingRecord,
  getMedication,
  getPanel,
  getVisit,
  listAllergies,
  listBpLog,
  listLifestyleLog,
  listRetestSchedules,
  listSymptomLog,
  listVaccines,
  listWeightLog,
} from "@/db/repos";
import { getChatThreadSummary } from "@/db/chat-repos";
import type { EntityType } from "@/db/search-index";
import { fileName } from "@/db/search-index";
import { formatDate } from "@/lib/utils";
import { recordLinkType } from "./record-link";

export type RecordRef = { entityType: string; entityId: number };

/** Key of one record in the title map. */
export function recordKey(ref: RecordRef): string {
  return `${recordLinkType(ref.entityType)}:${ref.entityId}`;
}

/**
 * Resolves the display name of every record a chat touched: "Ferritin",
 * "12 Mar 2024 — Dr. Ivanova", "MRI knee, 3 Jun 2025". A type/id pair is what
 * the thread footprint stores, and it is what the user must never be shown —
 * the point of the card is to recognise the record, not to look it up.
 *
 * Rows that no longer exist resolve to `null` so the card can say so instead
 * of inventing a name. Nested rows (a single lab result or finding, a
 * prescription) have no by-id read in the repository and resolve to
 * `undefined` — unknown rather than gone — so the card falls back to the id
 * for them; their link still opens the right panel or section.
 *
 * Whole-list lookups (allergies, vaccines, logs) are fetched once per call
 * and shared across every record of that type.
 */
export async function resolveRecordTitles(
  refs: readonly RecordRef[],
  profileId: number,
  t: (key: string) => string,
): Promise<Map<string, string | null | undefined>> {
  const lists = new Map<string, Promise<{ id: number; title: string }[]>>();
  const fromList = async (type: EntityType, id: number) => {
    let pending = lists.get(type);
    if (!pending) {
      pending = loadList(type, profileId, t);
      lists.set(type, pending);
    }
    return (await pending).find((row) => row.id === id)?.title ?? null;
  };

  const entries = await Promise.all(
    refs.map(async (ref): Promise<[string, string | null | undefined]> => {
      const type = recordLinkType(ref.entityType);
      const id = ref.entityId;
      let title: string | null | undefined;
      try {
        title = await resolveOne(type, id, t, fromList);
      } catch {
        // A failed read is not evidence the record is gone.
        title = undefined;
      }
      return [recordKey(ref), title];
    }),
  );
  return new Map(entries);
}

async function resolveOne(
  type: EntityType,
  id: number,
  t: (key: string) => string,
  fromList: (type: EntityType, id: number) => Promise<string | null>,
): Promise<string | null | undefined> {
  switch (type) {
    case "biomarker":
      return (await getBiomarker(id))?.canonicalName ?? null;
    case "lab_panel": {
      const panel = await getPanel(id);
      return panel ? withDate(panel.labName, panel.date) : null;
    }
    case "visit": {
      const visit = await getVisit(id);
      return visit
        ? withDate(visit.doctorName || visit.clinic || visit.specialty, visit.date)
        : null;
    }
    case "diagnosis":
      return (await getDiagnosis(id))?.name ?? null;
    case "medication":
      return (await getMedication(id))?.name ?? null;
    case "imaging": {
      const rec = await getImagingRecord(id);
      return rec
        ? withDate(`${t(`imagingModality.${rec.modalityType}`)} ${rec.bodyArea}`.trim(), rec.date)
        : null;
    }
    case "health_note": {
      const note = await getHealthNote(id);
      if (!note) return null;
      const text = (note.title || note.summary || note.originalText).replace(/\s+/g, " ").trim();
      return text.length > 60 ? `${text.slice(0, 60)}…` : text;
    }
    case "attachment": {
      const file = await getAttachment(id);
      return file ? fileName(file.filePath) : null;
    }
    case "chat_thread":
      return (await getChatThreadSummary(id))?.displayTitle ?? null;
    case "allergy":
    case "vaccine":
    case "symptom":
    case "weight_log":
    case "bp_log":
    case "lifestyle_log":
    case "retest":
      return fromList(type, id);
    default:
      return undefined;
  }
}

async function loadList(
  type: EntityType,
  profileId: number,
  t: (key: string) => string,
): Promise<{ id: number; title: string }[]> {
  switch (type) {
    case "allergy":
      return (await listAllergies(profileId)).map((a) => ({ id: a.id, title: a.allergen }));
    case "vaccine":
      return (await listVaccines(profileId)).map((v) => ({
        id: v.id,
        title: withDate(v.vaccineName, v.date),
      }));
    case "symptom":
      return (await listSymptomLog(profileId)).map((s) => ({
        id: s.id,
        title: withDate(s.symptomName, s.date),
      }));
    case "weight_log":
      return (await listWeightLog(profileId)).map((w) => ({
        id: w.id,
        title: withDate(`${w.weightKg} ${t("common.kg")}`, w.date),
      }));
    case "bp_log":
      return (await listBpLog(profileId)).map((b) => ({
        id: b.id,
        title: withDate(`${b.systolic}/${b.diastolic}`, b.date),
      }));
    case "lifestyle_log":
      return (await listLifestyleLog(profileId)).map((l) => ({
        id: l.id,
        title: formatDate(l.date),
      }));
    case "retest":
      return (await listRetestSchedules(profileId)).map((r) => ({ id: r.id, title: r.label }));
    default:
      return [];
  }
}

/** "Name, 12 Mar 2024" — or just the date when the row has no name of its own. */
function withDate(name: string | null | undefined, date: string | null | undefined): string {
  const label = name?.trim();
  const day = date ? formatDate(date) : "";
  return [label, day].filter(Boolean).join(", ") || "—";
}
