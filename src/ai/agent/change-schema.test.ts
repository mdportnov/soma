import { describe, expect, it } from "vitest";
import { healthChangeSetSchema, healthChangeSetJsonSchema } from "./change-schema";

describe("healthChangeSetSchema", () => {
  it("accepts an explicit medication course", () => {
    const result = healthChangeSetSchema.parse({
      summary: "Start magnesium",
      items: [
        {
          kind: "create_medication_course",
          name: "Magnesium glycinate",
          medicationType: "supplement",
          doseAmount: 200,
          doseUnit: "mg",
          frequency: "daily",
          asNeeded: false,
          startDate: "2026-07-01",
          assertionType: "user_reported",
        },
      ],
    });
    expect(result.items[0]).toMatchObject({
      kind: "create_medication_course",
      medicationType: "supplement",
      startDate: "2026-07-01",
    });
  });

  it("refuses to invent medication type or start date", () => {
    const result = healthChangeSetSchema.safeParse({
      summary: "Start magnesium",
      items: [{ kind: "create_medication_course", name: "Magnesium" }],
    });
    expect(result.success).toBe(false);
  });

  it("preserves an approximate fact as a health note", () => {
    const result = healthChangeSetSchema.parse({
      summary: "Long-running symptom pattern",
      items: [
        {
          kind: "create_health_note",
          category: "symptom_pattern",
          originalText: "Последние месяцы часто болит голова",
          datePrecision: "approximate",
          dateRaw: "последние месяцы",
          tags: ["headache"],
        },
      ],
    });
    expect(result.items[0]).toMatchObject({
      kind: "create_health_note",
      datePrecision: "approximate",
    });
  });

  it("exports a strict provider schema", () => {
    const schema = healthChangeSetJsonSchema();
    expect(schema.type).toBe("object");
    expect(schema).not.toHaveProperty("$schema");
  });

  it("links a diagnosis and prescription to an earlier visit draft", () => {
    const result = healthChangeSetSchema.parse({
      summary: "Visit with diagnosis and prescription",
      items: [
        {
          kind: "create_visit",
          draftRef: "visit-1",
          date: "2026-07-12",
          doctorName: "Dr Ivanova",
        },
        {
          kind: "create_diagnosis",
          visitDraftRef: "visit-1",
          name: "Hypothyroidism",
          date: "2026-07-12",
          status: "active",
          assertionType: "clinician_diagnosed",
        },
        {
          kind: "create_medication_course",
          prescribedAtVisitRef: "visit-1",
          name: "Levothyroxine",
          medicationType: "drug",
          doseAmount: 50,
          doseUnit: "mcg",
          startDate: "2026-07-13",
        },
      ],
    });
    expect(result.items).toHaveLength(3);
  });
});
