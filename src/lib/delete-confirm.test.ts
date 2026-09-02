import { describe, expect, it } from "vitest";
import { buildDeleteConfirm, cascadeLine, deleteTargetLabel } from "./delete-confirm";

// Echoes the key plus its interpolated vars, so assertions read as "which key
// was chosen with which count" rather than depending on dictionary wording.
const t = (key: string, vars?: Record<string, string>) =>
  vars ? `${key}(${Object.entries(vars).map(([k, v]) => `${k}=${v}`)})` : key;

describe("deleteTargetLabel", () => {
  it("joins name and date", () => {
    expect(deleteTargetLabel(t, "Hepatitis B", "2 Sep 2026")).toBe("Hepatitis B, 2 Sep 2026");
  });

  it("keeps whichever part exists", () => {
    expect(deleteTargetLabel(t, "Hepatitis B", null)).toBe("Hepatitis B");
    expect(deleteTargetLabel(t, "   ", "2 Sep 2026")).toBe("2 Sep 2026");
  });

  it("falls back to a placeholder when the row has neither", () => {
    expect(deleteTargetLabel(t, null, undefined)).toBe("confirm.unnamedTarget");
  });
});

describe("cascadeLine", () => {
  it("picks the Russian plural bucket", () => {
    expect(cascadeLine(t, "ru", { key: "medicationLog", count: 1 })).toBe(
      "confirm.cascade.medicationLog.one(n=1)",
    );
    expect(cascadeLine(t, "ru", { key: "medicationLog", count: 3 })).toBe(
      "confirm.cascade.medicationLog.few(n=3)",
    );
    expect(cascadeLine(t, "ru", { key: "medicationLog", count: 12 })).toBe(
      "confirm.cascade.medicationLog.many(n=12)",
    );
  });

  it("uses one/many in English", () => {
    expect(cascadeLine(t, "en", { key: "labResult", count: 1 })).toBe(
      "confirm.cascade.labResult.one(n=1)",
    );
    expect(cascadeLine(t, "en", { key: "labResult", count: 2 })).toBe(
      "confirm.cascade.labResult.many(n=2)",
    );
  });
});

describe("buildDeleteConfirm", () => {
  it("names the entity and its target in the title", () => {
    const copy = buildDeleteConfirm(t, "ru", {
      entity: "vaccine",
      name: "Hepatitis B",
      dateLabel: "2 сент. 2026",
    });
    expect(copy.title).toBe("confirm.delete.vaccine.title(target=Hepatitis B, 2 сент. 2026)");
    expect(copy.confirmLabel).toBe("common.delete");
    expect(copy.destructive).toBe(true);
  });

  it("drops cascade entries with a zero count", () => {
    const copy = buildDeleteConfirm(t, "ru", {
      entity: "medication",
      name: "Aspirin",
      cascade: [{ key: "medicationLog", count: 0 }],
    });
    expect(copy.details).toEqual([]);
  });

  it("lists cascade lines before free-form notes", () => {
    const copy = buildDeleteConfirm(t, "en", {
      entity: "labPanel",
      name: "CBC",
      cascade: [
        { key: "labResult", count: 12 },
        { key: "labFinding", count: 1 },
      ],
      notes: ["The attached PDF is removed."],
    });
    expect(copy.details).toEqual([
      "confirm.cascade.labResult.many(n=12)",
      "confirm.cascade.labFinding.one(n=1)",
      "The attached PDF is removed.",
    ]);
  });

  it("promises a full Undo only when the page states no caveats", () => {
    const plain = buildDeleteConfirm(t, "en", { entity: "weight", name: "1 Sep", undoable: true });
    expect(plain.description).toContain("confirm.undoHint");
    expect(plain.details).toEqual([]);
  });

  it("calls Undo partial and lists what it will not bring back", () => {
    const copy = buildDeleteConfirm(t, "en", {
      entity: "medication",
      name: "Aspirin",
      undoable: true,
      cascade: [{ key: "medicationLog", count: 4 }],
      undoCaveats: ["log", "file", "log"],
    });
    expect(copy.description).toContain("confirm.undoPartial");
    expect(copy.description).not.toContain("confirm.irreversible");
    expect(copy.details).toEqual([
      "confirm.cascade.medicationLog.many(n=4)",
      "confirm.undoCaveat.log",
      "confirm.undoCaveat.file",
    ]);
  });

  it("ignores caveats when no Undo is offered at all", () => {
    const copy = buildDeleteConfirm(t, "en", {
      entity: "finding",
      name: "Ferritin",
      undoCaveats: ["file"],
    });
    expect(copy.description).toContain("confirm.irreversible");
    expect(copy.details).toEqual([]);
  });

  it("lets the caller relabel the confirm button", () => {
    const copy = buildDeleteConfirm(t, "en", {
      entity: "prescription",
      name: "Ibuprofen",
      confirmLabel: "confirm.deleteAndDetach",
    });
    expect(copy.confirmLabel).toBe("confirm.deleteAndDetach");
  });

  it("calls a delete without Undo irreversible", () => {
    const copy = buildDeleteConfirm(t, "en", { entity: "finding", name: "Ferritin" });
    expect(copy.description).toBe("confirm.delete.finding.body confirm.irreversible");
  });
});
