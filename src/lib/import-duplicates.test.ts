import { describe, expect, it } from "vitest";
import {
  findDuplicatePanels,
  findDuplicateRecords,
  isoDay,
  nameKey,
  type PanelCandidate,
} from "./import-duplicates";

const stored: PanelCandidate = {
  id: 1,
  date: "2026-08-20",
  labName: "Invitro",
  biomarkerIds: [1, 2, 3, 4, 5],
};

describe("findDuplicatePanels", () => {
  it("flags the same report imported twice as likely", () => {
    const [match] = findDuplicatePanels(
      { date: "2026-08-20", labName: "Invitro", biomarkerIds: [1, 2, 3, 4, 5] },
      [stored],
    );
    expect(match.confidence).toBe("likely");
    expect(match.overlapRatio).toBe(1);
    expect(match.sharedBiomarkers).toBe(5);
    expect(match.sameLab).toBe(true);
  });

  it("ignores panels from another day, however similar", () => {
    // A repeat of the same panel a week later is the point of the whole app.
    expect(
      findDuplicatePanels(
        { date: "2026-08-27", labName: "Invitro", biomarkerIds: [1, 2, 3, 4, 5] },
        [stored],
      ),
    ).toEqual([]);
  });

  it("compares by calendar day, not by string", () => {
    const [match] = findDuplicatePanels(
      { date: "2026-08-20T09:30:00Z", labName: "Invitro", biomarkerIds: [1, 2, 3, 4, 5] },
      [stored],
    );
    expect(match.panelId).toBe(1);
  });

  it("downgrades to possible when the labs disagree", () => {
    const [match] = findDuplicatePanels(
      { date: "2026-08-20", labName: "Synevo", biomarkerIds: [1, 2, 3, 4, 5] },
      [stored],
    );
    expect(match.confidence).toBe("possible");
    expect(match.sameLab).toBe(false);
  });

  it("treats a missing lab name as unknown, not as a different lab", () => {
    const [match] = findDuplicatePanels(
      { date: "2026-08-20", labName: null, biomarkerIds: [1, 2, 3, 4, 5] },
      [stored],
    );
    expect(match.confidence).toBe("likely");
    expect(match.sameLab).toBe(false);
  });

  it("does not flag a genuinely different panel drawn the same day", () => {
    // Blood in the morning, urine in the afternoon: same day, no shared markers.
    expect(
      findDuplicatePanels({ date: "2026-08-20", labName: "Invitro", biomarkerIds: [9, 10] }, [
        stored,
      ]),
    ).toEqual([]);
  });

  it("flags a partial re-import as possible", () => {
    const [match] = findDuplicatePanels(
      { date: "2026-08-20", labName: "Invitro", biomarkerIds: [1, 7, 8, 9] },
      [stored],
    );
    expect(match.confidence).toBe("possible");
    expect(match.sharedBiomarkers).toBe(1);
  });

  it("uses the lab alone for a findings-only document, and never calls it likely", () => {
    const [match] = findDuplicatePanels(
      { date: "2026-08-20", labName: "invitro ", biomarkerIds: [] },
      [stored],
    );
    expect(match.confidence).toBe("possible");
    expect(
      findDuplicatePanels({ date: "2026-08-20", labName: null, biomarkerIds: [] }, [stored]),
    ).toEqual([]);
  });

  it("counts each incoming biomarker once, so a doubled row cannot skew the ratio", () => {
    const [match] = findDuplicatePanels(
      { date: "2026-08-20", labName: "Invitro", biomarkerIds: [1, 1, 1, 1] },
      [stored],
    );
    expect(match.overlapRatio).toBe(1);
    expect(match.sharedBiomarkers).toBe(1);
  });

  it("returns the strongest match first", () => {
    const weak: PanelCandidate = { id: 2, date: "2026-08-20", labName: "Other", biomarkerIds: [1] };
    const matches = findDuplicatePanels(
      { date: "2026-08-20", labName: "Invitro", biomarkerIds: [1, 2, 3] },
      [weak, stored],
    );
    expect(matches.map((m) => m.panelId)).toEqual([1, 2]);
  });
});

describe("findDuplicateRecords", () => {
  const doses = [
    { id: 1, date: "2026-03-01", name: "Hepatitis B" },
    { id: 2, date: "2026-03-01", name: "Hepatitis B booster" },
    { id: 3, date: "2025-03-01", name: "Hepatitis B" },
  ];

  it("calls an identical same-day name a likely duplicate", () => {
    const matches = findDuplicateRecords({ date: "2026-03-01", name: "hepatitis b" }, doses);
    expect(matches.find((m) => m.id === 1)?.confidence).toBe("likely");
  });

  it("calls a containing name possible, so an abbreviation still warns", () => {
    const matches = findDuplicateRecords({ date: "2026-03-01", name: "Hepatitis B" }, doses);
    expect(matches.find((m) => m.id === 2)?.confidence).toBe("possible");
  });

  it("never matches across days", () => {
    const matches = findDuplicateRecords({ date: "2026-03-01", name: "Hepatitis B" }, doses);
    expect(matches.map((m) => m.id)).not.toContain(3);
  });

  it("says nothing when the incoming record has no date or no name", () => {
    expect(findDuplicateRecords({ date: null, name: "Hepatitis B" }, doses)).toEqual([]);
    expect(findDuplicateRecords({ date: "2026-03-01", name: "  " }, doses)).toEqual([]);
  });
});

describe("normalisation helpers", () => {
  it("folds case and collapses whitespace", () => {
    expect(nameKey("  Hepatitis   B ")).toBe("hepatitis b");
    expect(nameKey(null)).toBe("");
  });

  it("keeps the calendar day of a date or a datetime", () => {
    expect(isoDay("2026-08-20T23:59:00Z")).toBe("2026-08-20");
    expect(isoDay("2026-08-20")).toBe("2026-08-20");
  });
});
