import { describe, expect, it } from "vitest";
import { resolveVaccine, antigenById } from "./vaccine-vocab";
import { VACCINE_SCHEDULE, matchRecords } from "@/lib/vaccine-schedule";

describe("resolveVaccine — Russian certificate abbreviations", () => {
  // The exact antigens from a real Russian immunization record that the model
  // previously failed to map onto the English library.
  const cases: [string, string | null, string][] = [
    ["БЦЖ", "Tuberculosis", "bcg"],
    ["ДНК", "Hepatitis B", "hepb"],
    ["ОПВ", "Poliomyelitis", "polio"],
    ["АКДС", "Diphtheria, Tetanus, Pertussis", "dtp"],
    ["АДС-М", "Diphtheria, Tetanus, Pertussis", "dtp"],
    ["ЖКВ", "Measles", "measles"],
    ["Краснуха", "Rubella", "rubella"],
    ["ЖПВ", "Mumps", "mumps"],
    ["Тиф", "Typhoid", "typhoid"],
    ["Гепатит А", "Hepatitis A", "hepa"],
    ["Жёлтая Лихорадка", "Yellow fever", "yellow-fever"],
  ];

  it.each(cases)("maps %s onto the right antigen", (name, disease, expectedId) => {
    expect(resolveVaccine(name, disease)?.entryId).toBe(expectedId);
  });

  it("resolves bare abbreviations even without a disease hint", () => {
    expect(resolveVaccine("ОПВ")?.entryId).toBe("polio");
    expect(resolveVaccine("АКДС")?.entryId).toBe("dtp");
    expect(resolveVaccine("ЖКВ")?.entryId).toBe("measles");
    expect(resolveVaccine("ЖПВ")?.entryId).toBe("mumps");
  });

  it("uses the disease hint when the printed name is uninformative", () => {
    // "нет сведений о вакцине" rows still carry a section disease heading.
    expect(resolveVaccine("нет сведений о вакцине", "Meningococcal disease")?.entryId).toBe(
      "meningococcal",
    );
    expect(resolveVaccine("V1", "Influenza")?.entryId).toBe("influenza");
  });

  it("does not confuse Hepatitis A with Hepatitis B", () => {
    expect(resolveVaccine("Гепатит А", "Hepatitis A")?.entryId).toBe("hepa");
    expect(resolveVaccine("Гепатит B", "Hepatitis B")?.entryId).toBe("hepb");
  });

  it("matches a multi-antigen section heading by whole word", () => {
    expect(resolveVaccine("Дифтерия, коклюш, столбняк")?.entryId).toBe("dtp");
  });

  it("returns the canonical English name to store", () => {
    expect(resolveVaccine("ОПВ", "Poliomyelitis")?.name).toBe("Polio");
  });

  it("returns null when nothing matches", () => {
    expect(resolveVaccine("", null)).toBeNull();
    expect(resolveVaccine("totally unknown substance xyz", null)).toBeNull();
  });

  it("flags fuzzy matches as low-confidence", () => {
    // A typo'd canonical name should still resolve, but as fuzzy.
    const m = resolveVaccine("Poliomyelitus", null);
    expect(m?.entryId).toBe("polio");
    expect(m?.confidence).toBe("fuzzy");
  });

  it("antigenById round-trips", () => {
    expect(antigenById("dtp")?.name).toBe("DTP");
    expect(antigenById("nope")).toBeNull();
  });

  // The whole point of resolution: a dose stored under the canonical name must be
  // recognised by the calendar so the schedule lights up right after import.
  it("every canonical name is matched by the calendar for its own antigen", () => {
    for (const entry of VACCINE_SCHEDULE) {
      const matched = matchRecords(entry, [{ vaccineName: entry.name, date: "2020-01-01" }]);
      expect(matched, `calendar should match stored name "${entry.name}"`).toHaveLength(1);
    }
  });
});
