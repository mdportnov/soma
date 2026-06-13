import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import type { EmergencyCardData } from "@/db/repos";
import type { Allergy } from "@/db/schema";

/** Translator signature compatible with the i18n `t` returned by useI18n(). */
export type Translate = (key: string, vars?: Record<string, string>) => string;

export type EmergencyExportOptions = {
  t: Translate;
  /** BCP-47 locale used for date formatting (e.g. "en-GB", "ru-RU"). */
  locale: string;
  /** Date the card is generated; defaults to now. */
  now?: Date;
};

const escapeHtml = (s: string): string =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

function formatDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}

function ageFromBirthDate(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

export function severityClass(severity: Allergy["severity"]): "danger" | "warn" | "muted" {
  if (severity === "anaphylactic" || severity === "severe") return "danger";
  if (severity === "moderate") return "warn";
  return "muted";
}

/** ABO numeral used in Russian/European tradition: O=I, A=II, B=III, AB=IV. */
const BLOOD_NUMERAL: Record<string, string> = { O: "I", A: "II", B: "III", AB: "IV" };

function bloodTypeLabel(data: EmergencyCardData): string {
  const { bloodType, rhFactor } = data.profile;
  if (!bloodType) return "—";
  const rh = rhFactor === "positive" ? " Rh+" : rhFactor === "negative" ? " Rh−" : "";
  const numeral = BLOOD_NUMERAL[bloodType];
  return `${bloodType}${rhFactor === "positive" ? "+" : rhFactor === "negative" ? "−" : ""} (${numeral}${rh})`;
}

function row(cells: string[]): string {
  return `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
}

function emptyRow(span: number, text: string): string {
  return `<tr><td class="empty" colspan="${span}">${escapeHtml(text)}</td></tr>`;
}

/**
 * Pure generator: produces a fully self-contained HTML document (inline styles,
 * system font stack, no external resources, no JS) mirroring the on-screen card.
 */
export function generateEmergencyHtml(
  data: EmergencyCardData,
  opts: EmergencyExportOptions,
): string {
  const { t, locale } = opts;
  const now = opts.now ?? new Date();
  const p = data.profile;
  const fd = (iso: string | null | undefined) => escapeHtml(formatDate(iso, locale));
  const today = now.toISOString().slice(0, 10);

  const age = ageFromBirthDate(p.birthDate);
  const sexLabel = p.sex
    ? t(`profile.options.${p.sex === "other" ? "otherIntersex" : p.sex}`)
    : "—";

  // ── Identity ──────────────────────────────────────────────────────────────
  const identityRows = [
    row([escapeHtml(t("emergency.identity.name")), escapeHtml(p.name || "—")]),
    row([
      escapeHtml(t("emergency.identity.dob")),
      p.birthDate
        ? `${fd(p.birthDate)}${age != null ? ` · ${escapeHtml(t("emergency.identity.ageValue", { years: String(age) }))}` : ""}`
        : "—",
    ]),
    row([escapeHtml(t("emergency.identity.sex")), escapeHtml(sexLabel)]),
    row([escapeHtml(t("emergency.identity.bloodType")), escapeHtml(bloodTypeLabel(data))]),
    ...(p.citizenship
      ? [row([escapeHtml(t("emergency.identity.citizenship")), escapeHtml(p.citizenship)])]
      : []),
    ...(p.languages
      ? [row([escapeHtml(t("emergency.identity.languages")), escapeHtml(p.languages)])]
      : []),
  ].join("");

  // ── Critical status (pregnancy / resuscitation / organ donor) ─────────────
  const criticalRows = [
    ...(p.pregnancyStatus && p.pregnancyStatus !== "not_pregnant"
      ? [
          row([
            escapeHtml(t("emergency.criticalStatus.pregnancy")),
            escapeHtml(t(`emergency.criticalStatus.pregnancyValues.${p.pregnancyStatus}`)),
          ]),
        ]
      : []),
    ...(p.codeStatus
      ? [
          row([
            escapeHtml(t("emergency.criticalStatus.codeStatus")),
            escapeHtml(t(`emergency.criticalStatus.codeStatusValues.${p.codeStatus}`)),
          ]),
        ]
      : []),
    ...(p.organDonor != null
      ? [
          row([
            escapeHtml(t("emergency.criticalStatus.organDonor")),
            escapeHtml(
              t(p.organDonor ? "emergency.criticalStatus.yes" : "emergency.criticalStatus.no"),
            ),
          ]),
        ]
      : []),
  ].join("");

  // ── Emergency contact ─────────────────────────────────────────────────────
  const hasContact = !!(p.emergencyContactName || p.emergencyContactPhone);
  const contactBody = hasContact
    ? [
        row([escapeHtml(t("emergency.contact.name")), escapeHtml(p.emergencyContactName || "—")]),
        row([escapeHtml(t("emergency.contact.phone")), escapeHtml(p.emergencyContactPhone || "—")]),
        row([
          escapeHtml(t("emergency.contact.relation")),
          escapeHtml(p.emergencyContactRelation || "—"),
        ]),
      ].join("")
    : emptyRow(2, t("emergency.contact.empty"));

  // ── Insurance & assistance ────────────────────────────────────────────────
  const hasInsurance = !!(p.insurer || p.insurancePolicyNumber || p.insurancePhone);
  const insuranceBody = hasInsurance
    ? [
        ...(p.insurer
          ? [row([escapeHtml(t("emergency.insurance.insurer")), escapeHtml(p.insurer)])]
          : []),
        ...(p.insurancePolicyNumber
          ? [
              row([
                escapeHtml(t("emergency.insurance.policyNumber")),
                escapeHtml(p.insurancePolicyNumber),
              ]),
            ]
          : []),
        ...(p.insurancePhone
          ? [row([escapeHtml(t("emergency.insurance.phone")), escapeHtml(p.insurancePhone)])]
          : []),
      ].join("")
    : emptyRow(2, t("emergency.emptyInsurance"));

  // ── Important notes ───────────────────────────────────────────────────────
  const notesBody = p.emergencyNotes?.trim()
    ? `<tr><td colspan="2" style="white-space:pre-wrap">${escapeHtml(p.emergencyNotes.trim())}</td></tr>`
    : "";

  // ── Allergies ─────────────────────────────────────────────────────────────
  const allergyHeader = `<tr><th>${escapeHtml(t("emergency.allergies.allergen"))}</th><th>${escapeHtml(t("emergency.allergies.severity"))}</th><th>${escapeHtml(t("emergency.allergies.reaction"))}</th></tr>`;
  const allergyRow = (a: Allergy, resolved: boolean): string => {
    const badge = `<span class="badge ${severityClass(a.severity)}">${escapeHtml(t(`allergySeverity.${a.severity}`))}</span>`;
    const sev = resolved
      ? `${badge} <span class="badge muted">${escapeHtml(t("emergency.allergies.resolved"))}</span>`
      : badge;
    return `<tr class="${resolved ? "resolved" : ""}"><td>${escapeHtml(a.allergen)}</td><td>${sev}</td><td>${escapeHtml(a.reaction || "—")}</td></tr>`;
  };
  const allergyBody =
    data.activeAllergies.length === 0 && data.resolvedAllergies.length === 0
      ? emptyRow(3, t("emergency.allergies.none"))
      : [
          ...data.activeAllergies.map((a) => allergyRow(a, false)),
          ...data.resolvedAllergies.map((a) => allergyRow(a, true)),
        ].join("");

  // ── Medications ───────────────────────────────────────────────────────────
  const medHeader = `<tr><th>${escapeHtml(t("emergency.medications.name"))}</th><th>${escapeHtml(t("emergency.medications.dose"))}</th><th>${escapeHtml(t("emergency.medications.schedule"))}</th><th>${escapeHtml(t("emergency.medications.since"))}</th></tr>`;
  const medRow = (m: EmergencyCardData["activeMedications"][number], prn: boolean): string => {
    const dose = m.doseAmount != null ? `${m.doseAmount}${m.doseUnit ? ` ${m.doseUnit}` : ""}` : "—";
    const baseFreq = m.schedule?.frequency ? m.schedule.frequency.replaceAll("_", " ") : "—";
    const freq = prn ? t("emergency.medications.asNeededTitle") : baseFreq;
    return row([escapeHtml(m.name), escapeHtml(dose), escapeHtml(freq), fd(m.startDate)]);
  };
  const medBody =
    data.activeMedications.length === 0 && data.asNeededMedications.length === 0
      ? emptyRow(4, t("emergency.medications.none"))
      : [
          ...data.activeMedications.map((m) => medRow(m, false)),
          ...data.asNeededMedications.map((m) => medRow(m, true)),
        ].join("");

  // ── Diagnoses ─────────────────────────────────────────────────────────────
  const dxHeader = `<tr><th>${escapeHtml(t("emergency.diagnoses.name"))}</th><th>${escapeHtml(t("emergency.diagnoses.icd"))}</th><th>${escapeHtml(t("emergency.diagnoses.date"))}</th></tr>`;
  const dxBody =
    data.activeDiagnoses.length === 0
      ? emptyRow(3, t("emergency.diagnoses.none"))
      : data.activeDiagnoses
          .map((d) => row([escapeHtml(d.name), escapeHtml(d.icdCode || "—"), fd(d.date)]))
          .join("");

  // ── Vaccines ──────────────────────────────────────────────────────────────
  const vaxHeader = `<tr><th>${escapeHtml(t("emergency.vaccines.name"))}</th><th>${escapeHtml(t("emergency.vaccines.date"))}</th><th>${escapeHtml(t("emergency.vaccines.dose"))}</th><th>${escapeHtml(t("emergency.vaccines.expires"))}</th></tr>`;
  const vaxBody =
    data.recentVaccines.length === 0
      ? emptyRow(4, t("emergency.vaccines.none"))
      : data.recentVaccines
          .map((v) => {
            const dose =
              v.dose != null
                ? escapeHtml(t("emergency.vaccines.doseValue", { n: String(v.dose) }))
                : "—";
            const expired = !!v.expiresAt && v.expiresAt.slice(0, 10) < today;
            const expires = v.expiresAt
              ? `${fd(v.expiresAt)}${expired ? ` <span class="badge danger">${escapeHtml(t("emergency.vaccines.expired"))}</span>` : ""}`
              : "—";
            return `<tr><td>${escapeHtml(v.vaccineName)}</td><td>${fd(v.date)}</td><td>${dose}</td><td>${expires}</td></tr>`;
          })
          .join("");

  const section = (title: string, head: string, body: string): string =>
    `<section><h2>${escapeHtml(title)}</h2><table>${head ? `<thead>${head}</thead>` : ""}<tbody>${body}</tbody></table></section>`;

  const footer = escapeHtml(t("emergency.footer", { date: formatDate(today, locale) }));

  return `<!doctype html>
<html lang="${escapeHtml(locale.slice(0, 2))}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(t("emergency.title"))} — ${escapeHtml(p.name || "Soma")}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 32px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1a1a1a; background: #fff; line-height: 1.5;
    max-width: 820px; margin-inline: auto;
  }
  header { border-bottom: 2px solid #1a1a1a; padding-bottom: 12px; margin-bottom: 8px; }
  h1 { font-size: 22px; margin: 0; }
  .subtitle { color: #555; font-size: 13px; margin-top: 4px; }
  section { margin-top: 24px; break-inside: avoid; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: .04em; color: #444;
       margin: 0 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; font-weight: 600; color: #666; font-size: 11px;
       text-transform: uppercase; letter-spacing: .03em; padding: 4px 8px 4px 0; }
  td { padding: 5px 8px 5px 0; vertical-align: top; border-top: 1px solid #f0f0f0; }
  tr:first-child td { border-top: none; }
  td:first-child { color: #555; width: 30%; }
  .empty { color: #999; font-style: italic; }
  tr.resolved td { opacity: .6; }
  .badge { display: inline-block; padding: 1px 7px; border-radius: 999px;
           font-size: 11px; font-weight: 600; border: 1px solid transparent; }
  .badge.danger { background: #fdecec; color: #b3261e; }
  .badge.warn { background: #fff4e5; color: #9a5b00; }
  .badge.muted { background: #f0f0f0; color: #555; }
  footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #ddd;
           font-size: 11px; color: #777; }
  @media print {
    body { padding: 0; max-width: none; }
    section { page-break-inside: avoid; }
    .badge { border: 1px solid currentColor; }
    @page { margin: 16mm; }
  }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(t("emergency.title"))}</h1>
  <div class="subtitle">${escapeHtml(p.name || "—")}</div>
</header>
${section(t("emergency.sections.identity"), "", identityRows)}
${criticalRows ? section(t("emergency.sections.criticalStatus"), "", criticalRows) : ""}
${section(t("emergency.sections.contact"), "", contactBody)}
${section(t("emergency.sections.insurance"), "", insuranceBody)}
${section(t("emergency.sections.allergies"), allergyHeader, allergyBody)}
${notesBody ? section(t("emergency.sections.notes"), "", notesBody) : ""}
${section(t("emergency.sections.medications"), medHeader, medBody)}
${section(t("emergency.sections.diagnoses"), dxHeader, dxBody)}
${section(t("emergency.sections.vaccines"), vaxHeader, vaxBody)}
<footer>${footer}</footer>
</body>
</html>`;
}

/** Generate + save the emergency card via the Tauri save dialog. Returns false if cancelled. */
export async function exportEmergencyCardHtml(
  data: EmergencyCardData,
  opts: EmergencyExportOptions,
): Promise<boolean> {
  const html = generateEmergencyHtml(data, opts);
  const stamp = (opts.now ?? new Date()).toISOString().slice(0, 10);
  const path = await save({
    defaultPath: `emergency-card-${stamp}.html`,
    filters: [{ name: "HTML", extensions: ["html"] }],
  });
  if (!path) return false;
  await writeTextFile(path, html);
  return true;
}
