import { describe, expect, it } from "vitest";
import { buildCommands, commandMatches } from "./search-commands";
import { SECTION_GROUPS, type SectionGroup } from "./interests";

const ALL = new Set<SectionGroup>(SECTION_GROUPS);

describe("buildCommands", () => {
  it("offers a jump for every sidebar section plus the quick actions", () => {
    const commands = buildCommands(ALL);
    const paths = commands.map((c) => c.to);
    expect(paths).toContain("/");
    expect(paths).toContain("/vaccines");
    expect(paths).toContain("/labs");
    expect(paths).toContain("/labs/new");
    expect(paths).toContain("/labs/import");
    expect(paths).toContain("/emergency");
  });

  it("hides sections the user switched off, exactly like the sidebar", () => {
    const withoutVaccines = new Set(SECTION_GROUPS.filter((g) => g !== "vaccines"));
    const paths = buildCommands(withoutVaccines).map((c) => c.to);
    expect(paths).not.toContain("/vaccines");
    expect(paths).toContain("/labs");
  });

  it("hides an action with the section it acts on", () => {
    const withoutImaging = new Set(SECTION_GROUPS.filter((g) => g !== "imaging"));
    const paths = buildCommands(withoutImaging).map((c) => c.to);
    expect(paths).not.toContain("/imaging");
    expect(paths).not.toContain("/imaging/new");
  });

  it("never hides a core section", () => {
    const paths = buildCommands(new Set<SectionGroup>()).map((c) => c.to);
    expect(paths).toContain("/");
    expect(paths).toContain("/labs");
    expect(paths).toContain("/settings");
  });

  it("gives every command a unique id", () => {
    const ids = buildCommands(ALL).map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("commandMatches", () => {
  it("matches case- and accent-insensitively on a substring", () => {
    expect(commandMatches("Lab results", "labs")).toBe(false);
    expect(commandMatches("Lab results", "lab")).toBe(true);
    expect(commandMatches("Прививки", "прививк")).toBe(true);
    expect(commandMatches("Прививки", "ПРИВ")).toBe(true);
  });

  it("matches everything on an empty query, so the full list shows by default", () => {
    expect(commandMatches("anything", "")).toBe(true);
    expect(commandMatches("anything", "   ")).toBe(true);
  });

  it("ignores punctuation the normalizer strips", () => {
    expect(commandMatches("Emergency card", "emergency-card")).toBe(true);
  });
});
