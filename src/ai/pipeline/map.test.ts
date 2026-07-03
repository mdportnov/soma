import { describe, it, expect } from "vitest";
import type { Biomarker } from "@/db/schema";
import {
  mapExtractions,
  buildBiomarkerIndex,
  markDuplicates,
  reconvertRow,
  type MappedRow,
} from "./map";
import { AIProviderError, type AIProvider, type RawExtraction } from "../types";

/** Build a biomarker dictionary entry with sensible defaults for mapping tests. */
function makeBio(
  id: number,
  canonicalName: string,
  defaultUnit: string,
  aliases: string[] = [],
  code: string | null = null,
): Biomarker {
  return {
    id,
    canonicalName,
    defaultUnit,
    aliases,
    code,
    category: "Test",
    refLow: null,
    refHigh: null,
    optimalLow: null,
    optimalHigh: null,
    direction: "range",
    isCustom: false,
  } as Biomarker;
}

function raw(partial: Partial<RawExtraction> & { raw_label: string }): RawExtraction {
  return {
    analyte_en: null,
    value: 1,
    unit: "",
    ref_range_text: null,
    page: null,
    ...partial,
  };
}

const dict: Biomarker[] = [
  makeBio(1, "Glucose", "mmol/L", ["глюкоза", "blood sugar"], "1558-6"),
  makeBio(2, "LDL cholesterol", "mmol/L", ["ldl"], "13457-7"),
  makeBio(3, "HDL cholesterol", "mmol/L", ["hdl"], "2085-9"),
  makeBio(4, "Triglycerides", "mmol/L", ["tg"], "2571-8"),
  makeBio(5, "Thyroglobulin", "ng/mL", ["tg"]),
];

async function mapOne(r: RawExtraction): Promise<MappedRow> {
  const rows = await mapExtractions([r], dict, null);
  return rows[0];
}

describe("mapExtractions — exact and alias matching", () => {
  it("matches a verbatim label as 'exact'", async () => {
    const row = await mapOne(raw({ raw_label: "Glucose", unit: "mmol/L" }));
    expect(row.biomarkerId).toBe(1);
    expect(row.confidence).toBe("exact");
  });

  it("matches a Russian alias verbatim as 'exact'", async () => {
    const row = await mapOne(raw({ raw_label: "Глюкоза", unit: "ммоль/л" }));
    expect(row.biomarkerId).toBe(1);
    expect(row.confidence).toBe("exact");
  });

  it("matches via the English translation as 'translated'", async () => {
    // The printed label is not in the dictionary; the model's analyte_en is.
    const row = await mapOne(raw({ raw_label: "Сахар крови", analyte_en: "Glucose" }));
    expect(row.biomarkerId).toBe(1);
    expect(row.confidence).toBe("translated");
  });
});

describe("mapExtractions — fuzzy matching", () => {
  it("auto-accepts a clear OCR typo as 'fuzzy'", async () => {
    const row = await mapOne(raw({ raw_label: "Triglyceride" }));
    expect(row.biomarkerId).toBe(4);
    expect(row.confidence).toBe("fuzzy");
  });

  it("surfaces candidates without auto-accepting an ambiguous match", async () => {
    // "cholesterol" sits equally close to LDL and HDL cholesterol — the
    // ambiguity gap must keep it unmapped for the user to disambiguate.
    const row = await mapOne(raw({ raw_label: "Cholesterol" }));
    expect(row.biomarkerId).toBe(null);
    expect(row.confidence).toBe("none");
    expect(row.candidates.map((c) => c.biomarkerId).sort()).toEqual(expect.arrayContaining([2, 3]));
  });

  it("leaves pure garbage unmatched with no candidates", async () => {
    const row = await mapOne(raw({ raw_label: "qwerty zzz 123" }));
    expect(row.biomarkerId).toBe(null);
    expect(row.confidence).toBe("none");
    expect(row.candidates).toHaveLength(0);
  });
});

describe("mapExtractions — anti-collision", () => {
  it("never silently resolves an alias shared by two biomarkers", async () => {
    // "tg" is both Triglycerides and Thyroglobulin — it must NOT exact-match either.
    const row = await mapOne(raw({ raw_label: "tg" }));
    expect(row.biomarkerId).toBe(null);
  });
});

describe("mapExtractions — unit-aware differential routing", () => {
  it("routes %/absolute variants of one analyte to the right sibling", async () => {
    const bios = [
      makeBio(10, "Neutrophils", "%", ["neutrófilos segmentados"]),
      makeBio(11, "Neutrophils (absolute)", "10^9/L", ["neutrophils absolute"]),
    ];
    const mkRaw = (value: number, unit: string): RawExtraction => ({
      raw_label: "Neutrófilos Segmentados",
      analyte_en: "Segmented Neutrophils",
      value,
      unit,
      ref_range_text: null,
      page: null,
    });
    const rows = await mapExtractions([mkRaw(48.2, "%"), mkRaw(2.35, "x10^3/uL")], bios, null);
    expect(rows[0].biomarkerId).toBe(10);
    expect(rows[1].biomarkerId).toBe(11);
    expect([rows[0].duplicate, rows[1].duplicate]).toEqual([false, false]);
  });
});

describe("mapExtractions — duplicate detection & conversion", () => {
  it("flags two rows that resolve to the same biomarker as duplicates", async () => {
    const rows = await mapExtractions(
      [
        raw({ raw_label: "Glucose", unit: "mmol/L" }),
        raw({ raw_label: "глюкоза", unit: "mmol/L" }),
      ],
      dict,
      null,
    );
    expect(rows.every((r) => r.biomarkerId === 1)).toBe(true);
    expect(rows.every((r) => r.duplicate)).toBe(true);
  });

  it("attaches a conversion result to a matched row", async () => {
    const row = await mapOne(raw({ raw_label: "Glucose", value: 90, unit: "mg/dL" }));
    expect(row.conversion?.ok).toBe(true);
    if (row.conversion?.ok) expect(row.conversion.value).toBeCloseTo(5.0, 1);
  });
});

describe("mapExtractions — narrow AI disambiguation fallback", () => {
  /** Fake provider: resolves the AI step to `pick`, or throws `err` if given. */
  function fakeProvider(pick: number | null, err?: AIProviderError): AIProvider {
    return {
      id: "fake",
      async extractStructured() {
        return {};
      },
      async mapBiomarker() {
        if (err) throw err;
        return pick;
      },
      async chat() {
        return "";
      },
      async testKey() {},
    };
  }

  it("uses the provider to pick from candidates and tags the row 'ai'", async () => {
    const rows = await mapExtractions([raw({ raw_label: "Cholesterol" })], dict, fakeProvider(2));
    expect(rows[0].biomarkerId).toBe(2);
    expect(rows[0].confidence).toBe("ai");
  });

  it("leaves the row unmapped when the provider returns null", async () => {
    const rows = await mapExtractions(
      [raw({ raw_label: "Cholesterol" })],
      dict,
      fakeProvider(null),
    );
    expect(rows[0].biomarkerId).toBe(null);
    expect(rows[0].confidence).toBe("none");
  });

  it("aborts the whole batch on an auth error instead of firing N doomed calls", async () => {
    const authErr = new AIProviderError("key revoked", 401, "auth");
    await expect(
      mapExtractions([raw({ raw_label: "Cholesterol" })], dict, fakeProvider(null, authErr)),
    ).rejects.toBeInstanceOf(AIProviderError);
  });

  it("aborts on a systemic transient error (rate-limit/overloaded/network) rather than silently unmapping", async () => {
    // These fail identically on every remaining row, so a swallowed error would
    // hand back a review screen full of unmapped rows with no explanation.
    for (const kind of ["rate_limit", "overloaded", "network"] as const) {
      const err = new AIProviderError(kind, 503, kind);
      await expect(
        mapExtractions([raw({ raw_label: "Cholesterol" })], dict, fakeProvider(null, err)),
      ).rejects.toBeInstanceOf(AIProviderError);
    }
  });

  it("swallows a genuinely per-row/unexpected error and leaves that row unmapped", async () => {
    const oddball = new AIProviderError("weird one-off", 500, "unknown");
    const rows = await mapExtractions(
      [raw({ raw_label: "Cholesterol" })],
      dict,
      fakeProvider(null, oddball),
    );
    expect(rows[0].biomarkerId).toBe(null);
  });
});

describe("reconvertRow", () => {
  it("recomputes the conversion after a manual re-map", async () => {
    const index = buildBiomarkerIndex(dict);
    const [row] = await mapExtractions(
      [raw({ raw_label: "unknown", value: 90, unit: "mg/dL" })],
      dict,
      null,
    );
    expect(row.biomarkerId).toBe(null);
    row.biomarkerId = 1; // user picks Glucose on the review screen
    reconvertRow(row, index);
    expect(row.conversion?.ok).toBe(true);
    if (row.conversion?.ok) expect(row.conversion.value).toBeCloseTo(5.0, 1);
  });
});

describe("buildBiomarkerIndex / markDuplicates", () => {
  it("drops aliases shared by two biomarkers from the exact map", () => {
    const index = buildBiomarkerIndex(dict);
    expect(index.exact.has("tg")).toBe(false);
    expect(index.exact.get("glucose")).toBe(1);
  });

  it("markDuplicates is a pure recompute over biomarkerId", () => {
    const rows = [
      { biomarkerId: 1, duplicate: false },
      { biomarkerId: 1, duplicate: false },
      { biomarkerId: 2, duplicate: false },
      { biomarkerId: null, duplicate: false },
    ] as MappedRow[];
    markDuplicates(rows);
    expect(rows.map((r) => r.duplicate)).toEqual([true, true, false, false]);
  });
});
