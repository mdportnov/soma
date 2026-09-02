import { describe, expect, it } from "vitest";
import { buildHealthAgentSystem } from "./system";

const prompt = buildHealthAgentSystem({
  safetyContext: "Allergies: none recorded.",
  language: "ru",
  localDate: "2026-09-02",
  timezone: "Europe/Madrid",
});

describe("buildHealthAgentSystem", () => {
  it("routes broad, delta and vaccine questions to the review tools", () => {
    expect(prompt).toMatch(/get_health_overview FIRST/);
    expect(prompt).toMatch(/get_changes_since/);
    expect(prompt).toMatch(/get_vaccination_status/);
  });

  it("keeps the vaccine status vocabulary and the grounding contract", () => {
    expect(prompt).toMatch(/not_recorded = a childhood dose/);
    expect(prompt).toMatch(/never call it overdue/);
    expect(prompt).toMatch(/\[record:entity:id\]/);
    expect(prompt).toMatch(/must appear in a tool result of this turn/);
    expect(prompt).toMatch(/"not recorded", never "normal"/);
  });

  it("keeps the medical-safety and drafting rules", () => {
    expect(prompt).toMatch(/Never diagnose, never prescribe/);
    expect(prompt).toMatch(/draft_health_changes/);
    expect(prompt).toMatch(/Answer in Russian/);
    expect(prompt).toContain("Allergies: none recorded.");
  });
});
