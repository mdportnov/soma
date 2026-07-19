/**
 * Dev-only: build a fully-populated local soma.db so the UI has something to
 * chew on — lots of lab panels (AI + manual), some with uncertain mappings that
 * land in the "needs review" queue, real source PDFs (multi-page, so the
 * page deep-link works), vaccines/visits with attached documents, plus meds,
 * diagnoses, allergies, weight and BP logs.
 *
 * Run:  pnpm tsx scripts/seed-fake-data.ts
 * Reuses the app's real biomarker seed so ids/aliases match production.
 */
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { jsPDF } from "jspdf";
import { seedBiomarkersIfEmpty, seedReferenceRangesIfEmpty } from "../src/db/seed-biomarkers.ts";

const APP_DIR =
  process.env.SOMA_APP_DIR ?? join(homedir(), "Library/Application Support/com.soma.health");
const ATTACH_DIR = join(APP_DIR, "attachments");
const DB_PATH = join(APP_DIR, "soma.db");
const MIG_DIR = join(process.cwd(), "src/db/migrations");

// ── tiny adapter so the real seed functions (written for tauri-plugin-sql) run
// against node:sqlite. Converts $N placeholders to positional `?`.
function toPositional(sql: string): string {
  return sql.replace(/\$\d+/g, "?");
}
class Conn {
  constructor(private db: DatabaseSync) {}
  async execute(sql: string, params: unknown[] = []) {
    this.db.prepare(toPositional(sql)).run(...(params as never[]));
    return { rowsAffected: 0 };
  }
  async select<T>(sql: string, params: unknown[] = []): Promise<T> {
    return this.db.prepare(toPositional(sql)).all(...(params as never[])) as T;
  }
}

const nowISO = () => new Date().toISOString();
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const round = (v: number, p = 1) => Math.round(v * 10 ** p) / 10 ** p;
const pickOne = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];

function flagFor(v: number, lo: number | null, hi: number | null) {
  if (lo != null && v < lo) return { outOfRange: 1, flag: v < lo * 0.8 ? "critical" : "low" };
  if (hi != null && v > hi) return { outOfRange: 1, flag: v > hi * 1.2 ? "critical" : "high" };
  return { outOfRange: 0, flag: null as string | null };
}

/** A multi-page lab-report PDF written to the attachments dir; returns its path. */
function makeReportPdf(name: string, lab: string, date: string, lines: string[]): string {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const perPage = 18;
  const pages = Math.max(1, Math.ceil(lines.length / perPage));
  for (let p = 0; p < pages; p++) {
    if (p > 0) doc.addPage();
    doc.setFontSize(16);
    doc.text(`${lab}`, 40, 50);
    doc.setFontSize(10);
    doc.text(`Collection date: ${date}    Page ${p + 1}/${pages}`, 40, 70);
    doc.setFontSize(11);
    let y = 100;
    for (const line of lines.slice(p * perPage, (p + 1) * perPage)) {
      doc.text(line, 40, y);
      y += 20;
    }
  }
  const path = join(ATTACH_DIR, `${Date.now()}-${name}`);
  writeFileSync(path, Buffer.from(doc.output("arraybuffer")));
  return path;
}

async function main() {
  mkdirSync(ATTACH_DIR, { recursive: true });
  // Fresh start.
  for (const f of ["soma.db", "soma.db-wal", "soma.db-shm"])
    rmSync(join(APP_DIR, f), { force: true });

  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA foreign_keys = OFF");
  const conn = new Conn(db);

  // 1. Schema from the single consolidated migration.
  const migFile = readdirSync(MIG_DIR).find((f) => f.endsWith(".sql"))!;
  const migSql = readFileSync(join(MIG_DIR, migFile), "utf8").replace(
    /-->\s*statement-breakpoint/g,
    "\n",
  );
  db.exec(migSql);
  db.exec(
    `CREATE TABLE IF NOT EXISTS __migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))`,
  );
  db.prepare("INSERT INTO __migrations (name) VALUES (?)").run(migFile);

  // 2. Reference dictionary (real production data).
  await seedBiomarkersIfEmpty(conn as never);
  await seedReferenceRangesIfEmpty(conn as never);

  // 3. Profile (already onboarded so we land straight in the app).
  db.prepare(
    `INSERT INTO profile (name, birth_date, sex, height_cm, weight_kg, target_weight_kg, blood_type, rh_factor, unit_system, citizenship, onboarded_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'metric', ?, ?, ?)`,
  ).run(
    "Mike Portnov",
    "1992-04-15",
    "male",
    182,
    78,
    74,
    "O",
    "positive",
    "Russia",
    nowISO(),
    nowISO(),
  );
  const profileId = Number(
    (db.prepare("SELECT id FROM profile LIMIT 1").get() as { id: number }).id,
  );

  type Bio = {
    id: number;
    canonical_name: string;
    default_unit: string;
    ref_low: number | null;
    ref_high: number | null;
  };
  const bios = db
    .prepare("SELECT id, canonical_name, default_unit, ref_low, ref_high FROM biomarker")
    .all() as Bio[];
  const withRange = bios.filter((b) => b.ref_low != null || b.ref_high != null);
  // A stable core set repeated across panels so trends/deltas render.
  const core = withRange.slice(0, 12);

  // ── 4. Lab panels ────────────────────────────────────────────────────────
  const labs = ["Invitro", "Helix", "KDL", "Gemotest", "LabCorp"];
  const cities: [string, string][] = [
    ["Moscow", "Russia"],
    ["Tbilisi", "Georgia"],
    ["Lisbon", "Portugal"],
    ["Bangkok", "Thailand"],
  ];
  const confidences = ["translated", "fuzzy", "ai"] as const;

  // 7 draws over ~20 months, newest first handled by date.
  const drawDays = [600, 500, 410, 300, 200, 95, 12];
  let panelCount = 0;
  let resultCount = 0;
  let reviewQueue = 0;

  drawDays.forEach((dago, i) => {
    const date = daysAgo(dago);
    const lab = labs[i % labs.length];
    const [city, country] = cities[i % cities.length];
    const isAi = i % 3 !== 0; // ~2/3 AI-imported
    // Two of the AI panels are deliberately "uncertain" → land in review queue.
    const uncertain = isAi && (i === 2 || i === 5);

    // Build the row set: core (for trends) + a rotating extra slice.
    const extra = withRange.slice(12 + i * 4, 12 + i * 4 + 6);
    const chosen = [...core, ...extra];

    const reportLines: string[] = [];
    const rows = chosen.map((b, idx) => {
      const lo = b.ref_low,
        hi = b.ref_high;
      const mid = lo != null && hi != null ? (lo + hi) / 2 : 50;
      const span = lo != null && hi != null ? hi - lo : 20;
      // Drift per draw + occasional excursion out of range.
      const drift = (i - 3) * 0.06 * span;
      const excursion = Math.random() < 0.18 ? span * (Math.random() < 0.5 ? -0.9 : 0.9) : 0;
      const value = round(Math.max(0, mid + drift + excursion + rand(-span * 0.1, span * 0.1)), 2);
      const { outOfRange, flag } = flagFor(value, lo, hi);
      reportLines.push(
        `${b.canonical_name}: ${value} ${b.default_unit}  (ref ${lo ?? "–"}–${hi ?? "–"})`,
      );

      // Provenance: manual panels are trusted; AI panels mix exact + uncertain.
      let confidence: string;
      let reviewedAt: string | null;
      if (!isAi) {
        confidence = "manual";
        reviewedAt = nowISO();
      } else if (uncertain && idx % 3 === 0) {
        confidence = pickOne(confidences as unknown as string[]);
        reviewedAt = null; // ← needs review
        reviewQueue++;
      } else {
        confidence = "exact";
        reviewedAt = nowISO();
      }
      return {
        biomarkerId: b.id,
        value,
        unit: b.default_unit,
        valueNormalized: value,
        unitNormalized: b.default_unit,
        outOfRange,
        flag,
        rawLabel: b.canonical_name,
        sourcePage: isAi ? 1 + Math.floor(idx / 18) : null,
        confidence,
        reviewedAt,
      };
    });

    // Source PDF for AI panels.
    let sourceFileId: number | null = null;
    if (isAi) {
      const pdfPath = makeReportPdf(`lab-${date}.pdf`, `${lab} — ${city}`, date, reportLines);
      db.prepare(
        `INSERT INTO attachment (profile_id, file_path, mime_type, kind, linked_entity_type) VALUES (?, ?, 'application/pdf', 'lab_pdf', 'lab_panel')`,
      ).run(profileId, pdfPath);
      sourceFileId = Number(
        (db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number }).id,
      );
    }

    db.prepare(
      `INSERT INTO lab_panel (profile_id, date, lab_name, city, country, sample_types, cost, fasting, source_file_id, import_method, created_at)
       VALUES (?, ?, ?, ?, ?, '["blood"]', ?, 1, ?, ?, ?)`,
    ).run(
      profileId,
      date,
      lab,
      city,
      country,
      Math.round(rand(40, 320)),
      sourceFileId,
      isAi ? "ai" : "manual",
      nowISO(),
    );
    const panelId = Number(
      (db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number }).id,
    );
    panelCount++;

    if (sourceFileId != null) {
      db.prepare("UPDATE attachment SET linked_entity_id = ? WHERE id = ?").run(
        panelId,
        sourceFileId,
      );
    }

    const ins = db.prepare(
      `INSERT INTO lab_result (panel_id, biomarker_id, value, unit, unit_normalized, value_normalized, out_of_range, flag, raw_label, source_page, confidence, reviewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const r of rows) {
      ins.run(
        panelId,
        r.biomarkerId,
        r.value,
        r.unit,
        r.unitNormalized,
        r.valueNormalized,
        r.outOfRange,
        r.flag,
        r.rawLabel,
        r.sourcePage,
        r.confidence,
        r.reviewedAt,
      );
      resultCount++;
    }
  });

  // ── 5. Vaccines (two share a certificate PDF) ──────────────────────────────
  const certLines = [
    "COVID-19 (Comirnaty) — 2021-06-10",
    "Influenza — 2023-10-02",
    "Hepatitis B — 2019-03-15",
  ];
  const certPath = makeReportPdf(
    "vaccination-certificate.pdf",
    "International Vaccination Certificate",
    "—",
    certLines,
  );
  db.prepare(
    `INSERT INTO attachment (profile_id, file_path, mime_type, kind, linked_entity_type) VALUES (?, ?, 'application/pdf', 'vaccination_cert', 'vaccine')`,
  ).run(profileId, certPath);
  const certId = Number(
    (db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number }).id,
  );
  const vaccines: [string, string, string | null, number | null, number | null][] = [
    ["COVID-19 (Comirnaty)", "2021-06-10", "Pfizer-BioNTech", 2, certId],
    ["Influenza", "2023-10-02", "Sanofi", 1, certId],
    ["Hepatitis B", "2019-03-15", "GSK", 3, null],
    ["Tick-borne encephalitis", "2022-04-20", "FSME-IMMUN", 1, null],
  ];
  for (const [vn, d, mfr, dose, att] of vaccines) {
    db.prepare(
      `INSERT INTO vaccine (profile_id, vaccine_name, date, manufacturer, dose, attachment_id) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(profileId, vn, d, mfr, dose, att);
  }

  // ── 6. Visits (one with an attached discharge summary) ─────────────────────
  const dischargePath = makeReportPdf(
    "discharge-summary.pdf",
    "City Clinical Hospital — Discharge Summary",
    daysAgo(200),
    ["Dx: Acute bronchitis (J20.9)", "Rx: Amoxicillin 500mg", "Follow-up in 2 weeks"],
  );
  db.prepare(
    `INSERT INTO attachment (profile_id, file_path, mime_type, kind, linked_entity_type) VALUES (?, ?, 'application/pdf', 'discharge', 'visit')`,
  ).run(profileId, dischargePath);
  const dischargeId = Number(
    (db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number }).id,
  );
  const visits: [string, string, string, string, string | null, number | null][] = [
    [
      daysAgo(200),
      "Dr. Ivanova",
      "City Clinical Hospital",
      "Pulmonology",
      "Acute bronchitis, recovered",
      dischargeId,
    ],
    [daysAgo(120), "Dr. Lee", "Bumrungrad", "Dermatology", "Isotretinoin follow-up", null],
    [daysAgo(40), "Dr. Costa", "Hospital da Luz", "General", "Annual check-up — all good", null],
  ];
  let firstVisitId: number | null = null;
  visits.forEach(([d, doc2, clinic, spec, notes, att], idx) => {
    db.prepare(
      `INSERT INTO visit (profile_id, date, doctor_name, clinic, specialty, notes) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(profileId, d, doc2, clinic, spec, notes);
    const vid = Number((db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number }).id);
    if (idx === 0) firstVisitId = vid;
    if (att != null)
      db.prepare("UPDATE attachment SET linked_entity_id = ? WHERE id = ?").run(vid, att);
  });

  // ── 7. Medications, diagnoses, allergies ───────────────────────────────────
  const meds: [string, string, number | null, string | null, string, string | null][] = [
    ["Isotretinoin", "drug", 20, "mg", daysAgo(140), null],
    ["Vitamin D3", "supplement", 5000, "IU", daysAgo(300), null],
    ["Omega-3", "supplement", 1000, "mg", daysAgo(220), null],
    ["Magnesium glycinate", "supplement", 400, "mg", daysAgo(90), null],
  ];
  for (const [n, ty, amt, u, sd, ed] of meds) {
    db.prepare(
      `INSERT INTO medication (profile_id, name, type, dose_amount, dose_unit, as_needed, start_date, end_date) VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    ).run(profileId, n, ty, amt, u, sd, ed);
  }
  const diags: [string, string | null, string, string, number | null][] = [
    ["Acute bronchitis", "J20.9", daysAgo(200), "resolved", firstVisitId],
    ["Acne vulgaris", "L70.0", daysAgo(160), "active", null],
    ["Vitamin D deficiency", "E55.9", daysAgo(300), "remission", null],
  ];
  for (const [n, icd, d, st, vid] of diags) {
    db.prepare(
      `INSERT INTO diagnosis (profile_id, name, icd_code, date, status, visit_id) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(profileId, n, icd, d, st, vid);
  }
  const allergies: [string, string, string, string | null, string][] = [
    ["Penicillin", "drug", "severe", "Rash, hives", "active"],
    ["Peanuts", "food", "anaphylactic", "Throat swelling", "active"],
    ["Pollen (birch)", "environmental", "mild", "Rhinitis", "active"],
  ];
  for (const [a, cat, sev, rx, st] of allergies) {
    db.prepare(
      `INSERT INTO allergy (profile_id, allergen, category, severity, reaction, status) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(profileId, a, cat, sev, rx, st);
  }

  // ── 8. Weight + BP logs (charts) ───────────────────────────────────────────
  for (let d = 360; d >= 0; d -= 7) {
    const w = round(82 - ((360 - d) / 360) * 8 + rand(-0.6, 0.6), 1);
    db.prepare(`INSERT INTO weight_log (profile_id, date, weight_kg) VALUES (?, ?, ?)`).run(
      profileId,
      daysAgo(d),
      w,
    );
  }
  for (let d = 180; d >= 0; d -= 10) {
    const sys = Math.round(rand(115, 132));
    const dia = Math.round(rand(72, 85));
    const hr = Math.round(rand(58, 74));
    db.prepare(
      `INSERT INTO bp_log (profile_id, date, time, systolic, diastolic, heart_rate_bpm, position) VALUES (?, ?, '08:30', ?, ?, ?, 'sitting')`,
    ).run(profileId, daysAgo(d), sys, dia, hr);
  }

  db.close();
  console.log("✓ Seeded soma.db");
  console.log(`  profile: ${profileId} (Mike Portnov)`);
  console.log(`  biomarkers: ${bios.length}`);
  console.log(`  lab panels: ${panelCount}  results: ${resultCount}  needs-review: ${reviewQueue}`);
  console.log(`  vaccines: ${vaccines.length}  visits: ${visits.length}  meds: ${meds.length}`);
  console.log(`  + diagnoses, allergies, weight & BP logs, ${4} source PDFs`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
