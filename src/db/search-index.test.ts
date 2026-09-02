import { describe, expect, it } from "vitest";
import {
  ENTITY_TYPES,
  blob,
  buildIndexRows,
  fileName,
  rankResults,
  recencyBonus,
  recordRoute,
  toMatchQuery,
  type IndexSources,
  type ScoredRow,
} from "./search-index";

/** An empty source set; each test fills in only the tables it cares about. */
function sources(partial: Partial<IndexSources> = {}): IndexSources {
  return {
    biomarkers: [],
    panels: [],
    labResults: [],
    labFindings: [],
    visits: [],
    diagnoses: [],
    medications: [],
    prescriptions: [],
    allergies: [],
    vaccines: [],
    symptoms: [],
    imaging: [],
    notes: [],
    weightLogs: [],
    bpLogs: [],
    lifestyleLogs: [],
    retests: [],
    attachments: [],
    chatThreads: [],
    ...partial,
  };
}

describe("toMatchQuery", () => {
  it("prefix-matches the last token only", () => {
    expect(toMatchQuery("vitamin d")).toBe('"vitamin" "d"*');
    expect(toMatchQuery("ferritin")).toBe('"ferritin"*');
  });

  it("handles Cyrillic the same way as Latin", () => {
    // unicode61 is Unicode-aware and case-folds Cyrillic, so nothing special is
    // needed here — the tokens just have to survive quoting intact.
    expect(toMatchQuery("Ферритин")).toBe('"Ферритин"*');
    expect(toMatchQuery("витамин Д")).toBe('"витамин" "Д"*');
  });

  it("returns an empty expression for empty or whitespace-only input", () => {
    expect(toMatchQuery("")).toBe("");
    expect(toMatchQuery("   ")).toBe("");
    expect(toMatchQuery("\n\t ")).toBe("");
  });

  it("drops tokens with no letter or digit (an empty FTS5 phrase is a syntax error)", () => {
    expect(toMatchQuery("-")).toBe("");
    expect(toMatchQuery("!!! ???")).toBe("");
    expect(toMatchQuery("- ферритин")).toBe('"ферритин"*');
  });

  it("escapes embedded double quotes by doubling them", () => {
    expect(toMatchQuery('say "hi"')).toBe('"say" """hi"""*');
  });

  it("quotes punctuation-bearing tokens so they cannot break the grammar", () => {
    expect(toMatchQuery("hba1c%")).toBe('"hba1c%"*');
    expect(toMatchQuery("25-OH")).toBe('"25-OH"*');
    expect(toMatchQuery("a AND b")).toBe('"a" "AND" "b"*');
  });

  it("collapses runs of whitespace between tokens", () => {
    expect(toMatchQuery("  iron   panel  ")).toBe('"iron" "panel"*');
  });
});

describe("recordRoute", () => {
  it("opens detail pages for the types that have one", () => {
    expect(recordRoute("biomarker", 7)).toBe("/biomarkers/7");
    expect(recordRoute("lab_panel", 3)).toBe("/labs/3");
    expect(recordRoute("visit", 12)).toBe("/visits/12");
    expect(recordRoute("imaging", 5)).toBe("/imaging/5");
  });

  it("uses the detail route for diagnoses and medications, not the bare list", () => {
    expect(recordRoute("diagnosis", 4)).toBe("/diagnoses/4");
    expect(recordRoute("medication", 9)).toBe("/medications/9");
  });

  it("flags the row on list pages that have no detail route", () => {
    expect(recordRoute("vaccine", 2)).toBe("/vaccines?highlight=2");
    expect(recordRoute("allergy", 8)).toBe("/allergies?highlight=8");
    expect(recordRoute("health_note", 1)).toBe("/notes?highlight=1");
    expect(recordRoute("lifestyle_log", 6)).toBe("/lifestyle?highlight=6");
  });

  it("routes journal logs to their own tab", () => {
    expect(recordRoute("weight_log", 11)).toBe("/journal?tab=weight&highlight=11");
    expect(recordRoute("bp_log", 12)).toBe("/journal?tab=bp&highlight=12");
    expect(recordRoute("symptom", 13)).toBe("/journal?tab=symptoms");
  });

  it("opens a nested row inside its parent", () => {
    expect(recordRoute("lab_result", 55, 3)).toBe("/labs/3?highlight=55");
    expect(recordRoute("lab_finding", 56, 3)).toBe("/labs/3?highlight=56");
    expect(recordRoute("prescription", 4, 20)).toBe("/visits/20");
  });

  it("falls back to the section list when the parent is missing", () => {
    expect(recordRoute("lab_result", 55, null)).toBe("/labs");
    expect(recordRoute("prescription", 4, null)).toBe("/medications");
    expect(recordRoute("attachment", 9, null, null)).toBe("/labs");
  });

  it("sends an attachment to whatever it documents", () => {
    expect(recordRoute("attachment", 9, 3, "lab_panel")).toBe("/labs/3");
    expect(recordRoute("attachment", 9, 3, "visit")).toBe("/visits/3");
    expect(recordRoute("attachment", 9, 3, "vaccine")).toBe("/vaccines?highlight=3");
    expect(recordRoute("attachment", 9, 3, "something_new")).toBe("/labs");
  });

  it("never returns an empty path for any known entity type", () => {
    for (const type of ENTITY_TYPES) {
      expect(recordRoute(type, 1, 2, "lab_panel").startsWith("/")).toBe(true);
    }
  });
});

describe("blob", () => {
  it("drops empty parts and trims the rest", () => {
    expect(blob(" a ", null, undefined, "", "b")).toBe("a b");
  });

  it("keeps numbers", () => {
    expect(blob("dose", 3)).toBe("dose 3");
  });

  it("caps a huge field so one pasted discharge summary can't swamp the index", () => {
    const huge = "x".repeat(50_000);
    expect(blob(huge).length).toBeLessThanOrEqual(4000);
  });
});

describe("fileName", () => {
  it("takes the last segment on either separator", () => {
    expect(fileName("/var/soma/files/invitro-2026.pdf")).toBe("invitro-2026.pdf");
    expect(fileName("C:\\soma\\scan.png")).toBe("scan.png");
    expect(fileName("plain.pdf")).toBe("plain.pdf");
  });
});

describe("buildIndexRows", () => {
  it("indexes every text field of a vaccine, not just its name", () => {
    const [row] = buildIndexRows(
      sources({
        vaccines: [
          {
            id: 1,
            vaccineName: "Yellow fever",
            manufacturer: "Sanofi",
            batchNumber: "K7842",
            administeredBy: "Dr Ivanov",
            country: "Georgia",
            notes: "travel clinic on Rustaveli",
            date: "2026-04-02",
          },
        ],
      }),
    );
    for (const term of ["K7842", "Ivanov", "Georgia", "Rustaveli", "Sanofi"]) {
      expect(row.content).toContain(term);
    }
    expect(row.route).toBe("/vaccines?highlight=1");
    expect(row.date).toBe("2026-04-02");
  });

  it("indexes a user's own lab values, with the biomarker's aliases", () => {
    const rows = buildIndexRows(
      sources({
        labResults: [
          {
            id: 90,
            panelId: 4,
            panelDate: "2026-05-01",
            biomarkerName: "Ferritin",
            aliases: ["Ферритин", "FERR"],
            value: 18.2,
            unit: "ng/mL",
            rawLabel: "Ферритин сыворотки",
          },
        ],
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].entityType).toBe("lab_result");
    expect(rows[0].title).toBe("Ferritin");
    expect(rows[0].subtitle).toBe("18.2 ng/mL");
    expect(rows[0].content).toContain("Ферритин");
    expect(rows[0].route).toBe("/labs/4?highlight=90");
  });

  it("indexes lab findings, which no other search path reaches", () => {
    const [row] = buildIndexRows(
      sources({
        labFindings: [
          {
            id: 3,
            panelId: 2,
            panelDate: "2026-01-09",
            rawLabel: "HBsAg",
            nameEn: "Hepatitis B surface antigen",
            valueText: "negative",
            unit: null,
            refRangeText: "negative",
          },
        ],
      }),
    );
    expect(row.title).toBe("Hepatitis B surface antigen");
    expect(row.content).toContain("HBsAg");
    expect(row.content).toContain("negative");
  });

  it("indexes free-text notes on every record type that has them", () => {
    const rows = buildIndexRows(
      sources({
        diagnoses: [
          {
            id: 1,
            date: "2026-02-02",
            name: "Anemia",
            icdCode: "D50",
            status: "active",
            notes: "iron deficiency after the marathon",
          },
        ],
        allergies: [
          {
            id: 2,
            allergen: "Amoxicillin",
            reaction: "rash",
            category: "drug",
            severity: "moderate",
            notes: "confirmed by skin test",
            onsetDate: "2024-07-11",
          },
        ],
        panels: [
          {
            id: 3,
            date: "2026-03-03",
            labName: "Invitro",
            city: null,
            country: null,
            notes: "fasting, morning draw",
          },
        ],
      }),
    );
    const contents = rows.map((r) => r.content).join(" | ");
    expect(contents).toContain("marathon");
    expect(contents).toContain("skin test");
    expect(contents).toContain("fasting");
  });

  it("collapses symptoms to one row per name, carrying every note", () => {
    const rows = buildIndexRows(
      sources({
        symptoms: [
          { id: 1, symptomName: "Headache", notes: "after coffee", date: "2026-01-01" },
          { id: 2, symptomName: "headache", notes: "with nausea", date: "2026-06-01" },
          { id: 3, symptomName: "Rash", notes: null, date: "2026-02-01" },
        ],
      }),
    );
    const headache = rows.filter((r) => r.entityType === "symptom" && /headache/i.test(r.title));
    expect(headache).toHaveLength(1);
    // The representative id and date are the most recent occurrence.
    expect(headache[0].entityId).toBe(2);
    expect(headache[0].date).toBe("2026-06-01");
    expect(headache[0].content).toContain("after coffee");
    expect(headache[0].content).toContain("with nausea");
    expect(rows).toHaveLength(2);
  });

  it("indexes vitals logs only when the user wrote a note on them", () => {
    const rows = buildIndexRows(
      sources({
        weightLogs: [
          { id: 1, date: "2026-01-01", weightKg: 82.4, notes: null },
          { id: 2, date: "2026-02-01", weightKg: 80.1, notes: "back from Tbilisi" },
        ],
        bpLogs: [
          { id: 3, date: "2026-01-05", systolic: 120, diastolic: 80, notes: "   " },
          { id: 4, date: "2026-02-05", systolic: 145, diastolic: 95, notes: "after the flight" },
        ],
        lifestyleLogs: [
          { id: 5, date: "2026-01-07", notes: null },
          { id: 6, date: "2026-02-07", notes: "slept badly" },
        ],
      }),
    );
    expect(rows.map((r) => r.entityId).sort()).toEqual([2, 4, 6]);
    expect(rows.find((r) => r.entityId === 4)?.title).toBe("145/95");
  });

  it("indexes only the file name of an attachment, not its stored path", () => {
    const [row] = buildIndexRows(
      sources({
        attachments: [
          {
            id: 1,
            filePath: "/Users/x/Library/Application Support/soma/files/invitro-2026-05.pdf",
            kind: "lab_pdf",
            linkedEntityType: "lab_panel",
            linkedEntityId: 42,
          },
        ],
      }),
    );
    expect(row.title).toBe("invitro-2026-05.pdf");
    expect(row.content).not.toContain("Library");
    expect(row.route).toBe("/labs/42");
  });

  it("skips rows that would carry no searchable text at all", () => {
    const rows = buildIndexRows(
      sources({
        prescriptions: [
          {
            id: 1,
            visitId: 2,
            visitDate: "2026-01-01",
            drugName: null,
            doseUnit: null,
            frequency: null,
            notes: null,
          },
        ],
      }),
    );
    expect(rows).toHaveLength(0);
  });

  it("produces a route for every row it emits", () => {
    const rows = buildIndexRows(
      sources({
        biomarkers: [
          { id: 1, canonicalName: "Ferritin", category: "Iron", code: null, aliases: null },
        ],
        medications: [
          {
            id: 2,
            name: "Isotretinoin",
            purpose: "acne",
            type: "drug",
            doseUnit: "mg",
            scheduleNotes: "with food",
            startDate: "2026-01-01",
          },
        ],
        retests: [{ id: 3, label: "Lipid panel", notes: null, lastTestedDate: "2026-01-01" }],
      }),
    );
    expect(rows).toHaveLength(3);
    for (const r of rows) expect(r.route).toMatch(/^\//);
    expect(rows.find((r) => r.entityType === "medication")?.content).toContain("with food");
  });
});

describe("recencyBonus", () => {
  const today = "2026-06-01";
  it("scores fresh records above stale ones", () => {
    expect(recencyBonus("2026-05-20", today)).toBeGreaterThan(recencyBonus("2025-01-01", today));
    expect(recencyBonus("2025-01-01", today)).toBeGreaterThan(recencyBonus("2018-01-01", today));
  });

  it("places undated dictionary rows mid-scale, never last", () => {
    expect(recencyBonus(null, today)).toBeGreaterThan(recencyBonus("2018-01-01", today));
    expect(recencyBonus(null, today)).toBeLessThan(recencyBonus("2026-05-20", today));
  });

  it("treats future-dated rows (a planned course) as current", () => {
    expect(recencyBonus("2026-09-01", today)).toBe(3);
  });
});

describe("rankResults", () => {
  const today = "2026-06-01";
  const row = (over: Partial<ScoredRow> & { entityId: number }): ScoredRow => ({
    entityType: "lab_panel",
    title: "Panel",
    subtitle: "",
    date: null,
    route: "/labs/1",
    bm25: -1,
    ...over,
  });

  it("lifts an exact title match above a better bm25 on the content blob", () => {
    const ranked = rankResults(
      [
        row({ entityId: 1, title: "Long note mentioning ferritin many times", bm25: -8 }),
        row({ entityId: 2, title: "Ferritin", bm25: -2 }),
      ],
      "ferritin",
      today,
    );
    expect(ranked[0].entityId).toBe(2);
  });

  it("prefers a leading title match over a mere substring", () => {
    const ranked = rankResults(
      [
        row({ entityId: 1, title: "Serum ferritin assay", bm25: -3 }),
        row({ entityId: 2, title: "Ferritin panel", bm25: -3 }),
      ],
      "ferritin",
      today,
    );
    expect(ranked[0].entityId).toBe(2);
  });

  it("breaks a relevance tie in favour of the more recent record", () => {
    const ranked = rankResults(
      [
        row({ entityId: 1, title: "Ferritin", date: "2019-01-01", bm25: -3 }),
        row({ entityId: 2, title: "Ferritin", date: "2026-05-01", bm25: -3 }),
      ],
      "ferritin",
      today,
    );
    expect(ranked.map((r) => r.entityId)).toEqual([2, 1]);
  });

  it("is deterministic when score, date and type all tie", () => {
    const input = [
      row({ entityId: 9, title: "Same", date: "2026-01-01" }),
      row({ entityId: 4, title: "Same", date: "2026-01-01" }),
    ];
    expect(rankResults(input, "same", today).map((r) => r.entityId)).toEqual([4, 9]);
    expect(rankResults([...input].reverse(), "same", today).map((r) => r.entityId)).toEqual([4, 9]);
  });

  it("keeps every input row and strips the score from the output", () => {
    const ranked = rankResults([row({ entityId: 1 }), row({ entityId: 2 })], "x", today);
    expect(ranked).toHaveLength(2);
    expect(ranked[0]).not.toHaveProperty("bm25");
  });
});

describe("chat threads in the index", () => {
  it("indexes a thread by its title and the user's questions only", () => {
    const rows = buildIndexRows(
      sources({
        chatThreads: [
          {
            id: 4,
            title: null,
            userMessages: ["Что по ферритину?", "А что с витамином D?"],
            updatedAt: "2026-08-28T11:05:16.238Z",
          },
          {
            id: 5,
            title: "Travel shots",
            userMessages: ["Yellow fever for Brazil?"],
            updatedAt: "2026-08-01T00:00:00Z",
          },
          { id: 6, title: null, userMessages: [], updatedAt: "2026-08-01T00:00:00Z" },
        ],
      }),
    );
    expect(rows.map((r) => r.entityId)).toEqual([4, 5]);
    expect(rows[0]).toMatchObject({
      entityType: "chat_thread",
      title: "Что по ферритину?",
      subtitle: "А что с витамином D?",
      date: "2026-08-28",
      route: "/assistant?thread=4",
    });
    expect(rows[0].content).toContain("витамином");
    expect(rows[1]).toMatchObject({ title: "Travel shots", subtitle: "" });
  });

  it("routes a chat thread to the assistant page", () => {
    expect(recordRoute("chat_thread", 9)).toBe("/assistant?thread=9");
  });
});
