import { jsPDF } from "jspdf";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import regularUrl from "@/assets/fonts/PTSans-Regular.ttf?url";
import boldUrl from "@/assets/fonts/PTSans-Bold.ttf?url";
import type { EmergencyCardData } from "@/db/repos";
import { severityClass, type EmergencyExportOptions } from "@/lib/emergency-export";

const FONT_FAMILY = "PTSans";
const PAGE_BOTTOM = 270; // mm; trigger a page break past this y-cursor
const MARGIN = 16; // mm
const LINE = 5; // mm line height for body text

// Severity → RGB (mirrors the HTML severity palette intent).
const SEVERITY_COLOR: Record<"danger" | "warn" | "muted", [number, number, number]> = {
  danger: [0xb9, 0x1c, 0x1c],
  warn: [0xb4, 0x53, 0x09],
  muted: [0x33, 0x33, 0x33],
};

const MUTED: [number, number, number] = [0x6b, 0x72, 0x80];
const INK: [number, number, number] = [0x1a, 0x1a, 0x1a];

/** ABO numeral used in Russian/European tradition: O=I, A=II, B=III, AB=IV. */
const BLOOD_NUMERAL: Record<string, string> = { O: "I", A: "II", B: "III", AB: "IV" };

// Module-level cache so repeated exports don't refetch/re-encode the fonts.
let fontCache: { regular: string; bold: string } | null = null;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function loadFontBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  return bytesToBase64(new Uint8Array(buf));
}

async function ensureFonts(): Promise<{ regular: string; bold: string }> {
  if (fontCache) return fontCache;
  const [regular, bold] = await Promise.all([loadFontBase64(regularUrl), loadFontBase64(boldUrl)]);
  fontCache = { regular, bold };
  return fontCache;
}

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

function bloodTypeLabel(data: EmergencyCardData): string {
  const { bloodType, rhFactor } = data.profile;
  if (!bloodType) return "—";
  const rh = rhFactor === "positive" ? " Rh+" : rhFactor === "negative" ? " Rh−" : "";
  const sign = rhFactor === "positive" ? "+" : rhFactor === "negative" ? "−" : "";
  return `${bloodType}${sign} (${BLOOD_NUMERAL[bloodType]}${rh})`;
}

export async function generateEmergencyPdf(
  data: EmergencyCardData,
  opts: EmergencyExportOptions,
): Promise<ArrayBuffer> {
  const { t, locale } = opts;
  const now = opts.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const p = data.profile;
  const fd = (iso: string | null | undefined) => formatDate(iso, locale);

  const fonts = await ensureFonts();
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  doc.addFileToVFS("PTSans-Regular.ttf", fonts.regular);
  doc.addFont("PTSans-Regular.ttf", FONT_FAMILY, "normal");
  doc.addFileToVFS("PTSans-Bold.ttf", fonts.bold);
  doc.addFont("PTSans-Bold.ttf", FONT_FAMILY, "bold");

  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - MARGIN * 2;
  let y = MARGIN;

  const setColor = ([r, g, b]: [number, number, number]) => doc.setTextColor(r, g, b);

  const ensureSpace = (needed: number) => {
    if (y + needed > PAGE_BOTTOM) {
      doc.addPage();
      y = MARGIN;
    }
  };

  // Wrapped body line(s) at current font; advances the y-cursor.
  const writeText = (
    text: string,
    opts2: {
      size?: number;
      style?: "normal" | "bold";
      color?: [number, number, number];
      indent?: number;
    } = {},
  ) => {
    const size = opts2.size ?? 9.5;
    const indent = opts2.indent ?? 0;
    doc.setFont(FONT_FAMILY, opts2.style ?? "normal");
    doc.setFontSize(size);
    setColor(opts2.color ?? INK);
    const lines = doc.splitTextToSize(text, contentWidth - indent) as string[];
    for (const line of lines) {
      ensureSpace(LINE);
      doc.text(line, MARGIN + indent, y);
      y += LINE;
    }
  };

  const sectionHeading = (title: string) => {
    ensureSpace(LINE + 4);
    y += 2;
    doc.setFont(FONT_FAMILY, "bold");
    doc.setFontSize(11);
    setColor(INK);
    doc.text(title, MARGIN, y);
    y += 2;
    doc.setDrawColor(0xdd, 0xdd, 0xdd);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, y, MARGIN + contentWidth, y);
    y += LINE;
  };

  // Label: value row (label muted, value ink), wraps the value.
  const fieldRow = (label: string, value: string) => {
    const labelW = 38;
    doc.setFont(FONT_FAMILY, "normal");
    doc.setFontSize(9.5);
    const lines = doc.splitTextToSize(value, contentWidth - labelW) as string[];
    ensureSpace(LINE);
    setColor(MUTED);
    doc.text(label, MARGIN, y);
    setColor(INK);
    lines.forEach((line, i) => {
      if (i > 0) {
        ensureSpace(LINE);
      }
      doc.text(line, MARGIN + labelW, y);
      y += LINE;
    });
  };

  // ── Header ─────────────────────────────────────────────────────────────────
  doc.setFont(FONT_FAMILY, "normal");
  doc.setFontSize(9);
  setColor(MUTED);
  doc.text("Soma", MARGIN, y);
  y += LINE;
  doc.setFont(FONT_FAMILY, "bold");
  doc.setFontSize(16);
  setColor(INK);
  const headerTitle = `${t("emergency.title")} — ${p.name || "—"}`;
  for (const line of doc.splitTextToSize(headerTitle, contentWidth) as string[]) {
    doc.text(line, MARGIN, y);
    y += 7;
  }
  doc.setFont(FONT_FAMILY, "normal");
  doc.setFontSize(9);
  setColor(MUTED);
  doc.text(t("emergency.footer", { date: formatDate(today, locale) }).split(".")[0], MARGIN, y);
  y += LINE + 1;

  // ── Identity ───────────────────────────────────────────────────────────────
  const age = ageFromBirthDate(p.birthDate);
  const sexLabel = p.sex
    ? t(`profile.options.${p.sex === "other" ? "otherIntersex" : p.sex}`)
    : "—";
  sectionHeading(t("emergency.sections.identity"));
  fieldRow(
    t("emergency.identity.dob"),
    p.birthDate
      ? `${fd(p.birthDate)}${age != null ? ` · ${t("emergency.identity.ageValue", { years: String(age) })}` : ""}`
      : "—",
  );
  fieldRow(t("emergency.identity.sex"), sexLabel);
  fieldRow(t("emergency.identity.bloodType"), bloodTypeLabel(data));
  if (p.citizenship) fieldRow(t("emergency.identity.citizenship"), p.citizenship);
  if (p.languages) fieldRow(t("emergency.identity.languages"), p.languages);

  // ── Emergency contact ──────────────────────────────────────────────────────
  sectionHeading(t("emergency.sections.contact"));
  if (p.emergencyContactName || p.emergencyContactPhone) {
    fieldRow(t("emergency.contact.name"), p.emergencyContactName || "—");
    fieldRow(t("emergency.contact.phone"), p.emergencyContactPhone || "—");
    fieldRow(t("emergency.contact.relation"), p.emergencyContactRelation || "—");
  } else {
    writeText(t("emergency.contact.empty"), { color: MUTED });
  }

  // ── Insurance & assistance ─────────────────────────────────────────────────
  sectionHeading(t("emergency.sections.insurance"));
  if (p.insurer || p.insurancePolicyNumber || p.insurancePhone) {
    if (p.insurer) fieldRow(t("emergency.insurance.insurer"), p.insurer);
    if (p.insurancePolicyNumber)
      fieldRow(t("emergency.insurance.policyNumber"), p.insurancePolicyNumber);
    if (p.insurancePhone) fieldRow(t("emergency.insurance.phone"), p.insurancePhone);
  } else {
    writeText(t("emergency.emptyInsurance"), { color: MUTED });
  }

  // ── Allergies ──────────────────────────────────────────────────────────────
  sectionHeading(t("emergency.sections.allergies"));
  const allAllergies = [
    ...data.activeAllergies.map((a) => ({ a, resolved: false })),
    ...data.resolvedAllergies.map((a) => ({ a, resolved: true })),
  ];
  if (allAllergies.length === 0) {
    writeText(t("emergency.allergies.none"), { color: MUTED });
  } else {
    for (const { a, resolved } of allAllergies) {
      const color = SEVERITY_COLOR[severityClass(a.severity)];
      const sev = t(`allergySeverity.${a.severity}`);
      const resolvedSuffix = resolved ? ` (${t("emergency.allergies.resolved")})` : "";
      ensureSpace(LINE);
      doc.setFont(FONT_FAMILY, "bold");
      doc.setFontSize(9.5);
      setColor(color);
      const head = `${a.allergen} — ${sev}${resolvedSuffix}`;
      const headLines = doc.splitTextToSize(head, contentWidth) as string[];
      for (const line of headLines) {
        ensureSpace(LINE);
        doc.text(line, MARGIN, y);
        y += LINE;
      }
      if (a.reaction) writeText(a.reaction, { color: MUTED, indent: 4 });
    }
  }

  // ── Important notes ────────────────────────────────────────────────────────
  if (p.emergencyNotes && p.emergencyNotes.trim()) {
    sectionHeading(t("emergency.sections.notes"));
    writeText(p.emergencyNotes.trim());
  }

  // ── Active medications ─────────────────────────────────────────────────────
  sectionHeading(t("emergency.sections.medications"));
  if (data.activeMedications.length === 0) {
    writeText(t("emergency.medications.none"), { color: MUTED });
  } else {
    for (const m of data.activeMedications) {
      const dose = m.doseAmount != null ? `${m.doseAmount}${m.doseUnit ? ` ${m.doseUnit}` : ""}` : "";
      const freq = m.schedule?.frequency ? m.schedule.frequency.replaceAll("_", " ") : "";
      const parts = [m.name, dose, freq, `${t("emergency.medications.since")} ${fd(m.startDate)}`]
        .filter(Boolean)
        .join(" · ");
      writeText(parts);
    }
  }

  // ── Active diagnoses ───────────────────────────────────────────────────────
  sectionHeading(t("emergency.sections.diagnoses"));
  if (data.activeDiagnoses.length === 0) {
    writeText(t("emergency.diagnoses.none"), { color: MUTED });
  } else {
    for (const d of data.activeDiagnoses) {
      const parts = [d.name, d.icdCode || "", fd(d.date)].filter(Boolean).join(" · ");
      writeText(parts);
    }
  }

  // ── Recent vaccines ────────────────────────────────────────────────────────
  sectionHeading(t("emergency.sections.vaccines"));
  if (data.recentVaccines.length === 0) {
    writeText(t("emergency.vaccines.none"), { color: MUTED });
  } else {
    for (const v of data.recentVaccines) {
      const expired = !!v.expiresAt && v.expiresAt.slice(0, 10) < today;
      const doseStr = v.dose != null ? t("emergency.vaccines.doseValue", { n: String(v.dose) }) : "";
      const expiresStr = v.expiresAt
        ? `${t("emergency.vaccines.expires")} ${fd(v.expiresAt)}${expired ? ` (${t("emergency.vaccines.expired")})` : ""}`
        : "";
      const parts = [v.vaccineName, fd(v.date), doseStr, expiresStr].filter(Boolean).join(" · ");
      writeText(parts);
    }
  }

  // ── Footer disclaimer on the last page ─────────────────────────────────────
  const footerText = t("emergency.footer", { date: formatDate(today, locale) });
  doc.setFont(FONT_FAMILY, "normal");
  doc.setFontSize(7.5);
  setColor(MUTED);
  const footerLines = doc.splitTextToSize(footerText, contentWidth) as string[];
  const footerHeight = footerLines.length * 4;
  let footerY = doc.internal.pageSize.getHeight() - MARGIN - footerHeight + 4;
  if (footerY < y + 6) footerY = y + 6;
  for (const line of footerLines) {
    doc.text(line, MARGIN, footerY);
    footerY += 4;
  }

  return doc.output("arraybuffer");
}

/** Generate + save the emergency card PDF via the Tauri save dialog. Returns false if cancelled. */
export async function exportEmergencyCardPdf(
  data: EmergencyCardData,
  opts: EmergencyExportOptions,
): Promise<boolean> {
  const buffer = await generateEmergencyPdf(data, opts);
  const stamp = (opts.now ?? new Date()).toISOString().slice(0, 10);
  const path = await save({
    defaultPath: `emergency-card-${stamp}.pdf`,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (!path) return false;
  await writeFile(path, new Uint8Array(buffer));
  return true;
}
