import { describe, expect, it } from "vitest";
import { healthChangeSchema } from "./change-schema";
import {
  UPDATE_SPECS,
  changedFields,
  deleteStatements,
  mergedRow,
  updateStatement,
} from "./record-edits";

describe("record edits", () => {
  it("every update kind is a schema kind whose fields all map to columns", () => {
    for (const [kind, spec] of Object.entries(UPDATE_SPECS)) {
      const parsed = healthChangeSchema.parse({ kind, [spec.idKey]: 1 });
      expect(parsed.kind).toBe(kind);
      const option = healthChangeSchema.options.find(
        (candidate) => candidate.shape.kind.value === kind,
      )!;
      const fields = Object.keys(option.shape).filter(
        (key) => !["kind", "assertionType", spec.idKey].includes(key),
      );
      expect(fields.sort()).toEqual(Object.keys(spec.columns).sort());
    }
  });

  it("writes only the fields the draft sets, scoped to the profile", () => {
    const { statement, entityId } = updateStatement("update_vaccine", 7, {
      kind: "update_vaccine",
      vaccineId: 29,
      date: "2026-07-28",
      doseNumber: null,
    });
    expect(entityId).toBe(29);
    expect(statement.sql).toBe(
      "UPDATE vaccine SET date = ?, dose = ? WHERE id = ? AND profile_id = ?",
    );
    expect(statement.params).toEqual(["2026-07-28", null, 29, 7]);
    expect(statement.minRowsAffected).toBe(1);
  });

  it("serializes JSON columns", () => {
    const { statement } = updateStatement("update_health_note", 1, {
      healthNoteId: 3,
      tags: ["family"],
    });
    expect(statement.params[0]).toBe('["family"]');
  });

  it("compares against the stored row through renamed keys", () => {
    const before = { id: 1, type: "drug", startDate: "2026-01-01", endDate: null };
    expect(changedFields("update_medication", before, { medicationType: "drug" })).toEqual([]);
    expect(changedFields("update_medication", before, { medicationType: "supplement" })).toEqual([
      "medicationType",
    ]);
    expect(mergedRow("update_medication", before, { medicationType: "supplement" }).type).toBe(
      "supplement",
    );
  });

  it("guards ownership before any delete statement", () => {
    const statements = deleteStatements("vaccine", 29, 7);
    expect(statements[0]).toEqual({
      sql: "UPDATE vaccine SET id = id WHERE id = ? AND profile_id = ?",
      params: [29, 7],
      minRowsAffected: 1,
    });
    expect(statements[1].sql).toBe("DELETE FROM vaccine WHERE id = ?");
    expect(deleteStatements("weight", 4, 7)[1]).toEqual({
      sql: "DELETE FROM weight_log WHERE id = ?",
      params: [4],
    });
    expect(deleteStatements("lab_panel", 2, 7).map((s) => s.sql)[1]).toBe(
      "DELETE FROM lab_result WHERE panel_id = ?",
    );
  });
});

describe("sanitizeEvidence", () => {
  it("repairs list and bare reference shapes, dropping refs no tool returned", async () => {
    const { sanitizeEvidence } = await import("./engine");
    const refs = new Set(["vaccine:29", "lab_panel:3"]);
    expect(sanitizeEvidence("DTP [history:1, vaccine:29].", refs)).toBe("DTP [record:vaccine:29].");
    expect(sanitizeEvidence("see [record:lab_panel:3; record:lab_panel:9]", refs)).toBe(
      "see [record:lab_panel:3]",
    );
    expect(sanitizeEvidence("[link](https://x.y) [1]", refs)).toBe("[link](https://x.y) [1]");
  });
});
