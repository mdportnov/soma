import { describe, expect, it } from "vitest";
import type { Medication, RetestSchedule } from "@/db/schema";
import type { NotificationFeedData } from "@/db/repos";
import {
  buildNotificationFeed,
  filterByPrefs,
  retestDueDate,
  visibleNotifications,
  type NotificationPrefs,
} from "./notifications";

const ALL_ON: NotificationPrefs = { medication: true, retest: true, retestUpcoming: true };

function med(over: Partial<Medication> = {}): Medication {
  return {
    id: 1,
    profileId: 1,
    name: "Vitamin D",
    type: "supplement",
    doseAmount: null,
    doseUnit: null,
    schedule: { frequency: "daily", times: ["08:00"] },
    asNeeded: false,
    startDate: "2020-01-01",
    endDate: null,
    purpose: null,
    prescriptionId: null,
    ...over,
  };
}

function schedule(over: Partial<RetestSchedule> = {}): RetestSchedule {
  return {
    id: 1,
    profileId: 1,
    label: "Lipid panel",
    biomarkerId: null,
    intervalMonths: 3,
    lastTestedDate: null,
    notes: null,
    active: true,
    createdAt: "2024-01-01T00:00:00Z",
    ...over,
  };
}

function data(over: Partial<NotificationFeedData> = {}): NotificationFeedData {
  return {
    today: "2026-06-21",
    medications: [],
    loggedTodayMedIds: [],
    retestSchedules: [],
    ...over,
  };
}

describe("retestDueDate", () => {
  it("adds whole months calendar-correctly", () => {
    expect(retestDueDate("2026-01-15", 3)).toBe("2026-04-15");
    expect(retestDueDate("2026-11-30", 3)).toBe("2027-02-28"); // Feb clamps
  });
});

describe("buildNotificationFeed — medications", () => {
  it("nudges standing meds that are not yet logged today", () => {
    const items = buildNotificationFeed(data({ medications: [med()], loggedTodayMedIds: [] }));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "medication", medName: "Vitamin D", severity: "info" });
    expect(items[0].id).toBe("med:1:2026-06-21");
  });

  it("suppresses meds already logged today", () => {
    const items = buildNotificationFeed(data({ medications: [med()], loggedTodayMedIds: [1] }));
    expect(items).toHaveLength(0);
  });
});

describe("buildNotificationFeed — re-tests", () => {
  it("flags a recently-overdue re-test as watch and computes overdue days", () => {
    const items = buildNotificationFeed(
      data({ retestSchedules: [schedule({ lastTestedDate: "2026-03-10", intervalMonths: 3 })] }),
    );
    // due 2026-06-10, today 2026-06-21 → 11 days overdue (watch band, <= 60)
    expect(items).toHaveLength(1);
    const item = items[0];
    expect(item.kind).toBe("retest");
    if (item.kind !== "retest") throw new Error("expected retest");
    expect(item.dueDate).toBe("2026-06-10");
    expect(item.overdueDays).toBe(11);
    expect(item.severity).toBe("watch");
  });

  it("escalates a long-overdue re-test to alert", () => {
    const items = buildNotificationFeed(
      data({ retestSchedules: [schedule({ lastTestedDate: "2025-01-01", intervalMonths: 3 })] }),
    );
    expect(items[0].severity).toBe("alert");
  });

  it("includes an upcoming re-test inside the soon window as info", () => {
    const items = buildNotificationFeed(
      data({ retestSchedules: [schedule({ lastTestedDate: "2026-03-25", intervalMonths: 3 })] }),
    );
    // due 2026-06-25 → 4 days out → within 14-day window
    expect(items).toHaveLength(1);
    expect(items[0].severity).toBe("info");
  });

  it("excludes re-tests that are not yet due and outside the soon window", () => {
    const items = buildNotificationFeed(
      data({ retestSchedules: [schedule({ lastTestedDate: "2026-06-01", intervalMonths: 6 })] }),
    );
    expect(items).toHaveLength(0);
  });

  it("surfaces a schedule with no anchor so a baseline can be set", () => {
    const items = buildNotificationFeed(
      data({ retestSchedules: [schedule({ lastTestedDate: null })] }),
    );
    expect(items).toHaveLength(1);
    const item = items[0];
    if (item.kind !== "retest") throw new Error("expected retest");
    expect(item.noAnchor).toBe(true);
    expect(item.dueDate).toBe("2026-06-21");
  });

  it("links to the biomarker when one is attached", () => {
    const items = buildNotificationFeed(
      data({ retestSchedules: [schedule({ biomarkerId: 42, lastTestedDate: "2026-01-01" })] }),
    );
    expect(items[0].route).toBe("/biomarkers/42");
  });
});

describe("ordering & visibility", () => {
  it("orders alert before watch before info, re-tests before meds", () => {
    const items = buildNotificationFeed(
      data({
        medications: [med({ id: 9, name: "Aspirin" })],
        retestSchedules: [
          schedule({ id: 1, label: "TSH", lastTestedDate: "2025-01-01", intervalMonths: 3 }), // alert
          schedule({ id: 2, label: "Ferritin", lastTestedDate: "2026-03-25", intervalMonths: 3 }), // info
        ],
      }),
    );
    expect(items.map((i) => i.severity)).toEqual(["alert", "info", "info"]);
    expect(items[0].kind).toBe("retest");
  });

  it("visibleNotifications drops dismissed ids", () => {
    const items = buildNotificationFeed(data({ medications: [med()] }));
    const visible = visibleNotifications(items, new Set(["med:1:2026-06-21"]));
    expect(visible).toHaveLength(0);
  });
});

describe("filterByPrefs", () => {
  it("passes everything through when all categories are enabled", () => {
    const items = buildNotificationFeed(
      data({
        medications: [med()],
        retestSchedules: [schedule({ lastTestedDate: "2026-03-10", intervalMonths: 3 })],
      }),
    );
    expect(filterByPrefs(items, ALL_ON)).toHaveLength(items.length);
  });

  it("mutes medication nudges when medication is off", () => {
    const items = buildNotificationFeed(data({ medications: [med()] }));
    expect(filterByPrefs(items, { ...ALL_ON, medication: false })).toHaveLength(0);
  });

  it("mutes all re-tests when retest is off", () => {
    const items = buildNotificationFeed(
      data({ retestSchedules: [schedule({ lastTestedDate: "2026-03-10", intervalMonths: 3 })] }),
    );
    expect(filterByPrefs(items, { ...ALL_ON, retest: false })).toHaveLength(0);
  });

  it("drops only upcoming (not-yet-due) re-tests when retestUpcoming is off", () => {
    const items = buildNotificationFeed(
      data({
        retestSchedules: [
          // upcoming: due 2026-06-25 → 4 days out
          schedule({ id: 1, label: "Ferritin", lastTestedDate: "2026-03-25", intervalMonths: 3 }),
          // overdue: due 2026-06-10 → 11 days overdue
          schedule({ id: 2, label: "TSH", lastTestedDate: "2026-03-10", intervalMonths: 3 }),
        ],
      }),
    );
    const filtered = filterByPrefs(items, { ...ALL_ON, retestUpcoming: false });
    expect(filtered).toHaveLength(1);
    const item = filtered[0];
    if (item.kind !== "retest") throw new Error("expected retest");
    expect(item.label).toBe("TSH");
  });

  it("keeps no-anchor re-tests even with retestUpcoming off", () => {
    const items = buildNotificationFeed(
      data({ retestSchedules: [schedule({ lastTestedDate: null })] }),
    );
    expect(filterByPrefs(items, { ...ALL_ON, retestUpcoming: false })).toHaveLength(1);
  });
});
