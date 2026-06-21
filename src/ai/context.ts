/**
 * Health-context loader for the v0.3 AI analysis layer (§8).
 *
 * Assembles a compact, plain-text medical summary the chat/interpretation
 * prompts inject as system context. It mirrors the MCP `get_medical_summary`
 * tool — profile basics, active allergies (anaphylactic first), active
 * diagnoses, current medications, and the latest out-of-range labs — but stays
 * entirely local: only this distilled summary (never the raw documents) is ever
 * sent to the provider, and only when the user invokes an AI feature.
 */

import { ageYearsFrom } from "@/lib/units";
import {
  getLatestResults,
  getProfile,
  listAllergies,
  listBiomarkers,
  listDiagnoses,
  listMedications,
} from "@/db/repos";

/** Cap on listed abnormal markers, to bound the prompt token cost. */
const MAX_ABNORMAL = 25;

const SEVERITY_ORDER = { anaphylactic: 0, severe: 1, moderate: 2, mild: 3 } as const;

function bloodTypeLabel(
  bloodType: string | null,
  rhFactor: string | null | undefined,
): string | null {
  if (!bloodType) return null;
  const rh = rhFactor === "positive" ? "+" : rhFactor === "negative" ? "-" : "";
  return `${bloodType}${rh}`;
}

/**
 * Builds the compact health-context string for AI prompts. Returns a short
 * placeholder when the profile has essentially no data, so the model is never
 * handed an empty context that invites speculation.
 */
export async function buildHealthContext(profileId: number): Promise<string> {
  const [profile, allergies, diagnoses, medications, latest, biomarkers] = await Promise.all([
    getProfile(profileId),
    listAllergies(profileId),
    listDiagnoses(profileId),
    listMedications(profileId),
    getLatestResults(profileId),
    listBiomarkers(),
  ]);
  if (!profile) return "No profile data is available yet.";

  const lines: string[] = [];

  const age = ageYearsFrom(profile.birthDate);
  const blood = bloodTypeLabel(profile.bloodType, profile.rhFactor);
  const demographics = [
    age != null ? `${age}y` : null,
    profile.sex,
    blood ? `blood ${blood}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  lines.push(`Profile: ${demographics || "no demographics recorded"}.`);
  if (profile.conditions) lines.push(`Stated conditions: ${profile.conditions}`);

  const activeAllergies = allergies
    .filter((a) => a.status === "active")
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  lines.push(
    activeAllergies.length
      ? `Allergies: ${activeAllergies.map((a) => `${a.allergen} (${a.severity}${a.reaction ? `, ${a.reaction}` : ""})`).join("; ")}`
      : "Allergies: none recorded.",
  );

  const activeDiagnoses = diagnoses.filter((d) => d.status === "active");
  if (activeDiagnoses.length) {
    lines.push(
      `Active diagnoses: ${activeDiagnoses.map((d) => d.name + (d.icdCode ? ` [${d.icdCode}]` : "")).join("; ")}`,
    );
  }

  const activeMeds = medications.filter((m) => m.endDate == null);
  if (activeMeds.length) {
    lines.push(
      `Current medications: ${activeMeds
        .map((m) => m.name + (m.doseAmount != null ? ` ${m.doseAmount}${m.doseUnit ?? ""}` : ""))
        .join("; ")}`,
    );
  }

  const bioById = new Map(biomarkers.map((b) => [b.id, b]));
  const abnormal: string[] = [];
  for (const [biomarkerId, r] of latest) {
    if (!r.outOfRange) continue;
    const bio = bioById.get(biomarkerId);
    if (!bio) continue;
    abnormal.push(
      `${bio.canonicalName} ${r.value} ${r.unit} (${r.flag ?? "out of range"}, ${r.date})`,
    );
    if (abnormal.length >= MAX_ABNORMAL) break;
  }
  lines.push(
    abnormal.length
      ? `Latest out-of-range markers: ${abnormal.join("; ")}`
      : "Latest labs: no out-of-range markers in the most recent values.",
  );

  return lines.join("\n");
}
