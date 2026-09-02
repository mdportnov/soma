import { describe, it, expect } from "vitest";
import {
  activeFilterKeys,
  filterItems,
  groupByCategory,
  isGroupedSort,
  lastChangeRatio,
  listStatus,
  matchesStatus,
  rangeStatus,
  sortItems,
  type ListItem,
} from "./biomarker-list";

type Opts = {
  id?: number;
  name: string;
  category?: string;
  aliases?: string[];
  optimalLow?: number | null;
  optimalHigh?: number | null;
  latest?: {
    date: string;
    value: number;
    outOfRange?: boolean;
    evaluated?: boolean;
    flag?: string;
  };
  series?: { date: string; value: number }[];
};

let seq = 1;
function item(o: Opts): ListItem {
  return {
    biomarker: {
      id: o.id ?? seq++,
      canonicalName: o.name,
      category: o.category ?? "Lipids",
      aliases: o.aliases ?? [],
      optimalLow: o.optimalLow ?? null,
      optimalHigh: o.optimalHigh ?? null,
    },
    latest: o.latest
      ? {
          date: o.latest.date,
          value: o.latest.value,
          unit: "u",
          outOfRange: o.latest.outOfRange ?? false,
          flag: o.latest.flag ?? null,
          evaluated: o.latest.evaluated ?? true,
        }
      : undefined,
    series: o.series,
  };
}

const names = (xs: ListItem[]) => xs.map((x) => x.biomarker.canonicalName);

describe("rangeStatus", () => {
  it("never reports an unevaluated value as normal", () => {
    expect(
      rangeStatus(
        { optimalLow: 1, optimalHigh: 2 },
        { value: 1.5, outOfRange: false, evaluated: false },
      ),
    ).toBe("not_evaluated");
  });
  it("prefers out_of_range over the optimal band", () => {
    expect(
      rangeStatus(
        { optimalLow: 1, optimalHigh: 2 },
        { value: 1.5, outOfRange: true, evaluated: true },
      ),
    ).toBe("out_of_range");
  });
  it("is optimal only inside a defined band", () => {
    const band = { optimalLow: 1, optimalHigh: 2 };
    expect(rangeStatus(band, { value: 1.5, outOfRange: false, evaluated: true })).toBe("optimal");
    expect(rangeStatus(band, { value: 2.5, outOfRange: false, evaluated: true })).toBe("in_range");
    expect(rangeStatus({}, { value: 1.5, outOfRange: false, evaluated: true })).toBe("in_range");
  });
  it("treats a one-sided band as a threshold", () => {
    expect(rangeStatus({ optimalHigh: 2 }, { value: 0, outOfRange: false, evaluated: true })).toBe(
      "optimal",
    );
    expect(rangeStatus({ optimalLow: 2 }, { value: 0, outOfRange: false, evaluated: true })).toBe(
      "in_range",
    );
  });
  it("accepts SQLite 0/1 booleans on the list item", () => {
    const it0 = item({ name: "A", latest: { date: "2026-01-01", value: 1 } });
    it0.latest!.outOfRange = 1;
    it0.latest!.evaluated = 1;
    expect(listStatus(it0)).toBe("out_of_range");
    expect(listStatus(item({ name: "B" }))).toBe("no_data");
  });
});

describe("matchesStatus", () => {
  const optimal = item({
    name: "O",
    optimalLow: 1,
    optimalHigh: 2,
    latest: { date: "2026-01-01", value: 1.5 },
  });
  const subOptimal = item({
    name: "S",
    optimalLow: 1,
    optimalHigh: 2,
    latest: { date: "2026-01-01", value: 3 },
  });
  const noBand = item({ name: "N", latest: { date: "2026-01-01", value: 3 } });
  const high = item({
    name: "H",
    latest: { date: "2026-01-01", value: 9, outOfRange: true, flag: "high" },
  });
  const raw = item({ name: "R", latest: { date: "2026-01-01", value: 9, evaluated: false } });
  const empty = item({ name: "E" });

  it("'all' matches everything, 'with_data' excludes only never-measured", () => {
    for (const x of [optimal, subOptimal, noBand, high, raw, empty])
      expect(matchesStatus("all", x)).toBe(true);
    expect(matchesStatus("with_data", empty)).toBe(false);
    expect(matchesStatus("with_data", raw)).toBe(true);
  });
  it("'not_optimal' requires an optimal band to exist", () => {
    expect(matchesStatus("not_optimal", subOptimal)).toBe(true);
    expect(matchesStatus("not_optimal", noBand)).toBe(false);
    expect(matchesStatus("not_optimal", optimal)).toBe(false);
    expect(matchesStatus("not_optimal", high)).toBe(false);
  });
  it("exact statuses match themselves only", () => {
    expect(matchesStatus("out_of_range", high)).toBe(true);
    expect(matchesStatus("out_of_range", raw)).toBe(false);
    expect(matchesStatus("not_evaluated", raw)).toBe(true);
    expect(matchesStatus("optimal", optimal)).toBe(true);
    expect(matchesStatus("no_data", empty)).toBe(true);
    expect(matchesStatus("no_data", noBand)).toBe(false);
  });
});

describe("filterItems", () => {
  const items = [
    item({
      name: "Ferritin",
      category: "Iron",
      aliases: ["Ферритин"],
      latest: { date: "2026-01-01", value: 30 },
    }),
    item({ name: "Iron", category: "Iron" }),
    item({
      name: "LDL",
      category: "Lipids",
      latest: { date: "2026-01-01", value: 3, outOfRange: true, flag: "high" },
    }),
  ];
  it("matches name or alias, case- and diacritic-insensitive", () => {
    expect(names(filterItems(items, { query: "ферри", status: "all", category: null }))).toEqual([
      "Ferritin",
    ]);
    expect(names(filterItems(items, { query: "IRON", status: "all", category: null }))).toEqual([
      "Iron",
    ]);
  });
  it("combines category, status and query with AND", () => {
    expect(names(filterItems(items, { query: "", status: "with_data", category: "Iron" }))).toEqual(
      ["Ferritin"],
    );
    expect(
      names(filterItems(items, { query: "ldl", status: "out_of_range", category: "Iron" })),
    ).toEqual([]);
  });
  it("reports which filters are active", () => {
    expect(activeFilterKeys({ query: "  ", status: "all", category: null })).toEqual([]);
    expect(activeFilterKeys({ query: "x", status: "no_data", category: "Iron" })).toEqual([
      "query",
      "status",
      "category",
    ]);
  });
});

describe("sortItems", () => {
  const a = item({
    name: "Alpha",
    latest: { date: "2026-03-01", value: 5 },
    series: [
      { date: "2026-01-01", value: 4 },
      { date: "2026-03-01", value: 5 },
    ],
  });
  const b = item({
    name: "Beta",
    latest: { date: "2025-06-01", value: 9, outOfRange: true, flag: "high" },
    series: [
      { date: "2025-01-01", value: 3 },
      { date: "2025-06-01", value: 9 },
    ],
  });
  const c = item({
    name: "Gamma",
    latest: { date: "2026-01-15", value: 2, evaluated: false },
    series: [{ date: "2026-01-15", value: 2 }],
  });
  const d = item({ name: "Delta" });
  const all = [d, c, b, a];

  it("attention: out of range, unverified, normal, then no data — names break ties", () => {
    expect(names(sortItems(all, "attention"))).toEqual(["Beta", "Gamma", "Alpha", "Delta"]);
  });
  it("name: alphabetical regardless of data", () => {
    expect(names(sortItems(all, "name"))).toEqual(["Alpha", "Beta", "Delta", "Gamma"]);
  });
  it("recent / stale: by last measurement, never-measured always last", () => {
    expect(names(sortItems(all, "recent"))).toEqual(["Alpha", "Gamma", "Beta", "Delta"]);
    expect(names(sortItems(all, "stale"))).toEqual(["Beta", "Gamma", "Alpha", "Delta"]);
  });
  it("change: biggest relative move first, single readings next, no data last", () => {
    expect(names(sortItems(all, "change"))).toEqual(["Beta", "Alpha", "Gamma", "Delta"]);
  });
  it("does not mutate the input", () => {
    const copy = [...all];
    sortItems(all, "name");
    expect(all).toEqual(copy);
  });
  it("lastChangeRatio guards short series and division by zero", () => {
    expect(lastChangeRatio(undefined)).toBeNull();
    expect(lastChangeRatio([{ date: "d", value: 1 }])).toBeNull();
    expect(
      lastChangeRatio([
        { date: "d", value: 0 },
        { date: "e", value: 2 },
      ]),
    ).toBeNull();
    expect(
      lastChangeRatio([
        { date: "d", value: -4 },
        { date: "e", value: -2 },
      ]),
    ).toBeCloseTo(0.5);
  });
});

describe("grouping", () => {
  it("keeps categories only for order-preserving sorts", () => {
    expect(isGroupedSort("attention")).toBe(true);
    expect(isGroupedSort("name")).toBe(true);
    expect(isGroupedSort("recent")).toBe(false);
    expect(isGroupedSort("stale")).toBe(false);
    expect(isGroupedSort("change")).toBe(false);
  });
  it("groups in first-seen order and preserves item order inside a group", () => {
    const g = groupByCategory([
      item({ name: "B", category: "Y" }),
      item({ name: "A", category: "X" }),
      item({ name: "C", category: "Y" }),
    ]);
    expect([...g.keys()]).toEqual(["Y", "X"]);
    expect(names(g.get("Y")!)).toEqual(["B", "C"]);
  });
});
