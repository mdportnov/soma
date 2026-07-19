import { describe, expect, it } from "vitest";
import { localIsoDate } from "./clinical-date";

describe("localIsoDate", () => {
  it("uses the requested timezone", () => {
    const instant = new Date("2026-07-19T22:30:00Z");
    expect(localIsoDate(instant, "Africa/Addis_Ababa")).toBe("2026-07-20");
    expect(localIsoDate(instant, "America/New_York")).toBe("2026-07-19");
  });
});
