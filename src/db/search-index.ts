/**
 * Pure core of global search (⌘K): what gets indexed, how a typed query becomes
 * an FTS5 MATCH expression, and how matches are ordered.
 *
 * Everything here is a plain function over plain data — no DB handle, no clock,
 * no Tauri — so `search-index.test.ts` can exercise the whole shape of the index
 * without a SQLite file. `src/db/search.ts` is the thin layer that reads the
 * source tables, hands the rows to `buildIndexRows`, and writes them into the
 * `fts_records` virtual table.
 *
 * ── Chat history ───────────────────────────────────────────────────────────
 * Assistant threads are indexed as one row per thread: the title plus the
 * user's own questions form the blob (assistant answers are left out — they
 * paraphrase records that are already indexed on their own and would make
 * every chat match every marker name). Archived threads stay searchable: the
 * palette is precisely how an archived conversation is found again.
 */

import { deriveThreadTitle, messagePreview } from "./chat-threads";

/** Every kind of record the palette can surface. Order drives result grouping. */
export const ENTITY_TYPES = [
  "biomarker",
  "lab_panel",
  "lab_result",
  "lab_finding",
  "visit",
  "diagnosis",
  "medication",
  "prescription",
  "allergy",
  "vaccine",
  "symptom",
  "imaging",
  "health_note",
  "weight_log",
  "bp_log",
  "lifestyle_log",
  "retest",
  "attachment",
  "chat_thread",
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

export type SearchResult = {
  entityType: EntityType;
  entityId: number;
  title: string;
  subtitle: string;
  date: string | null;
  /** Destination path, precomputed at index time (see `recordRoute`). */
  route: string;
};

export type IndexRow = SearchResult & {
  /** The tokenized blob — the only FTS5-indexed column. */
  content: string;
};

/** Query parameter carrying "scroll to and flash this record" to a list page. */
export const HIGHLIGHT_PARAM = "highlight";

/**
 * Longest single field admitted into the content blob, and the cap on the whole
 * blob. A pasted discharge summary in `health_note.originalText` can run to tens
 * of kilobytes; past the first couple of thousand characters it stops being a
 * findable title and starts being ballast that slows every rebuild and dilutes
 * bm25 for every other row.
 */
const MAX_FIELD_CHARS = 1200;
const MAX_CONTENT_CHARS = 4000;

/** Joins non-empty parts into the searchable `content` blob, bounded in size. */
export function blob(...parts: (string | number | null | undefined)[]): string {
  const joined = parts
    .map((p) => (p === null || p === undefined ? "" : String(p).trim()))
    .filter(Boolean)
    .map((p) => (p.length > MAX_FIELD_CHARS ? p.slice(0, MAX_FIELD_CHARS) : p))
    .join(" ");
  return joined.length > MAX_CONTENT_CHARS ? joined.slice(0, MAX_CONTENT_CHARS) : joined;
}

// ── routing ────────────────────────────────────────────────────────────────

/**
 * Where a record opens. Types with a real detail page go straight to it; the
 * rest land on their list page with `?highlight=<id>`, which the page consumes
 * to scroll the row into view and flash it (see `useHighlight`).
 *
 * `parentId` is the owning record for nested rows — the panel of a lab result,
 * the visit of a prescription, the linked entity of an attachment. When it is
 * missing (a prescription with no visit, an orphan attachment) the route falls
 * back to the section list, which is always reachable.
 */
export function recordRoute(
  entityType: EntityType,
  entityId: number,
  parentId?: number | null,
  parentType?: string | null,
): string {
  const flag = (path: string) => `${path}?${HIGHLIGHT_PARAM}=${entityId}`;
  switch (entityType) {
    case "biomarker":
      return `/biomarkers/${entityId}`;
    case "lab_panel":
      return `/labs/${entityId}`;
    // A result/finding is a row inside a panel — open the panel and flag the row.
    case "lab_result":
    case "lab_finding":
      return parentId ? `/labs/${parentId}?${HIGHLIGHT_PARAM}=${entityId}` : "/labs";
    case "visit":
      return `/visits/${entityId}`;
    case "diagnosis":
      return `/diagnoses/${entityId}`;
    case "medication":
      return `/medications/${entityId}`;
    case "prescription":
      return parentId ? `/visits/${parentId}` : "/medications";
    case "allergy":
      return flag("/allergies");
    case "vaccine":
      return flag("/vaccines");
    case "symptom":
      return "/journal?tab=symptoms";
    case "imaging":
      return `/imaging/${entityId}`;
    case "health_note":
      return flag("/notes");
    case "weight_log":
      return `/journal?tab=weight&${HIGHLIGHT_PARAM}=${entityId}`;
    case "bp_log":
      return `/journal?tab=bp&${HIGHLIGHT_PARAM}=${entityId}`;
    case "lifestyle_log":
      return flag("/lifestyle");
    case "retest":
      return "/notifications";
    case "attachment":
      return attachmentRoute(parentType, parentId);
    case "chat_thread":
      return `/assistant?thread=${entityId}`;
    default:
      return "/";
  }
}

/** An attachment opens whatever it documents; unlinked files fall back to labs. */
function attachmentRoute(
  linkedType: string | null | undefined,
  linkedId: number | null | undefined,
) {
  if (!linkedType || !linkedId) return "/labs";
  switch (linkedType) {
    case "lab_panel":
      return `/labs/${linkedId}`;
    case "visit":
      return `/visits/${linkedId}`;
    case "medication":
      return `/medications/${linkedId}`;
    case "diagnosis":
      return `/diagnoses/${linkedId}`;
    case "imaging_record":
    case "imaging":
      return `/imaging/${linkedId}`;
    case "vaccine":
      return `/vaccines?${HIGHLIGHT_PARAM}=${linkedId}`;
    default:
      return "/labs";
  }
}

// ── index construction ─────────────────────────────────────────────────────

/**
 * The source rows the index is built from — a structural subset of the drizzle
 * tables, listing exactly the columns that carry findable text. Keeping it a
 * plain shape (rather than `typeof table.$inferSelect`) is what makes the
 * builder testable with hand-written fixtures.
 */
export type IndexSources = {
  biomarkers: {
    id: number;
    canonicalName: string;
    category: string;
    code: string | null;
    aliases: string[] | null;
  }[];
  panels: {
    id: number;
    date: string;
    labName: string | null;
    city: string | null;
    country: string | null;
    notes: string | null;
  }[];
  labResults: {
    id: number;
    panelId: number;
    panelDate: string | null;
    biomarkerName: string | null;
    aliases: string[] | null;
    value: number;
    unit: string;
    rawLabel: string | null;
  }[];
  labFindings: {
    id: number;
    panelId: number;
    panelDate: string | null;
    rawLabel: string;
    nameEn: string | null;
    valueText: string;
    unit: string | null;
    refRangeText: string | null;
  }[];
  visits: {
    id: number;
    date: string;
    doctorName: string | null;
    clinic: string | null;
    city: string | null;
    country: string | null;
    specialty: string | null;
    notes: string | null;
  }[];
  diagnoses: {
    id: number;
    date: string;
    name: string;
    icdCode: string | null;
    status: string | null;
    notes: string | null;
  }[];
  medications: {
    id: number;
    name: string;
    purpose: string | null;
    type: string | null;
    doseUnit: string | null;
    scheduleNotes: string | null;
    startDate: string;
  }[];
  prescriptions: {
    id: number;
    visitId: number | null;
    visitDate: string | null;
    drugName: string | null;
    doseUnit: string | null;
    frequency: string | null;
    notes: string | null;
  }[];
  allergies: {
    id: number;
    allergen: string;
    reaction: string | null;
    category: string | null;
    severity: string | null;
    notes: string | null;
    onsetDate: string | null;
  }[];
  vaccines: {
    id: number;
    vaccineName: string;
    manufacturer: string | null;
    batchNumber: string | null;
    administeredBy: string | null;
    country: string | null;
    notes: string | null;
    date: string;
  }[];
  symptoms: { id: number; symptomName: string; notes: string | null; date: string }[];
  imaging: {
    id: number;
    modalityType: string;
    bodyArea: string;
    findings: string | null;
    radiologistName: string | null;
    clinic: string | null;
    city: string | null;
    country: string | null;
    date: string;
  }[];
  notes: {
    id: number;
    title: string | null;
    summary: string | null;
    originalText: string;
    category: string;
    tags: string[] | null;
    date: string | null;
  }[];
  weightLogs: { id: number; date: string; weightKg: number; notes: string | null }[];
  bpLogs: {
    id: number;
    date: string;
    systolic: number;
    diastolic: number;
    notes: string | null;
  }[];
  lifestyleLogs: { id: number; date: string; notes: string | null }[];
  retests: {
    id: number;
    label: string;
    notes: string | null;
    lastTestedDate: string | null;
  }[];
  attachments: {
    id: number;
    filePath: string;
    kind: string;
    linkedEntityType: string | null;
    linkedEntityId: number | null;
  }[];
  chatThreads: {
    id: number;
    title: string | null;
    /** The user's messages in chronological order. */
    userMessages: string[];
    updatedAt: string;
  }[];
};

/** Last path segment of a stored file path, on either separator. */
export function fileName(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] || filePath;
}

/**
 * Builds one index row per findable record.
 *
 * Two rules shape what is in here:
 *  • Free-text logs (weight / blood pressure / lifestyle) are indexed ONLY when
 *    they carry a note. A bare "82.4 kg on 2026-03-01" row has no words to
 *    match, so indexing thousands of them would only dilute bm25 and slow the
 *    rebuild; a row the user actually wrote something on ("after the trip") is
 *    exactly what search is for.
 *  • Symptoms collapse to one row per distinct name, carrying the notes from
 *    every log under that name, because the journal has no per-symptom page —
 *    fifty "headache" rows would be fifty identical results.
 */
export function buildIndexRows(sources: IndexSources): IndexRow[] {
  const rows: IndexRow[] = [];
  const push = (
    entityType: EntityType,
    entityId: number,
    title: string,
    subtitle: string,
    date: string | null,
    content: string,
    parentId?: number | null,
    parentType?: string | null,
  ) => {
    if (!content.trim()) return;
    rows.push({
      entityType,
      entityId,
      title: title.trim() || content.slice(0, 60),
      subtitle: subtitle.trim(),
      date,
      route: recordRoute(entityType, entityId, parentId, parentType),
      content,
    });
  };

  // Biomarkers are a shared dictionary (no profile_id); index them all — they
  // are the entry point to every trend chart.
  for (const b of sources.biomarkers) {
    push(
      "biomarker",
      b.id,
      b.canonicalName,
      b.category,
      null,
      blob(b.canonicalName, b.category, b.code, ...(b.aliases ?? [])),
    );
  }

  for (const p of sources.panels) {
    push(
      "lab_panel",
      p.id,
      p.labName ?? "Lab panel",
      blob(p.city, p.country),
      p.date,
      blob(p.labName, p.city, p.country, p.notes),
    );
  }

  // The most valuable addition: a user typing "ferritin" wants their own values,
  // not only the dictionary entry. Aliases are folded in so the RU label of a
  // biomarker finds the EN-stored result and vice versa.
  for (const r of sources.labResults) {
    const name = r.biomarkerName ?? r.rawLabel ?? "";
    push(
      "lab_result",
      r.id,
      name,
      `${r.value} ${r.unit}`.trim(),
      r.panelDate,
      blob(name, r.rawLabel, r.unit, ...(r.aliases ?? [])),
      r.panelId,
    );
  }

  // Findings are the analytes the dictionary does not know ("HBsAg — negative"),
  // so they are unreachable by any other search path.
  for (const f of sources.labFindings) {
    push(
      "lab_finding",
      f.id,
      f.nameEn ?? f.rawLabel,
      blob(f.valueText, f.unit),
      f.panelDate,
      blob(f.rawLabel, f.nameEn, f.valueText, f.unit, f.refRangeText),
      f.panelId,
    );
  }

  for (const v of sources.visits) {
    push(
      "visit",
      v.id,
      v.doctorName ?? v.clinic ?? v.specialty ?? "Visit",
      blob(v.specialty, v.clinic, v.city, v.country),
      v.date,
      blob(v.doctorName, v.clinic, v.city, v.country, v.specialty, v.notes),
    );
  }

  for (const d of sources.diagnoses) {
    push(
      "diagnosis",
      d.id,
      d.name,
      d.icdCode ?? "",
      d.date,
      blob(d.name, d.icdCode, d.status, d.notes),
    );
  }

  for (const m of sources.medications) {
    push(
      "medication",
      m.id,
      m.name,
      m.purpose ?? "",
      m.startDate,
      blob(m.name, m.purpose, m.type, m.doseUnit, m.scheduleNotes),
    );
  }

  // Prescriptions outlive the visit that produced them and are not the same row
  // as a medication (a script may never have been started), so they get their
  // own entry rather than being folded into medications.
  for (const p of sources.prescriptions) {
    push(
      "prescription",
      p.id,
      p.drugName ?? "",
      blob(p.doseUnit, p.frequency),
      p.visitDate,
      blob(p.drugName, p.doseUnit, p.frequency, p.notes),
      p.visitId,
    );
  }

  for (const a of sources.allergies) {
    push(
      "allergy",
      a.id,
      a.allergen,
      a.reaction ?? "",
      a.onsetDate ?? null,
      blob(a.allergen, a.reaction, a.category, a.severity, a.notes),
    );
  }

  for (const v of sources.vaccines) {
    push(
      "vaccine",
      v.id,
      v.vaccineName,
      v.manufacturer ?? "",
      v.date,
      blob(v.vaccineName, v.manufacturer, v.batchNumber, v.administeredBy, v.country, v.notes),
    );
  }

  // One row per distinct symptom name; the representative id is the most recent
  // log so the date column shows when it last happened.
  const bySymptom = new Map<string, { id: number; name: string; date: string; notes: string[] }>();
  for (const s of sources.symptoms) {
    const key = s.symptomName.trim().toLowerCase();
    if (!key) continue;
    const seen = bySymptom.get(key);
    if (!seen) {
      bySymptom.set(key, {
        id: s.id,
        name: s.symptomName,
        date: s.date,
        notes: s.notes ? [s.notes] : [],
      });
      continue;
    }
    if (s.date > seen.date) {
      seen.id = s.id;
      seen.date = s.date;
    }
    if (s.notes) seen.notes.push(s.notes);
  }
  for (const s of bySymptom.values()) {
    push("symptom", s.id, s.name, "", s.date, blob(s.name, ...s.notes));
  }

  for (const im of sources.imaging) {
    push(
      "imaging",
      im.id,
      blob(im.modalityType, im.bodyArea) || "Imaging",
      im.findings ?? "",
      im.date,
      blob(
        im.modalityType,
        im.bodyArea,
        im.findings,
        im.radiologistName,
        im.clinic,
        im.city,
        im.country,
      ),
    );
  }

  for (const n of sources.notes) {
    push(
      "health_note",
      n.id,
      n.title ?? n.summary ?? "Health note",
      n.category,
      n.date,
      blob(n.title, n.summary, n.originalText, n.category, ...(n.tags ?? [])),
    );
  }

  for (const w of sources.weightLogs) {
    if (!w.notes?.trim()) continue;
    push("weight_log", w.id, `${w.weightKg} kg`, w.notes, w.date, blob(w.notes));
  }

  for (const b of sources.bpLogs) {
    if (!b.notes?.trim()) continue;
    push("bp_log", b.id, `${b.systolic}/${b.diastolic}`, b.notes, b.date, blob(b.notes));
  }

  for (const l of sources.lifestyleLogs) {
    if (!l.notes?.trim()) continue;
    push("lifestyle_log", l.id, l.notes, "", l.date, blob(l.notes));
  }

  for (const r of sources.retests) {
    push("retest", r.id, r.label, "", r.lastTestedDate ?? null, blob(r.label, r.notes));
  }

  // Only the file name is indexed: the rest of a stored path is an app-internal
  // directory that nobody searches for and that would match every attachment.
  for (const a of sources.attachments) {
    const name = fileName(a.filePath);
    push(
      "attachment",
      a.id,
      name,
      a.kind,
      null,
      blob(name, a.kind),
      a.linkedEntityId,
      a.linkedEntityType,
    );
  }

  // A thread with no user message yet has nothing findable and is skipped;
  // the title falls back to the same derivation the thread list uses.
  for (const c of sources.chatThreads) {
    const first = c.userMessages[0];
    const title = c.title ?? (first ? deriveThreadTitle(first) : null);
    if (!title) continue;
    const lastMessage = c.userMessages[c.userMessages.length - 1];
    push(
      "chat_thread",
      c.id,
      title,
      lastMessage && lastMessage !== first ? messagePreview(lastMessage) : "",
      c.updatedAt.slice(0, 10),
      blob(title, ...c.userMessages),
    );
  }

  return rows;
}

// ── query parsing ──────────────────────────────────────────────────────────

/** True when the token has at least one letter or digit in any script. */
function hasWordChar(token: string): boolean {
  return /[\p{L}\p{N}]/u.test(token);
}

/**
 * Builds a safe FTS5 MATCH expression with prefix matching on the last token.
 *
 * Every token is wrapped in double quotes (inner quotes doubled) so punctuation
 * can never break the FTS5 grammar, and tokens with no letter or digit at all
 * are dropped: `"-"` quotes to a phrase the unicode61 tokenizer reduces to zero
 * terms, which FTS5 rejects as a syntax error rather than treating as empty.
 *
 * Cyrillic needs nothing special — unicode61 is Unicode-aware and case-folds
 * Cyrillic the same way it folds Latin, so "Ферритин" and "ферритин" are one
 * term. What it does NOT give is typo tolerance; that is the fuzzy fallback's
 * job (see `searchRecords` in search.ts).
 */
export function toMatchQuery(query: string): string {
  const tokens = query
    .trim()
    .split(/\s+/)
    .filter(hasWordChar)
    .map((tok) => `"${tok.replace(/"/g, '""')}"`);
  if (tokens.length === 0) return "";
  // Prefix-match the final token: "stop"* → matches "stop", "stopwatch", …
  tokens[tokens.length - 1] = `${tokens[tokens.length - 1]}*`;
  return tokens.join(" ");
}

// ── ranking ────────────────────────────────────────────────────────────────

export type ScoredRow = SearchResult & {
  /** Raw `bm25()` output: negative, and more negative means a better match. */
  bm25: number;
};

/** Lowercase + collapse whitespace, for title comparison only. */
function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * How much a title match is worth on top of bm25. bm25 scores the whole content
 * blob, where a long note with a lucky word beats a record actually *named*
 * what was typed — so an exact or leading title match is boosted explicitly.
 */
function titleBonus(title: string, query: string): number {
  const t = norm(title);
  const q = norm(query);
  if (!q) return 0;
  if (t === q) return 12;
  if (t.startsWith(q)) return 6;
  if (t.includes(q)) return 2;
  return 0;
}

/**
 * Recency nudge. Health records age: last month's panel is far more likely to be
 * what you meant than the same panel from four years ago. Deliberately coarse —
 * a few buckets, worth less than a title match, so it re-orders ties instead of
 * overriding relevance. Undated rows (the biomarker dictionary) sit mid-scale so
 * they neither sink below stale records nor outrank fresh ones.
 */
export function recencyBonus(date: string | null, today: string): number {
  if (!date) return 1;
  const days = (Date.parse(today) - Date.parse(date)) / 86_400_000;
  if (!Number.isFinite(days)) return 1;
  if (days < 0) return 3; // future-dated (planned course, next dose)
  if (days <= 90) return 3;
  if (days <= 365) return 2;
  if (days <= 3 * 365) return 1;
  return 0;
}

/**
 * Orders matches by `-bm25 + titleBonus + recencyBonus`, best first.
 * Ties fall back to the newest date, then to a stable type order, so the same
 * query always produces the same list.
 */
export function rankResults(rows: ScoredRow[], query: string, today: string): SearchResult[] {
  const typeOrder = new Map(ENTITY_TYPES.map((t, i) => [t, i]));
  return rows
    .map((r) => ({
      row: r,
      score: -r.bm25 + titleBonus(r.title, query) + recencyBonus(r.date, today),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const da = a.row.date ?? "";
      const db = b.row.date ?? "";
      if (da !== db) return db.localeCompare(da);
      const ta = typeOrder.get(a.row.entityType) ?? 99;
      const tb = typeOrder.get(b.row.entityType) ?? 99;
      if (ta !== tb) return ta - tb;
      return a.row.entityId - b.row.entityId;
    })
    .map(({ row }) => ({
      entityType: row.entityType,
      entityId: row.entityId,
      title: row.title,
      subtitle: row.subtitle,
      date: row.date,
      route: row.route,
    }));
}
