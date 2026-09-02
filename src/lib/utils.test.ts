import { describe, it, expect, afterEach } from "vitest";
import { formatDate, formatDateIn, formatDateObject, stripEraSuffix, uiLocale } from "@/lib/utils";

/**
 * `uiLocale()` reads `<html lang>`, which the Node test environment does not
 * have. Stub just enough of it to exercise both language branches.
 */
function setLang(lang: string): void {
  (globalThis as { document?: unknown }).document = {
    documentElement: { lang },
  };
}

afterEach(() => {
  delete (globalThis as { document?: unknown }).document;
});

describe("stripEraSuffix", () => {
  it("drops the trailing era marker with and without its period", () => {
    expect(stripEraSuffix("2 сент. 2026 г.")).toBe("2 сент. 2026");
    expect(stripEraSuffix("2 сент. 2026 г")).toBe("2 сент. 2026");
    expect(stripEraSuffix("сент. 2026 г.")).toBe("сент. 2026");
  });

  it("handles non-breaking and narrow space separators", () => {
    expect(stripEraSuffix("2 \u0441\u0435\u043d\u0442. 2026\u00a0\u0433.")).toBe(
      "2 \u0441\u0435\u043d\u0442. 2026",
    );
    expect(stripEraSuffix("2 \u0441\u0435\u043d\u0442. 2026\u202f\u0433.")).toBe(
      "2 \u0441\u0435\u043d\u0442. 2026",
    );
  });

  it("keeps the month abbreviation's own period", () => {
    expect(stripEraSuffix("сент.")).toBe("сент.");
    expect(stripEraSuffix("2 сент.")).toBe("2 сент.");
  });

  it("leaves non-Russian output untouched", () => {
    expect(stripEraSuffix("2 Sept 2026")).toBe("2 Sept 2026");
    expect(stripEraSuffix("")).toBe("");
  });

  it("does not strip a year that merely ends in the letter", () => {
    expect(stripEraSuffix("Аг")).toBe("Аг");
  });
});

describe("formatDateIn", () => {
  it("formats a Russian date without the era suffix but with the month abbreviation", () => {
    const out = formatDateIn("2026-09-02", "ru-RU");
    expect(out).toBe("2 сент. 2026");
    expect(out).not.toMatch(/\sг\.?$/);
    expect(out).toContain("сент.");
  });

  it("formats an English date unchanged", () => {
    expect(formatDateIn("2026-09-02", "en-GB")).toBe("2 Sept 2026");
  });

  it("honours custom options", () => {
    expect(formatDateIn("2026-09-02", "ru-RU", { month: "short", year: "numeric" })).toBe(
      "сент. 2026",
    );
    expect(formatDateIn("2026-09-02", "ru-RU", { day: "numeric", month: "short" })).toBe("2 сент.");
  });

  it("passes through empty and unparseable input", () => {
    expect(formatDateIn(null, "ru-RU")).toBe("—");
    expect(formatDateIn(undefined, "ru-RU")).toBe("—");
    expect(formatDateIn("", "ru-RU")).toBe("—");
    expect(formatDateIn("not-a-date", "ru-RU")).toBe("not-a-date");
  });

  it("reads the date part of a full ISO instant", () => {
    expect(formatDateIn("2026-09-02T21:30:00Z", "en-GB")).toBe("2 Sept 2026");
  });
});

describe("formatDateObject", () => {
  it("strips the era suffix from a two-digit Russian year", () => {
    const d = new Date("2026-09-02T00:00:00");
    expect(formatDateObject(d, "ru-RU", { month: "short", year: "2-digit" })).toBe("сент. 26");
    expect(formatDateObject(d, "en-GB", { month: "short", year: "2-digit" })).toBe("Sept 26");
  });

  it("leaves a month-only tick alone", () => {
    const d = new Date(Date.UTC(2026, 8, 2));
    expect(formatDateObject(d, "ru-RU", { month: "short", timeZone: "UTC" })).toBe("сент.");
  });
});

describe("formatDate", () => {
  it("follows the Russian UI language and drops the era suffix", () => {
    setLang("ru");
    expect(uiLocale()).toBe("ru-RU");
    expect(formatDate("2026-09-02")).toBe("2 сент. 2026");
  });

  it("follows the English UI language", () => {
    setLang("en");
    expect(uiLocale()).toBe("en-GB");
    expect(formatDate("2026-09-02")).toBe("2 Sept 2026");
  });

  it("still renders the placeholder for missing input", () => {
    setLang("ru");
    expect(formatDate(null)).toBe("—");
  });
});
