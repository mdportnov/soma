import { beforeEach, describe, expect, it, vi } from "vitest";

// The tool layer sits on the Tauri-backed DB; the review modules are covered
// on their own, so here the repositories are stubbed and the contract between
// tool names, argument validation and the pure analysis is what gets tested.
vi.mock("@/db/repos", () => ({
  getBiomarker: vi.fn(async () => ({ id: 1, canonicalName: "Ferritin" })),
  getBiomarkerSeries: vi.fn(async () => [
    {
      date: "2026-01-15",
      value: 60,
      unit: "ng/mL",
      outOfRange: false,
      flag: null,
      evaluated: true,
      panelId: 1,
      labName: "Lab",
    },
    {
      date: "2026-08-20",
      value: 18,
      unit: "ng/mL",
      outOfRange: true,
      flag: "low",
      evaluated: true,
      panelId: 2,
      labName: "Lab",
    },
  ]),
  getDiagnosis: vi.fn(),
  getImagingRecord: vi.fn(),
  getHealthNote: vi.fn(),
  getMedication: vi.fn(),
  getPanel: vi.fn(),
  getProfile: vi.fn(async () => ({ id: 1, birthDate: "1990-05-05", sex: "male" })),
  getReferenceRangesByBiomarker: vi.fn(async () => new Map()),
  getSymptomSeries: vi.fn(),
  getVisit: vi.fn(),
  listBiomarkers: vi.fn(async () => [
    {
      id: 1,
      code: null,
      canonicalName: "Ferritin",
      category: "iron",
      aliases: ["ферритин"],
      defaultUnit: "ng/mL",
      refLow: 30,
      refHigh: 400,
      optimalLow: 50,
      optimalHigh: 150,
      direction: "range",
      isCustom: false,
      isUserModified: false,
    },
  ]),
  listAllergies: vi.fn(async () => []),
  listBpLog: vi.fn(async () => []),
  listDiagnoses: vi.fn(async () => []),
  listHealthNotes: vi.fn(async () => []),
  listLifestyleLog: vi.fn(async () => []),
  listMedications: vi.fn(async () => [
    {
      id: 5,
      profileId: 1,
      name: "Iron",
      type: "supplement",
      doseAmount: null,
      doseUnit: null,
      schedule: null,
      asNeeded: false,
      startDate: "2026-06-01",
      endDate: null,
      purpose: null,
      prescriptionId: null,
    },
  ]),
  listSymptomNames: vi.fn(async () => []),
  listSymptomLog: vi.fn(async () => []),
  listVaccines: vi.fn(async () => [
    {
      id: 9,
      profileId: 1,
      vaccineName: "Td",
      date: "2010-06-01",
      manufacturer: null,
      batchNumber: null,
      dose: null,
      expiresAt: null,
      administeredBy: null,
      country: null,
      notes: null,
      attachmentId: null,
    },
  ]),
  listWeightLog: vi.fn(async () => []),
}));
vi.mock("@/db/search", () => ({
  ensureSearchIndex: vi.fn(),
  searchRecords: vi.fn(async () => []),
}));
vi.mock("../context", () => ({ buildHealthContext: vi.fn(async () => "context") }));
vi.mock("./review-data", async () => {
  const review = await import("./review");
  const input: import("./review").ReviewInput = {
    today: "2026-09-02",
    profile: { birthDate: "1990-05-05", sex: "male", pregnancyStatus: null, targetWeightKg: null },
    biomarkers: [
      {
        id: 1,
        code: null,
        canonicalName: "Ferritin",
        category: "iron",
        aliases: [],
        defaultUnit: "ng/mL",
        refLow: 30,
        refHigh: 400,
        optimalLow: 50,
        optimalHigh: 150,
        direction: "range",
        isCustom: false,
        isUserModified: false,
      },
    ],
    ranges: new Map(),
    results: [
      {
        resultId: 1,
        biomarkerId: 1,
        panelId: 1,
        date: "2026-01-15",
        labName: null,
        value: 60,
        unit: "ng/mL",
        valueNormalized: 60,
        unitNormalized: "ng/mL",
        outOfRange: false,
        flag: null,
      },
      {
        resultId: 2,
        biomarkerId: 1,
        panelId: 2,
        date: "2026-08-20",
        labName: null,
        value: 18,
        unit: "ng/mL",
        valueNormalized: 18,
        unitNormalized: "ng/mL",
        outOfRange: true,
        flag: "low",
      },
    ],
    medications: [],
    diagnoses: [],
    allergies: [],
    retestSchedules: [],
    bpLog: [],
    weightLog: [],
    symptoms: [],
    visits: [],
    vaccines: [],
    imagingCount: 0,
    healthNoteCount: 0,
  };
  void review;
  return { loadReviewInput: vi.fn(async () => input) };
});

import { agentToolDefinitions, executeReadTool } from "./tools";

describe("agentToolDefinitions", () => {
  it("declares unique, schema-shaped tools including the review tools", () => {
    const names = agentToolDefinitions.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(
      expect.arrayContaining([
        "get_health_overview",
        "get_changes_since",
        "get_vaccination_status",
        "get_biomarker_trend",
        "draft_health_changes",
      ]),
    );
    for (const tool of agentToolDefinitions) {
      expect(tool.inputSchema).toMatchObject({ type: "object" });
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });

  it("is executable for every read tool name", async () => {
    for (const tool of agentToolDefinitions) {
      if (tool.name === "draft_health_changes") continue;
      const args: Record<string, unknown> = {};
      const required = (tool.inputSchema as { required?: string[] }).required ?? [];
      for (const key of required) {
        args[key] =
          key === "entityId"
            ? 1
            : key === "entityType"
              ? "biomarker"
              : key === "kind"
                ? "weight"
                : "ferritin";
      }
      await expect(executeReadTool(1, tool.name, args)).resolves.toBeDefined();
    }
  });
});

describe("executeReadTool", () => {
  beforeEach(() => vi.clearAllMocks());

  it("get_health_overview returns the computed review", async () => {
    const overview = (await executeReadTool(1, "get_health_overview", {})) as {
      labs: { outOfRange: unknown[] };
      today: string;
    };
    expect(overview.today).toBe("2026-09-02");
    expect(overview.labs.outOfRange).toHaveLength(1);
  });

  it("get_changes_since validates the date and passes it through", async () => {
    await expect(
      executeReadTool(1, "get_changes_since", { sinceDate: "yesterday" }),
    ).rejects.toThrow(/ISO date/);
    const changes = (await executeReadTool(1, "get_changes_since", {
      sinceDate: "2026-06-01",
    })) as { sinceDate: string; sinceReason: string };
    expect(changes).toMatchObject({ sinceDate: "2026-06-01", sinceReason: "requested" });
  });

  it("get_vaccination_status grades against the profile birth date", async () => {
    const status = (await executeReadTool(1, "get_vaccination_status", {})) as {
      birthDateKnown: boolean;
      actionable: { ref: string | null }[];
    };
    expect(status.birthDateKnown).toBe(true);
    expect(status.actionable.some((a) => a.ref === "vaccine:9")).toBe(true);
  });

  it("get_biomarker_trend adds the profile range and medications per reading", async () => {
    const trend = (await executeReadTool(1, "get_biomarker_trend", { query: "ферритин" })) as {
      rangeForProfile: { refLow: number | null };
      points: { ref: string; medicationsAtReading: string[] }[];
    };
    expect(trend.rangeForProfile.refLow).toBe(30);
    expect(trend.points.map((p) => p.ref)).toEqual(["lab_panel:1", "lab_panel:2"]);
    expect(trend.points.map((p) => p.medicationsAtReading)).toEqual([[], ["Iron"]]);
  });

  it("rejects unknown tools", async () => {
    await expect(executeReadTool(1, "nope", {})).rejects.toThrow(/Unsupported tool/);
  });
});
