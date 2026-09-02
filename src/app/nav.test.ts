import { describe, expect, it } from "vitest";
import {
  ROUTE_META,
  ancestorChain,
  isTransientRoute,
  matchRoute,
  resolveParent,
  routeTitleKey,
} from "./nav";

describe("route registry", () => {
  it("matches concrete paths to their patterns, preferring the literal route", () => {
    expect(matchRoute("/labs/42")).toBe("/labs/:id");
    expect(matchRoute("/labs/new")).toBe("/labs/new");
    expect(matchRoute("/labs/compare")).toBe("/labs/compare");
    expect(matchRoute("/imaging/new")).toBe("/imaging/new");
    expect(matchRoute("/imaging/7")).toBe("/imaging/:id");
    expect(matchRoute("/labs/42/verify")).toBe("/labs/:id/verify");
  });

  it("tolerates a trailing slash and an empty path", () => {
    expect(matchRoute("/labs/")).toBe("/labs");
    expect(matchRoute("")).toBe("/");
  });

  it("returns nothing for a path the router does not serve", () => {
    expect(matchRoute("/nope/1")).toBeUndefined();
    expect(resolveParent("/nope/1")).toBeUndefined();
    expect(ancestorChain("/nope/1")).toEqual([]);
  });

  it("substitutes params into the parent pattern", () => {
    expect(resolveParent("/labs/42/verify")).toBe("/labs/42");
    expect(resolveParent("/biomarkers/7")).toBe("/biomarkers");
    expect(resolveParent("/labs")).toBeUndefined();
  });

  it("walks the whole ancestor chain, root-most first", () => {
    expect(ancestorChain("/labs/42/verify")).toEqual(["/labs", "/labs/42"]);
    expect(ancestorChain("/biomarkers/7")).toEqual(["/biomarkers"]);
    expect(ancestorChain("/emergency")).toEqual(["/"]);
    expect(ancestorChain("/")).toEqual([]);
  });

  it("flags creation forms and the wizard as transient, and nothing else", () => {
    expect(isTransientRoute("/labs/import")).toBe(true);
    expect(isTransientRoute("/labs/new")).toBe(true);
    expect(isTransientRoute("/imaging/new")).toBe(true);
    expect(isTransientRoute("/labs/42")).toBe(false);
    expect(isTransientRoute("/labs/42/verify")).toBe(false);
    expect(isTransientRoute("/nope")).toBe(false);
  });

  it("labels every registered route and never points a parent at a gap", () => {
    for (const [path, meta] of Object.entries(ROUTE_META)) {
      expect(meta.titleKey, path).toBeTruthy();
      if (meta.parent) expect(ROUTE_META[meta.parent], path).toBeDefined();
    }
    expect(routeTitleKey("/labs/42")).toBe("nav.labResults");
    expect(routeTitleKey("/nope")).toBeUndefined();
  });
});
