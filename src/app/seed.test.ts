import { describe, expect, it } from "vitest";
import { drillState, isDrillState } from "@/app/nav-journal";
import { readSeed, seedState } from "./seed";

type Seed = { kind: "biomarker"; name: string };

describe("seed state", () => {
  it("round-trips a seed of the expected kind", () => {
    const state = seedState<Seed>({ kind: "biomarker", name: "Ferritin" });
    expect(readSeed<Seed>(state, "biomarker")).toEqual({ kind: "biomarker", name: "Ferritin" });
  });

  it("ignores a seed of another kind, and no state at all", () => {
    const state = seedState<Seed>({ kind: "biomarker", name: "Ferritin" });
    expect(readSeed(state, "labPanel")).toBeNull();
    expect(readSeed(null, "biomarker")).toBeNull();
    expect(readSeed(undefined, "biomarker")).toBeNull();
    expect(readSeed({ somaSeed: 42 }, "biomarker")).toBeNull();
  });

  it("composes with the drill flag without disturbing it", () => {
    const state = seedState<Seed>({ kind: "biomarker", name: "Ferritin" }, drillState);
    expect(isDrillState(state)).toBe(true);
    expect(readSeed<Seed>(state, "biomarker")?.name).toBe("Ferritin");
  });
});
