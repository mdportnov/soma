import { describe, expect, it } from "vitest";
import type { Vaccine } from "@/db/schema";
import { buildVaccinationStatus } from "./vaccination";

const TODAY = "2026-09-02";

function shot(over: Partial<Vaccine> & Pick<Vaccine, "id" | "vaccineName" | "date">): Vaccine {
  return {
    profileId: 1,
    manufacturer: null,
    batchNumber: null,
    dose: null,
    expiresAt: null,
    administeredBy: null,
    country: null,
    notes: null,
    attachmentId: null,
    ...over,
  };
}

describe("buildVaccinationStatus", () => {
  it("keeps unrecorded childhood doses apart from overdue boosters for an adult", () => {
    const status = buildVaccinationStatus({ today: TODAY, birthDate: "1990-05-05", vaccines: [] });
    expect(status.birthDateKnown).toBe(true);
    expect(status.actionable).toEqual([]);
    expect(status.notRecorded.length).toBeGreaterThan(0);
    expect(status.notRecorded.every((a) => a.overall === "not_recorded")).toBe(true);
    expect(status.legend.not_recorded).toMatch(/never as overdue/);
    expect(status.legend.overdue).toMatch(/Actionable/);
  });

  it("grades a started tetanus booster cycle as overdue once the interval lapsed", () => {
    const status = buildVaccinationStatus({
      today: TODAY,
      birthDate: "1990-05-05",
      vaccines: [shot({ id: 1, vaccineName: "Td (tetanus/diphtheria)", date: "2010-06-01" })],
    });
    const td = status.actionable.find((a) => a.kind === "booster_overdue");
    expect(td).toBeDefined();
    expect(td!.ref).toBe("vaccine:1");
    expect(td!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(status.notRecorded.some((a) => a.id === td!.antigenId)).toBe(false);
  });

  it("reports a lapsed certificate as actionable and links it to its record", () => {
    const status = buildVaccinationStatus({
      today: TODAY,
      birthDate: "1990-05-05",
      vaccines: [
        shot({
          id: 7,
          vaccineName: "Custom travel shot",
          date: "2020-01-01",
          expiresAt: "2025-01-01",
        }),
      ],
    });
    expect(status.actionable).toEqual([
      {
        kind: "certificate_lapsed",
        antigenId: null,
        label: "Custom travel shot",
        date: "2025-01-01",
        ref: "vaccine:7",
      },
    ]);
    expect(status.unmatchedRecords).toHaveLength(1);
    expect(status.unmatchedRecords[0]).toMatchObject({ ref: "vaccine:7", lapsed: true });
  });

  it("matches recorded shots to their antigen and marks doses done", () => {
    const status = buildVaccinationStatus({
      today: TODAY,
      birthDate: "1990-05-05",
      vaccines: [shot({ id: 3, vaccineName: "Yellow fever (Stamaril)", date: "2019-03-03" })],
    });
    const all = [
      ...status.done,
      ...status.contextual,
      ...status.upcoming,
      ...status.due,
      ...status.notRecorded,
    ];
    const yf = all.find((a) => a.id === "yellow-fever");
    expect(yf).toBeDefined();
    expect(yf!.records).toEqual([
      {
        ref: "vaccine:3",
        name: "Yellow fever (Stamaril)",
        date: "2019-03-03",
        dose: null,
        manufacturer: null,
        expiresAt: null,
        lapsed: false,
      },
    ]);
    expect(yf!.doses[0].status).toBe("done");
    expect(status.unmatchedRecords).toEqual([]);
    expect(status.totalRecords).toBe(1);
  });

  it("grades nothing without a birth date", () => {
    const status = buildVaccinationStatus({ today: TODAY, birthDate: null, vaccines: [] });
    expect(status.birthDateKnown).toBe(false);
    expect(status.actionable).toEqual([]);
    expect(status.notRecorded).toEqual([]);
    expect(status.due).toEqual([]);
  });
});
