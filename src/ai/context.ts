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
  getRecentLifestyle,
  listAllergies,
  listBiomarkers,
  listDiagnoses,
  listMedications,
} from "@/db/repos";
import type { LifestyleLog } from "@/db/schema";

/** Cap on listed abnormal markers, to bound the prompt token cost. */
const MAX_ABNORMAL = 25;

/** Window (days) of lifestyle entries folded into the AI context summary. */
const LIFESTYLE_WINDOW_DAYS = 30;

/** Mean of the defined numeric values, or null when none are present. */
function mean(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v != null);
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** Rounds to one decimal for compact prompt text. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Compact one-line lifestyle summary over the recent window: average sleep,
 * training load, stress/energy and resting HR. Returns null when nothing is
 * logged, so the context line is only added when there is signal.
 */
function lifestyleSummaryLine(rows: LifestyleLog[]): string | null {
  if (!rows.length) return null;
  const parts: string[] = [];
  const sleep = mean(rows.map((r) => r.sleepHours));
  if (sleep != null) parts.push(`avg sleep ${round1(sleep)}h`);
  const sleepQ = mean(rows.map((r) => r.sleepQuality));
  if (sleepQ != null) parts.push(`sleep quality ${round1(sleepQ)}/5`);
  const trainingDays = rows.filter((r) => (r.trainingMinutes ?? 0) > 0).length;
  const trainingMin = rows.reduce((a, r) => a + (r.trainingMinutes ?? 0), 0);
  if (trainingMin > 0) parts.push(`${trainingMin} training min over ${trainingDays} day(s)`);
  const stress = mean(rows.map((r) => r.stressLevel));
  if (stress != null) parts.push(`avg stress ${round1(stress)}/5`);
  const energy = mean(rows.map((r) => r.energyLevel));
  if (energy != null) parts.push(`avg energy ${round1(energy)}/5`);
  const rhr = mean(rows.map((r) => r.restingHeartRate));
  if (rhr != null) parts.push(`avg resting HR ${Math.round(rhr)} bpm`);
  if (!parts.length) return null;
  return `Lifestyle (last ${LIFESTYLE_WINDOW_DAYS}d, ${rows.length} day(s) logged): ${parts.join(", ")}.`;
}

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
  const [profile, allergies, diagnoses, medications, latest, biomarkers, lifestyle] =
    await Promise.all([
      getProfile(profileId),
      listAllergies(profileId),
      listDiagnoses(profileId),
      listMedications(profileId),
      getLatestResults(profileId),
      listBiomarkers(),
      getRecentLifestyle(profileId, LIFESTYLE_WINDOW_DAYS),
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
    latest.size === 0
      ? "Labs: no lab results have been recorded yet."
      : abnormal.length
        ? `Latest out-of-range markers: ${abnormal.join("; ")}`
        : "Latest labs: all recorded markers are within range in their most recent values.",
  );

  const lifestyleLine = lifestyleSummaryLine(lifestyle);
  if (lifestyleLine) lines.push(lifestyleLine);

  return lines.join("\n");
}
