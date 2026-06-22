import { jsPDF } from "jspdf";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import regularUrl from "@/assets/fonts/PTSans-Regular.ttf?url";
import boldUrl from "@/assets/fonts/PTSans-Bold.ttf?url";
import type { DoctorReportData } from "@/db/repos";
import type { Biomarker, Profile } from "@/db/schema";
import { formatValue } from "@/lib/utils";

const FONT_FAMILY = "PTSans";
const PAGE_BOTTOM = 270; // mm; trigger a page break past this y-cursor
const MARGIN = 16; // mm
const LINE = 5; // mm line height for body text

const MUTED: [number, number, number] = [0x6b, 0x72, 0x80];
const INK: [number, number, number] = [0x1a, 0x1a, 0x1a];
const FLAG: [number, number, number] = [0xb9, 0x1c, 0x1c];

/** ABO numeral used in Russian/European tradition: O=I, A=II, B=III, AB=IV. */
const BLOOD_NUMERAL: Record<string, string> = { O: "I", A: "II", B: "III", AB: "IV" };

/** Translator signature compatible with the i18n `t` returned by useI18n(). */
type Translate = (key: string, vars?: Record<string, string>) => string;

export type DoctorReportPdfOptions = {
  t: Translate;
  /** BCP-47 locale used for date formatting (e.g. "en-GB", "ru-RU"). */
  locale: string;
  /** Date the report is generated; defaults to now. */
  now?: Date;
};

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

function bloodTypeLabel(p: Profile): string {
  const { bloodType, rhFactor } = p;
  if (!bloodType) return "—";
  const rh = rhFactor === "positive" ? " Rh+" : rhFactor === "negative" ? " Rh−" : "";
  const sign = rhFactor === "positive" ? "+" : rhFactor === "negative" ? "−" : "";
  return `${bloodType}${sign} (${BLOOD_NUMERAL[bloodType]}${rh})`;
}

/** Reference window for a biomarker, e.g. "3.5–5.1 mmol/L"; null when neither bound is set. */
function referenceRange(bio: Biomarker): string | null {
  const { refLow, refHigh, defaultUnit } = bio;
  if (refLow == null && refHigh == null) return null;
  const unit = defaultUnit ? ` ${defaultUnit}` : "";
  if (refLow != null && refHigh != null) {
    return `${formatValue(refLow)}–${formatValue(refHigh)}${unit}`;
  }
  if (refLow != null) return `≥ ${formatValue(refLow)}${unit}`;
  return `≤ ${formatValue(refHigh)}${unit}`;
}

export async function generateDoctorReportPdf(
  data: DoctorReportData,
  opts: DoctorReportPdfOptions,
): Promise<ArrayBuffer> {
  const { t, locale } = opts;
  const p = data.profile;
  const sections = data.sections;
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

  // Smaller heading for a group inside a section (e.g. "Active", "Current").
  const subHeading = (title: string) => {
    ensureSpace(LINE);
    writeText(title, { style: "bold", size: 9, color: MUTED });
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

  const none = () => writeText(t("doctorReport.pdf.none"), { color: MUTED });

  // ── Header ─────────────────────────────────────────────────────────────────
  doc.setFont(FONT_FAMILY, "normal");
  doc.setFontSize(9);
  setColor(MUTED);
  doc.text("Soma", MARGIN, y);
  y += LINE;
  doc.setFont(FONT_FAMILY, "bold");
  doc.setFontSize(16);
  setColor(INK);
  for (const line of doc.splitTextToSize(t("doctorReport.pdf.title"), contentWidth) as string[]) {
    doc.text(line, MARGIN, y);
    y += 7;
  }
  doc.setFont(FONT_FAMILY, "normal");
  doc.setFontSize(9);
  setColor(MUTED);
  doc.text(t("doctorReport.pdf.preparedFor", { name: p.name || "—" }), MARGIN, y);
  y += LINE;
  doc.text(
    t("doctorReport.pdf.generatedOn", { date: formatDate(data.generatedAt, locale) }),
    MARGIN,
    y,
  );
  y += LINE;
  const { from, to } = data.range;
  const rangeLine =
    from == null && to == null
      ? t("doctorReport.pdf.rangeAll")
      : from != null && to != null
        ? t("doctorReport.pdf.rangeFromTo", { from: fd(from), to: fd(to) })
        : from != null
          ? t("doctorReport.pdf.rangeFrom", { from: fd(from) })
          : t("doctorReport.pdf.rangeUpTo", { to: fd(to) });
  doc.text(rangeLine, MARGIN, y);
  y += LINE + 1;

  // ── Patient ─────────────────────────────────────────────────────────────────
  sectionHeading(t("doctorReport.pdf.identity.heading"));
  const age = ageFromBirthDate(p.birthDate);
  fieldRow(
    t("doctorReport.pdf.identity.dob"),
    p.birthDate
      ? `${fd(p.birthDate)}${age != null ? ` · ${t("doctorReport.pdf.identity.age", { years: String(age) })}` : ""}`
      : "—",
  );
  fieldRow(
    t("doctorReport.pdf.identity.sex"),
    p.sex ? t(`profile.options.${p.sex === "other" ? "otherIntersex" : p.sex}`) : "—",
  );
  fieldRow(t("doctorReport.pdf.identity.bloodType"), bloodTypeLabel(p));

  // ── Diagnoses ────────────────────────────────────────────────────────────────
  if (sections.diagnoses) {
    sectionHeading(t("doctorReport.pdf.diagnoses.heading"));
    const writeDiagnosis = (d: DoctorReportData["activeDiagnoses"][number]) => {
      const since = t("doctorReport.pdf.diagnoses.since", { date: fd(d.date) });
      const parts = [d.name, d.icdCode || "", since].filter(Boolean).join(" · ");
      writeText(parts);
    };
    if (data.activeDiagnoses.length === 0 && data.inactiveDiagnoses.length === 0) {
      none();
    } else {
      if (data.activeDiagnoses.length > 0) {
        subHeading(t("doctorReport.pdf.diagnoses.active"));
        for (const d of data.activeDiagnoses) writeDiagnosis(d);
      }
      if (data.inactiveDiagnoses.length > 0) {
        subHeading(t("doctorReport.pdf.diagnoses.inactive"));
        for (const d of data.inactiveDiagnoses) writeDiagnosis(d);
      }
    }
  }

  // ── Medications ──────────────────────────────────────────────────────────────
  if (sections.medications) {
    sectionHeading(t("doctorReport.pdf.medications.heading"));
    const writeMed = (m: DoctorReportData["activeMedications"][number]) => {
      const dose =
        m.doseAmount != null ? `${m.doseAmount}${m.doseUnit ? ` ${m.doseUnit}` : ""}` : "";
      const when = m.endDate
        ? t("doctorReport.pdf.medications.until", { date: fd(m.endDate) })
        : t("doctorReport.pdf.medications.since", { date: fd(m.startDate) });
      writeText([m.name, dose, when].filter(Boolean).join(" · "));
    };
    if (
      data.activeMedications.length === 0 &&
      data.asNeededMedications.length === 0 &&
      data.pastMedications.length === 0
    ) {
      none();
    } else {
      if (data.activeMedications.length > 0) {
        subHeading(t("doctorReport.pdf.medications.current"));
        for (const m of data.activeMedications) writeMed(m);
      }
      if (data.asNeededMedications.length > 0) {
        subHeading(t("doctorReport.pdf.medications.asNeeded"));
        for (const m of data.asNeededMedications) writeMed(m);
      }
      if (data.pastMedications.length > 0) {
        subHeading(t("doctorReport.pdf.medications.past"));
        for (const m of data.pastMedications) writeMed(m);
      }
    }
  }

  // ── Allergies ────────────────────────────────────────────────────────────────
  if (sections.allergies) {
    sectionHeading(t("doctorReport.pdf.allergies.heading"));
    const writeAllergy = (a: DoctorReportData["activeAllergies"][number], resolved: boolean) => {
      const sev = t(`allergySeverity.${a.severity}`);
      const resolvedSuffix = resolved ? ` (${t("doctorReport.pdf.allergies.resolved")})` : "";
      const head = `${a.allergen} — ${sev}${resolvedSuffix}`;
      writeText(head, { style: "bold", color: resolved ? MUTED : INK });
      if (a.reaction) writeText(a.reaction, { color: MUTED, indent: 4 });
    };
    if (data.activeAllergies.length === 0 && data.resolvedAllergies.length === 0) {
      none();
    } else {
      for (const a of data.activeAllergies) writeAllergy(a, false);
      for (const a of data.resolvedAllergies) writeAllergy(a, true);
    }
  }

  // ── Out-of-range markers ──────────────────────────────────────────────────────
  if (sections.labs) {
    sectionHeading(t("doctorReport.pdf.abnormal.heading"));
    if (data.abnormalLatest.length === 0) {
      none();
    } else {
      for (const a of data.abnormalLatest) {
        const flag = a.flag ? t(`doctorReport.pdf.flags.${a.flag}`) : "";
        const meta = [flag, fd(a.date)].filter(Boolean).join(", ");
        const unit = a.unit ? ` ${a.unit}` : "";
        const line = `${a.biomarker.canonicalName} ${formatValue(a.value)}${unit}${meta ? ` (${meta})` : ""}`;
        writeText(line, { color: FLAG });
      }
    }
  }

  // ── Lab results ───────────────────────────────────────────────────────────────
  if (sections.labs) {
    sectionHeading(t("doctorReport.pdf.labs.heading"));
    if (data.panels.length === 0) {
      none();
    } else {
      for (const { panel, results } of data.panels) {
        const heading = panel.labName
          ? t("doctorReport.pdf.labs.panel", { name: panel.labName, date: fd(panel.date) })
          : t("doctorReport.pdf.labs.panelNoName", { date: fd(panel.date) });
        subHeading(heading);
        if (results.length === 0) {
          none();
          continue;
        }
        for (const r of results) {
          const flag = r.flag ? t(`doctorReport.pdf.flags.${r.flag}`) : "";
          const ref = referenceRange(r.biomarker);
          const unit = r.unit ? ` ${r.unit}` : "";
          const parts = [
            r.biomarker.canonicalName,
            `${formatValue(r.value)}${unit}`,
            ref ?? "",
            flag,
          ].filter(Boolean);
          if (r.outOfRange) parts.push(t("doctorReport.pdf.labs.outOfRange"));
          writeText(parts.join(" · "), {
            indent: 4,
            style: r.outOfRange ? "bold" : "normal",
            color: r.outOfRange ? FLAG : INK,
          });
        }
      }
    }
  }

  // ── Visits ────────────────────────────────────────────────────────────────────
  if (sections.visits) {
    sectionHeading(t("doctorReport.pdf.visits.heading"));
    if (data.visits.length === 0) {
      none();
    } else {
      for (const v of data.visits) {
        const who = [v.doctorName, v.specialty].filter(Boolean).join(", ");
        writeText([fd(v.date), who, v.clinic || ""].filter(Boolean).join(" · "));
      }
    }
  }

  // ── Imaging ───────────────────────────────────────────────────────────────────
  if (sections.imaging) {
    sectionHeading(t("doctorReport.pdf.imaging.heading"));
    if (data.imaging.length === 0) {
      none();
    } else {
      for (const i of data.imaging) {
        const study = `${i.modalityType.toUpperCase()} — ${i.bodyArea}`;
        writeText([fd(i.date), study, i.clinic || ""].filter(Boolean).join(" · "));
      }
    }
  }

  // ── Vaccines ──────────────────────────────────────────────────────────────────
  if (sections.vaccines) {
    sectionHeading(t("doctorReport.pdf.vaccines.heading"));
    if (data.vaccines.length === 0) {
      none();
    } else {
      for (const v of data.vaccines) {
        const dose =
          v.dose != null ? t("doctorReport.pdf.vaccines.dose", { n: String(v.dose) }) : "";
        writeText([v.vaccineName, fd(v.date), dose].filter(Boolean).join(" · "));
      }
    }
  }

  // ── Lifestyle context ─────────────────────────────────────────────────────────
  if (sections.lifestyle && data.lifestyle.length > 0) {
    sectionHeading(t("doctorReport.pdf.lifestyle.heading"));
    const avg = (
      pick: (l: DoctorReportData["lifestyle"][number]) => number | null,
    ): number | null => {
      const vals = data.lifestyle.map(pick).filter((n): n is number => n != null);
      if (vals.length === 0) return null;
      return vals.reduce((sum, n) => sum + n, 0) / vals.length;
    };
    const trainingTotal = data.lifestyle.reduce((sum, l) => sum + (l.trainingMinutes ?? 0), 0);

    const avgSleep = avg((l) => l.sleepHours);
    const avgSleepQuality = avg((l) => l.sleepQuality);
    const avgStress = avg((l) => l.stressLevel);
    const avgEnergy = avg((l) => l.energyLevel);
    const avgRestingHr = avg((l) => l.restingHeartRate);

    writeText(t("doctorReport.pdf.lifestyle.summary", { count: String(data.lifestyle.length) }), {
      color: MUTED,
    });
    const fragments: string[] = [];
    if (avgSleep != null)
      fragments.push(t("doctorReport.pdf.lifestyle.sleep", { n: formatValue(avgSleep, 1) }));
    if (avgSleepQuality != null)
      fragments.push(
        t("doctorReport.pdf.lifestyle.sleepQuality", { n: formatValue(avgSleepQuality, 1) }),
      );
    if (trainingTotal > 0)
      fragments.push(t("doctorReport.pdf.lifestyle.training", { n: String(trainingTotal) }));
    if (avgStress != null)
      fragments.push(t("doctorReport.pdf.lifestyle.stress", { n: formatValue(avgStress, 1) }));
    if (avgEnergy != null)
      fragments.push(t("doctorReport.pdf.lifestyle.energy", { n: formatValue(avgEnergy, 1) }));
    if (avgRestingHr != null)
      fragments.push(
        t("doctorReport.pdf.lifestyle.restingHr", { n: formatValue(avgRestingHr, 0) }),
      );
    if (fragments.length > 0) writeText(fragments.join(" · "));
  }

  // ── Footer disclaimer on the last page ─────────────────────────────────────────
  const footerText = t("doctorReport.pdf.disclaimer");
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

/** Generate + save the doctor report PDF via the Tauri save dialog. Returns false if cancelled. */
export async function exportDoctorReportPdf(
  data: DoctorReportData,
  opts: DoctorReportPdfOptions,
): Promise<boolean> {
  const buffer = await generateDoctorReportPdf(data, opts);
  const stamp = (opts.now ?? new Date()).toISOString().slice(0, 10);
  const path = await save({
    defaultPath: `soma-doctor-report-${stamp}.pdf`,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (!path) return false;
  await writeFile(path, new Uint8Array(buffer));
  return true;
}
