import { describe, expect, it } from "vitest";
import {
  allergyDeletePlan,
  findingsInsertPlan,
  imagingRecordDeletePlan,
  linkedAttachmentDeleteStatement,
  medicationDeletePlan,
  panelDeletePlan,
  panelInsertPlan,
  panelRollbackPlan,
  prescriptionDeletePlan,
  unreferencedAttachmentDeleteStatement,
  vaccineDeletePlan,
  visitDeletePlan,
} from "./tx-plans";
import type { NewLabPanel } from "./schema";

/** The table each statement touches, in order — the property under test. */
function targets(statements: { sql: string }[]): string[] {
  return statements.map((s) => {
    const match = /^(?:DELETE FROM|UPDATE|INSERT INTO)\s+(\w+)/.exec(s.sql.trim());
    if (!match) throw new Error(`unrecognised statement: ${s.sql}`);
    return match[1];
  });
}

/** `execute_transaction` rejects anything that is not INSERT/UPDATE/DELETE. */
function assertAcceptedByRustSide(statements: { sql: string }[]) {
  for (const s of statements) {
    expect(s.sql.trim().toLowerCase()).toMatch(/^(insert|update|delete) /);
  }
}

describe("panelDeletePlan", () => {
  const plan = panelDeletePlan(7);

  it("deletes children before the panel and the attachment last", () => {
    // The attachment cannot go first: lab_panel.source_file_id references it
    // with NO ACTION, so the panel has to be gone before its document.
    expect(targets(plan)).toEqual(["lab_result", "lab_finding", "lab_panel", "attachment"]);
  });

  it("passes the panel id to every statement", () => {
    for (const statement of plan) expect(statement.params).toContain(7);
  });

  it("only uses statements the transaction command accepts", () => {
    assertAcceptedByRustSide(plan);
  });
});

describe("panelRollbackPlan", () => {
  it("tears a half-written import down child-first, without touching attachments", () => {
    // The compensation used to be a bare `DELETE FROM lab_panel` that trusted
    // the cascade to remove the results — the same cascade the rest of the code
    // deliberately distrusts.
    expect(targets(panelRollbackPlan(3))).toEqual(["lab_result", "lab_finding", "lab_panel"]);
  });
});

describe("visitDeletePlan", () => {
  const plan = visitDeletePlan(11);

  it("detaches everything that survives the visit before deleting it", () => {
    expect(targets(plan)).toEqual([
      "prescription",
      "diagnosis",
      "symptom_log",
      "imaging_record",
      "visit",
      "attachment",
    ]);
  });

  it("nulls the visit link rather than deleting the records", () => {
    for (const statement of plan.slice(0, 4)) {
      expect(statement.sql).toMatch(/SET visit_id = NULL/);
    }
  });
});

describe("medicationDeletePlan", () => {
  it("removes the adherence log before the medication", () => {
    expect(targets(medicationDeletePlan(4))).toEqual([
      "medication_log",
      "medication",
      "attachment",
    ]);
  });
});

describe("vaccine, allergy and imaging plans", () => {
  it("clean up their imported source document, which they never used to", () => {
    expect(targets(vaccineDeletePlan(1))).toEqual(["vaccine", "attachment"]);
    expect(targets(allergyDeletePlan(1))).toEqual(["allergy", "attachment"]);
    expect(targets(imagingRecordDeletePlan(1))).toEqual(["imaging_record", "attachment"]);
  });

  it("scopes the cleanup to its own entity type", () => {
    expect(vaccineDeletePlan(9)[1].params).toEqual(["vaccine", 9]);
    expect(allergyDeletePlan(9)[1].params).toEqual(["allergy", 9]);
    expect(imagingRecordDeletePlan(9)[1].params).toEqual(["imaging_record", 9]);
  });
});

describe("attachment delete guards", () => {
  it("refuses to drop a document another record still points at", () => {
    // One scanned certificate commonly covers a whole series of vaccine doses;
    // deleting one dose must not take the shared document with it.
    const sql = linkedAttachmentDeleteStatement("vaccine", 2).sql;
    expect(sql).toContain("NOT EXISTS (SELECT 1 FROM vaccine WHERE vaccine.attachment_id");
    expect(sql).toContain("NOT EXISTS (SELECT 1 FROM lab_panel WHERE lab_panel.source_file_id");
    expect(sql).toContain(
      "NOT EXISTS (SELECT 1 FROM imaging_record WHERE imaging_record.attachment_id",
    );
  });

  it("guards the import compensation the same way", () => {
    const statement = unreferencedAttachmentDeleteStatement(5);
    expect(statement.params).toEqual([5]);
    expect(statement.sql).toContain("NOT EXISTS");
  });
});

describe("prescriptionDeletePlan", () => {
  it("detaches the medications in the same transaction as the delete", () => {
    const plan = prescriptionDeletePlan(6);
    expect(targets(plan)).toEqual(["medication", "prescription"]);
    expect(plan[0].sql).toMatch(/SET prescription_id = NULL/);
  });
});

const panel: NewLabPanel = {
  profileId: 1,
  date: "2026-08-20",
  labName: "Invitro",
  sampleTypes: ["blood", "urine"],
  importMethod: "ai",
};

describe("panelInsertPlan", () => {
  it("writes the panel, its results and its findings as one unit", () => {
    const plan = panelInsertPlan(
      panel,
      [
        { biomarkerId: 3, value: 12, unit: "ng/mL" },
        { biomarkerId: 4, value: 5, unit: "g/L" },
      ],
      [{ rawLabel: "HBsAg", valueText: "negative" }],
    );
    expect(targets(plan)).toEqual(["lab_panel", "lab_result", "lab_result", "lab_finding"]);
    assertAcceptedByRustSide(plan);
  });

  it("points every child at the panel's row id, resolved by the transaction", () => {
    const plan = panelInsertPlan(panel, [{ biomarkerId: 3, value: 12, unit: "ng/mL" }], []);
    expect(plan[1].params[0]).toEqual({ $lastInsertId: 0 });
  });

  it("requires each insert to affect a row, so a silent no-op rolls the panel back", () => {
    const plan = panelInsertPlan(panel, [{ biomarkerId: 3, value: 12, unit: "ng/mL" }], []);
    for (const statement of plan) expect(statement.minRowsAffected).toBe(1);
  });

  it("encodes the JSON sample_types column raw SQL cannot pass through as an array", () => {
    const [insert] = panelInsertPlan(panel, [], []);
    expect(insert.params).toContain('["blood","urine"]');
  });

  it("defaults the optional panel fields to NULL rather than dropping columns", () => {
    const [insert] = panelInsertPlan({ profileId: 1, date: "2026-01-01" }, [], []);
    // 13 columns, one placeholder each — a mismatch here is a silently shifted row.
    expect(insert.params).toHaveLength(13);
    expect(insert.sql.match(/\?/g)).toHaveLength(13);
    expect(insert.params[2]).toBeNull();
    expect(insert.params.at(-1)).toBe("manual");
  });

  it("writes a panel with no results at all as a single statement", () => {
    expect(panelInsertPlan(panel, [], [])).toHaveLength(1);
  });
});

describe("findingsInsertPlan", () => {
  it("binds an existing panel id instead of a last-insert reference", () => {
    const [statement] = findingsInsertPlan(42, [{ rawLabel: "PCR", valueText: "not detected" }]);
    expect(statement.params[0]).toBe(42);
    expect(statement.sql.match(/\?/g)).toHaveLength(8);
    expect(statement.params).toHaveLength(8);
  });
});
