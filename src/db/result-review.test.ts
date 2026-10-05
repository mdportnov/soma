import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "./client";
import { biomarker, biomarkerReferenceRange, labPanel, labResult, profile } from "./schema";
import { updateResultValue, recomputeFlagsForProfile } from "./repos";

const state = vi.hoisted(() => ({ sqlite: null as DatabaseSync | null }));

vi.mock("./client", async () => {
  const { drizzle } = await import("drizzle-orm/sqlite-proxy");
  return {
    db: drizzle(async (sql, params, method) => {
      const statement = state.sqlite!.prepare(sql);
      if (method === "run") {
        statement.run(...params);
        return { rows: [] };
      }
      const rows = statement.all(...params).map((row) => Object.values(row));
      return { rows: method === "get" ? (rows[0] ?? []) : rows };
    }),
  };
});

beforeAll(() => {
  state.sqlite = new DatabaseSync(":memory:");
  const directory = new URL("./migrations/", import.meta.url);
  for (const file of readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    state.sqlite.exec(readFileSync(new URL(file, directory), "utf8"));
  }
});

afterAll(() => state.sqlite?.close());

beforeEach(async () => {
  for (const table of [labResult, labPanel, biomarkerReferenceRange, biomarker, profile]) {
    await db.delete(table);
  }
  await db.insert(profile).values({ id: 1, name: "Review fixture", sex: "male" });
  await db.insert(biomarker).values([
    { id: 1, canonicalName: "Original", category: "Test", defaultUnit: "mg/dL", refHigh: 5 },
    {
      id: 2,
      canonicalName: "Glucose",
      category: "Test",
      code: "1558-6",
      defaultUnit: "mmol/L",
      refHigh: 7,
    },
  ]);
  await db
    .insert(biomarkerReferenceRange)
    .values({ biomarkerId: 2, sex: "male", refLow: 3, refHigh: 4 });
  await db.insert(labPanel).values({ id: 1, profileId: 1, date: "2026-09-29" });
  await db.insert(labResult).values({
    id: 1,
    panelId: 1,
    biomarkerId: 1,
    value: 90,
    unit: "mg/dL",
    confidence: "ai",
    rawLabel: "Source label",
    sourcePage: 2,
  });
});

describe("correcting a result during import review", () => {
  it("recalculates normalization and demographic flags using the corrected biomarker", async () => {
    await updateResultValue(1, { value: 90, unit: "mg/dL", biomarkerId: 2 });
    const [result] = await db.select().from(labResult).where(eq(labResult.id, 1));
    expect(result.biomarkerId).toBe(2);
    expect(result.valueNormalized).toBeCloseTo(5, 1);
    expect(result.unitNormalized).toBe("mmol/L");
    expect(result.flag).toBe("high");
    expect(result.outOfRange).toBe(true);
    expect(result.confidence).toBe("manual");
    expect(result.reviewedAt).toBeTruthy();
    expect(result.rawLabel).toBe("Source label");
    expect(result.sourcePage).toBe(2);
  });

  it("preserves the mapping when correcting only a value or unit", async () => {
    await updateResultValue(1, { value: 4, unit: "mg/dL" });
    const [result] = await db.select().from(labResult);
    expect(result.biomarkerId).toBe(1);
    expect(result.valueNormalized).toBe(4);
    expect(result.outOfRange).toBe(false);
    expect(result.reviewedAt).toBeTruthy();
  });

  it("does not write a correction with a nonexistent biomarker", async () => {
    await expect(
      updateResultValue(1, { value: 4, unit: "mg/dL", biomarkerId: 999 }),
    ).rejects.toThrow("Biomarker not found");
    const [result] = await db.select().from(labResult);
    expect(result.value).toBe(90);
    expect(result.biomarkerId).toBe(1);
    expect(result.reviewedAt).toBeNull();
  });
});

it("backfills supported unit spellings without changing source data or review state", async () => {
  await db
    .update(biomarker)
    .set({ defaultUnit: "µmol/L", refHigh: 420 })
    .where(eq(biomarker.id, 1));
  await db.update(labResult).set({ value: 0.47, unit: "mmol/L" }).where(eq(labResult.id, 1));
  await recomputeFlagsForProfile(1);
  const [result] = await db.select().from(labResult);
  expect(result.valueNormalized).toBe(470);
  expect(result.unitNormalized).toBe("µmol/L");
  expect(result.outOfRange).toBe(true);
  expect(result.value).toBe(0.47);
  expect(result.unit).toBe("mmol/L");
  expect(result.rawLabel).toBe("Source label");
  expect(result.confidence).toBe("ai");
  expect(result.reviewedAt).toBeNull();
});
