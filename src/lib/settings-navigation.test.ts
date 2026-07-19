import { describe, expect, it } from "vitest";
import { SETTINGS_SECTIONS, settingsPath, settingsSectionFromSearch } from "./settings-navigation";

describe("settings navigation", () => {
  it.each(SETTINGS_SECTIONS)("round-trips the %s section", (section) => {
    const path = settingsPath(section);
    expect(settingsSectionFromSearch(path.slice(path.indexOf("?")))).toBe(section);
  });

  it("ignores missing and unknown sections", () => {
    expect(settingsSectionFromSearch("")).toBeNull();
    expect(settingsSectionFromSearch("?section=unknown")).toBeNull();
  });

  it("reads section independently of other query parameters", () => {
    expect(settingsSectionFromSearch("?from=assistant&section=ai&mode=setup")).toBe("ai");
  });
});
