/**
 * Edits and deletions of existing records drafted from chat.
 *
 * Creation has one hand-written kind per record type because every type has
 * its own duplicate and consistency rules. Editing an existing row is the same
 * operation everywhere — load the row, overlay the changed fields, check the
 * merged row, write the changed columns — so it is described here as data: the
 * table, the id field the model fills in, and how payload fields map onto
 * columns. The validator and the commit both read these specs, so a field the
 * model is allowed to send is always a field the commit knows how to write.
 */

import type { TransactionParam, TransactionStatement } from "@/db/transaction";
import {
  allergyDeletePlan,
  imagingRecordDeletePlan,
  medicationDeletePlan,
  panelDeletePlan,
  vaccineDeletePlan,
  visitDeletePlan,
} from "@/db/tx-plans";

export type UpdateSpec = {
  entityType: string;
  table: string;
  idKey: string;
  /** Payload field → SQL column. */
  columns: Record<string, string>;
  /** Payload field → row (drizzle) key, where the two names differ. */
  rowKeys?: Record<string, string>;
  /** Columns stored as JSON text. */
  json?: string[];
};

export const UPDATE_SPECS = {
  update_medication: {
    entityType: "medication",
    table: "medication",
    idKey: "medicationId",
    columns: {
      name: "name",
      medicationType: "type",
      doseAmount: "dose_amount",
      doseUnit: "dose_unit",
      asNeeded: "as_needed",
      startDate: "start_date",
      endDate: "end_date",
      purpose: "purpose",
    },
    rowKeys: { medicationType: "type" },
  },
  update_diagnosis: {
    entityType: "diagnosis",
    table: "diagnosis",
    idKey: "diagnosisId",
    columns: {
      name: "name",
      icdCode: "icd_code",
      date: "date",
      status: "status",
      resolvedDate: "resolved_date",
      notes: "notes",
    },
  },
  update_allergy: {
    entityType: "allergy",
    table: "allergy",
    idKey: "allergyId",
    columns: {
      allergen: "allergen",
      category: "category",
      severity: "severity",
      reaction: "reaction",
      onsetDate: "onset_date",
      status: "status",
      notes: "notes",
    },
  },
  update_vaccine: {
    entityType: "vaccine",
    table: "vaccine",
    idKey: "vaccineId",
    columns: {
      vaccineName: "vaccine_name",
      date: "date",
      doseNumber: "dose",
      manufacturer: "manufacturer",
      batchNumber: "batch_number",
      expiresAt: "expires_at",
      administeredBy: "administered_by",
      country: "country",
      notes: "notes",
    },
    rowKeys: { doseNumber: "dose" },
  },
  update_visit: {
    entityType: "visit",
    table: "visit",
    idKey: "visitId",
    columns: {
      date: "date",
      doctorName: "doctor_name",
      clinic: "clinic",
      city: "city",
      country: "country",
      specialty: "specialty",
      notes: "notes",
    },
  },
  update_imaging_record: {
    entityType: "imaging",
    table: "imaging_record",
    idKey: "imagingId",
    columns: {
      date: "date",
      modalityType: "modality_type",
      bodyArea: "body_area",
      findings: "findings",
      radiologistName: "radiologist_name",
      clinic: "clinic",
      city: "city",
      country: "country",
    },
  },
  update_health_note: {
    entityType: "health_note",
    table: "health_note",
    idKey: "healthNoteId",
    columns: {
      category: "category",
      title: "title",
      summary: "summary",
      originalText: "original_text",
      date: "date",
      datePrecision: "date_precision",
      dateRaw: "date_raw",
      tags: "tags",
    },
    json: ["tags"],
  },
  update_symptom: {
    entityType: "symptom",
    table: "symptom_log",
    idKey: "symptomId",
    columns: {
      symptomName: "symptom_name",
      severity: "severity",
      date: "date",
      time: "time",
      notes: "notes",
    },
  },
  update_weight: {
    entityType: "weight",
    table: "weight_log",
    idKey: "weightId",
    columns: { weightKg: "weight_kg", date: "date", notes: "notes" },
  },
  update_blood_pressure: {
    entityType: "blood_pressure",
    table: "bp_log",
    idKey: "bloodPressureId",
    columns: {
      systolic: "systolic",
      diastolic: "diastolic",
      heartRateBpm: "heart_rate_bpm",
      date: "date",
      time: "time",
      position: "position",
      armSide: "arm_side",
      notes: "notes",
    },
  },
  update_retest_schedule: {
    entityType: "retest_schedule",
    table: "retest_schedule",
    idKey: "retestScheduleId",
    columns: {
      label: "label",
      intervalMonths: "interval_months",
      lastTestedDate: "last_tested_date",
      notes: "notes",
      active: "active",
    },
  },
} as const satisfies Record<string, UpdateSpec>;

export type UpdateKind = keyof typeof UPDATE_SPECS;

export function isUpdateKind(kind: string): kind is UpdateKind {
  return Object.prototype.hasOwnProperty.call(UPDATE_SPECS, kind);
}

export const DELETABLE_ENTITY_TYPES = [
  "medication",
  "diagnosis",
  "allergy",
  "vaccine",
  "visit",
  "imaging",
  "health_note",
  "symptom",
  "weight",
  "blood_pressure",
  "lifestyle",
  "retest_schedule",
  "lab_panel",
] as const;

export type DeletableEntityType = (typeof DELETABLE_ENTITY_TYPES)[number];

export const TABLES: Record<DeletableEntityType, string> = {
  medication: "medication",
  diagnosis: "diagnosis",
  allergy: "allergy",
  vaccine: "vaccine",
  visit: "visit",
  imaging: "imaging_record",
  health_note: "health_note",
  symptom: "symptom_log",
  weight: "weight_log",
  blood_pressure: "bp_log",
  lifestyle: "lifestyle_log",
  retest_schedule: "retest_schedule",
  lab_panel: "lab_panel",
};

/** The `attachment.linked_entity_type` of each record type that can own a document. */
export const DELETE_ATTACHMENT_TYPES: Partial<Record<DeletableEntityType, string>> = {
  medication: "medication",
  allergy: "allergy",
  vaccine: "vaccine",
  visit: "visit",
  imaging: "imaging_record",
  lab_panel: "lab_panel",
};

/** The payload fields an update actually sets (undefined = unchanged, null = clear). */
export function updateFields(
  kind: UpdateKind,
  change: Record<string, unknown>,
): [field: string, value: unknown][] {
  const spec: UpdateSpec = UPDATE_SPECS[kind];
  return Object.keys(spec.columns)
    .filter((field) => change[field] !== undefined)
    .map((field) => [field, change[field]]);
}

/** The row as it will look after the update, keyed like the drizzle row. */
export function mergedRow(
  kind: UpdateKind,
  before: Record<string, unknown>,
  change: Record<string, unknown>,
): Record<string, unknown> {
  const spec: UpdateSpec = UPDATE_SPECS[kind];
  const after = { ...before };
  for (const [field, value] of updateFields(kind, change)) {
    after[spec.rowKeys?.[field] ?? field] = value;
  }
  return after;
}

/** Fields whose new value differs from the stored one. */
export function changedFields(
  kind: UpdateKind,
  before: Record<string, unknown>,
  change: Record<string, unknown>,
): string[] {
  const spec: UpdateSpec = UPDATE_SPECS[kind];
  return updateFields(kind, change)
    .filter(
      ([field, value]) =>
        JSON.stringify(value ?? null) !==
        JSON.stringify(before[spec.rowKeys?.[field] ?? field] ?? null),
    )
    .map(([field]) => field);
}

export function updateStatement(
  kind: UpdateKind,
  profileId: number,
  change: Record<string, unknown>,
): { statement: TransactionStatement; entityId: number } {
  const spec: UpdateSpec = UPDATE_SPECS[kind];
  const entityId = change[spec.idKey] as number;
  const fields = updateFields(kind, change);
  return {
    entityId,
    statement: {
      sql: `UPDATE ${spec.table} SET ${fields.map(([field]) => `${spec.columns[field]} = ?`).join(", ")} WHERE id = ? AND profile_id = ?`,
      params: [
        ...fields.map(([field, value]) =>
          spec.json?.includes(field)
            ? JSON.stringify(value)
            : ((value ?? null) as TransactionParam),
        ),
        entityId,
        profileId,
      ],
      minRowsAffected: 1,
    },
  };
}

/**
 * Child-first delete of one owned record. The first statement is an ownership
 * guard that touches nothing but fails the whole transaction when the row is
 * gone or belongs to another profile — the plans below delete by id alone.
 */
export function deleteStatements(
  entityType: DeletableEntityType,
  entityId: number,
  profileId: number,
): TransactionStatement[] {
  const guard: TransactionStatement = {
    sql: `UPDATE ${TABLES[entityType]} SET id = id WHERE id = ? AND profile_id = ?`,
    params: [entityId, profileId],
    minRowsAffected: 1,
  };
  const plan = (() => {
    switch (entityType) {
      case "medication":
        return medicationDeletePlan(entityId);
      case "allergy":
        return allergyDeletePlan(entityId);
      case "vaccine":
        return vaccineDeletePlan(entityId);
      case "visit":
        return visitDeletePlan(entityId);
      case "imaging":
        return imagingRecordDeletePlan(entityId);
      case "lab_panel":
        return panelDeletePlan(entityId);
      default:
        return [
          { sql: `DELETE FROM ${TABLES[entityType]} WHERE id = ?`, params: [entityId] },
        ] as TransactionStatement[];
    }
  })();
  return [guard, ...plan];
}
