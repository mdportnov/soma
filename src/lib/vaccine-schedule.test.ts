import { describe, expect, it } from "vitest";
import {
  VACCINE_SCHEDULE,
  antigenIdsOf,
  computeAntigen,
  countActionable,
  isGradedTier,
  isSuperseded,
  lapsedRecords,
} from "./vaccine-schedule";

const TODAY = "2026-10-05";
const BIRTH = "2001-05-10";

const entry = (id: string) => VACCINE_SCHEDULE.find((e) => e.id === id)!;
const views = (records: { vaccineName: string; date: string }[]) =>
  VACCINE_SCHEDULE.map((e) => computeAntigen(e, BIRTH, records, TODAY, isGradedTier(e.tier)));

// The real history that surfaced the bug: a childhood АКДС/АДС-М series with
// 10-year certificates, then a fresh Td in 2026.
const dtpHistory = [
  { vaccineName: "DTP", date: "2001-08-21", expiresAt: "2011-08-21" },
  { vaccineName: "DTP", date: "2001-10-02", expiresAt: "2011-10-02" },
  { vaccineName: "DTP", date: "2001-11-14", expiresAt: "2011-11-14" },
  { vaccineName: "DTP", date: "2003-01-29", expiresAt: "2013-01-29" },
  { vaccineName: "DTP", date: "2008-06-24", expiresAt: "2018-06-24" },
  { vaccineName: "DTP", date: "2017-04-28", expiresAt: "2027-04-28" },
  { vaccineName: "DTP", date: "2026-07-28", expiresAt: "2036-07-28" },
];

describe("recurring boosters", () => {
  it("runs the Td clock from the last shot, not from birthday cycles", () => {
    const view = computeAntigen(entry("dtp"), BIRTH, dtpHistory, TODAY);
    expect(view.recurring).toMatchObject({
      lastDate: "2026-07-28",
      nextDate: "2036-07-28",
      status: "upcoming",
    });
    expect(view.overall).toBe("done");
  });

  it("flags Td overdue once ten years passed since the last shot", () => {
    const view = computeAntigen(
      entry("dtp"),
      BIRTH,
      [{ vaccineName: "Td", date: "2015-03-01" }],
      TODAY,
    );
    expect(view.recurring).toMatchObject({ nextDate: "2025-03-01", status: "overdue" });
    expect(view.overall).toBe("overdue");
  });

  it("treats a lapsed annual flu shot as due, not overdue", () => {
    const view = computeAntigen(
      entry("influenza"),
      BIRTH,
      [{ vaccineName: "Грипп", date: "2003-11-26" }],
      TODAY,
    );
    expect(view.recurring?.status).toBe("due");
    expect(view.overall).toBe("due");
  });

  it("never grades an unrecorded booster cycle as overdue", () => {
    const view = computeAntigen(entry("dtp"), BIRTH, [], TODAY);
    expect(view.recurring?.status).toBe("upcoming");
  });
});

describe("superseded certificates", () => {
  it("does not report old doses as lapsed once a later dose exists", () => {
    expect(lapsedRecords(dtpHistory, TODAY)).toEqual([]);
    expect(isSuperseded(dtpHistory[0], dtpHistory)).toBe(true);
    expect(isSuperseded(dtpHistory[6], dtpHistory)).toBe(false);
    expect(countActionable(views(dtpHistory), dtpHistory, TODAY)).toBe(0);
  });

  it("still reports the latest lapsed certificate", () => {
    const records = dtpHistory.slice(0, 5);
    expect(lapsedRecords(records, TODAY)).toEqual([records[4]]);
  });

  it("does not let a single-antigen shot supersede a combination certificate", () => {
    const combo = { vaccineName: "Pentaxim", date: "2002-01-01", expiresAt: "2012-01-01" };
    const td = { vaccineName: "Td", date: "2010-01-01" };
    expect(isSuperseded(combo, [combo, td])).toBe(false);
  });

  it("falls back to name equality for shots outside the calendar", () => {
    const a = { vaccineName: "Custom shot", date: "2020-01-01", expiresAt: "2021-01-01" };
    const b = { vaccineName: "custom shot", date: "2022-01-01", expiresAt: "2030-01-01" };
    expect(lapsedRecords([a, b], TODAY)).toEqual([]);
  });

  it("does not count a lapse twice when the booster is already overdue", () => {
    const records = [{ vaccineName: "Td", date: "2010-01-01", expiresAt: "2020-01-01" }];
    expect(countActionable(views(records), records, TODAY)).toBe(1);
  });
});

describe("antigen matching", () => {
  const ids = (vaccineName: string, manufacturer: string | null = null) =>
    antigenIdsOf({ vaccineName, manufacturer, date: "2026-01-01" });

  it("does not read a manufacturer's 'Ltd' as a tetanus shot", () => {
    expect(ids("Typhoid (Typbar-TCV, Vi conjugate)", "Bharat Biotech International Ltd")).toEqual([
      "typhoid",
    ]);
  });

  it("does not read mRNA as rubella or Japanese encephalitis as tick-borne", () => {
    expect(ids("COVID-19 / Pfizer mRNA")).toEqual([]);
    expect(ids("Японский энцефалит")).toEqual(["je"]);
  });

  it("still recognises abbreviations, stems and combination products", () => {
    expect(ids("Tetanus and Diphtheria (Td)")).toEqual(["dtp"]);
    expect(ids("АДС-М")).toEqual(["dtp"]);
    expect(ids("Пневмококковая")).toEqual(["pcv"]);
    expect(ids("MMR")).toEqual(["measles", "rubella", "mumps"]);
  });
});

describe("courses started late", () => {
  it("times the next HPV doses from the first adult dose", () => {
    const view = computeAntigen(
      entry("hpv"),
      BIRTH,
      [{ vaccineName: "HPV (Gardasil 9)", date: "2026-09-02" }],
      TODAY,
    );
    expect(view.doses.map((d) => [d.status, d.dueDate ?? d.doneDate])).toEqual([
      ["done", "2026-09-02"],
      ["upcoming", "2026-11-01"],
      ["upcoming", "2027-03-01"],
    ]);
  });

  it("grades an unfinished rabies course even though rabies is a travel antigen", () => {
    const rec = [{ vaccineName: "Rabies (Verorab)", date: "2026-08-01" }];
    const view = computeAntigen(entry("rabies"), BIRTH, rec, TODAY, false);
    expect(view.doses[1]).toMatchObject({ status: "overdue", dueDate: "2026-08-08" });
    expect(view.overall).toBe("overdue");
  });
});

describe("hidden reminders", () => {
  it("drops a hidden reminder from the count and brings it back after a new lapse", () => {
    const rec = [{ vaccineName: "Td", date: "2010-01-01" }];
    expect(countActionable(views(rec), rec, TODAY, ["booster:dtp:2020-01-01"])).toBe(0);
    const later = [...rec, { vaccineName: "Td", date: "2015-06-01" }];
    expect(countActionable(views(later), later, TODAY, ["booster:dtp:2020-01-01"])).toBe(1);
  });
});
