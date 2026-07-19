import { getChatChangeSet, getChatMessage, markChatChangeSetFailed } from "@/db/chat-repos";
import {
  executeTransaction,
  type TransactionParam,
  type TransactionStatement,
} from "@/db/transaction";
import { rebuildSearchIndex } from "@/db/search";
import { recomputeFlagsForProfile } from "@/db/repos";
import { validateHealthChangeSet, type ValidatedChangeItem } from "./change-validator";
import type { HealthChange } from "./change-schema";

export type CommittedRecord = { entityType: string; entityId: number };

export async function commitHealthChangeSet(
  profileId: number,
  changeSetId: number,
): Promise<CommittedRecord[]> {
  const set = await getChatChangeSet(changeSetId);
  if (!set) throw new Error("Change set not found");
  if (set.status !== "ready" && set.status !== "draft" && set.status !== "failed") {
    throw new Error("Change set is not available for commit");
  }
  const sourceMessage = await getChatMessage(set.sourceMessageId);
  if (!sourceMessage) throw new Error("Source chat message not found");
  const selected = set.items.filter((item) => item.selected);
  if (!selected.length) throw new Error("Select at least one change");
  const revalidated = await validateHealthChangeSet(profileId, {
    summary: set.summary,
    items: selected.map((item) => item.payloadJson),
  });
  if (revalidated.items.some((item) => item.status === "blocked")) {
    throw new Error(
      revalidated.items.flatMap((item) => item.errorsJson).join(" ") || "Changes need review",
    );
  }
  for (let index = 0; index < selected.length; index++) {
    const before = selected[index].beforeJson;
    const current = revalidated.items[index].beforeJson;
    if (before && JSON.stringify(before) !== JSON.stringify(current)) {
      throw new Error("A source record changed after this draft was created. Review it again.");
    }
  }
  const statements: TransactionStatement[] = [];
  const records: Array<{ entityType: string; entityId: number | { statement: number } }> = [];
  const draftRefs = new Map<string, TransactionParam>();
  for (let index = 0; index < revalidated.items.length; index++) {
    const item = revalidated.items[index];
    const original = selected[index];
    const change = item.payloadJson as HealthChange;
    const entity = appendDomainStatement(statements, profileId, item, change, draftRefs);
    records.push({ entityType: item.entityType, entityId: entity });
    const entityParam = typeof entity === "number" ? entity : lastId(entity.statement);
    if (change.kind === "create_visit" && change.draftRef) {
      draftRefs.set(change.draftRef, entityParam);
    }
    appendProvenance(statements, {
      profileId,
      entityType: item.entityType,
      entityId: entityParam,
      sourceMessageId: sourceMessage.id,
      sourceText: sourceMessage.content,
      assertionType: assertion(change),
    });
    if (change.kind === "change_medication_regimen") {
      appendProvenance(statements, {
        profileId,
        entityType: "medication",
        entityId: change.medicationId,
        sourceMessageId: sourceMessage.id,
        sourceText: sourceMessage.content,
        assertionType: assertion(change),
      });
      appendAudit(statements, {
        profileId,
        entityType: "medication",
        entityId: change.medicationId,
        operation: "end",
        before: item.beforeJson ?? null,
        after: { ...(item.beforeJson ?? {}), endDate: dayBefore(change.effectiveDate) },
        sourceMessageId: sourceMessage.id,
      });
      appendRelation(
        statements,
        profileId,
        "medication",
        entityParam,
        "medication",
        change.medicationId,
        "successor_of",
      );
    }
    if (change.kind === "create_diagnosis" && change.visitDraftRef) {
      appendRelation(
        statements,
        profileId,
        "diagnosis",
        entityParam,
        "visit",
        requiredDraftRef(draftRefs, change.visitDraftRef),
        "diagnosed_at",
      );
    }
    if (change.kind === "create_medication_course" && change.prescribedAtVisitRef) {
      appendRelation(
        statements,
        profileId,
        "medication",
        entityParam,
        "visit",
        requiredDraftRef(draftRefs, change.prescribedAtVisitRef),
        "prescribed_at",
      );
    }
    appendAudit(statements, {
      profileId,
      entityType: item.entityType,
      entityId: entityParam,
      operation: change.kind === "change_medication_regimen" ? "create" : item.operation,
      before: item.beforeJson ?? null,
      after: item.payloadJson,
      sourceMessageId: sourceMessage.id,
    });
    statements.push({
      sql: "UPDATE chat_change_item SET status = 'committed', entity_id = ? WHERE id = ?",
      params: [entityParam, original.id],
      minRowsAffected: 1,
    });
  }
  statements.push({
    sql: "UPDATE chat_change_set SET status = 'committed', committed_at = ? WHERE id = ? AND revision = ?",
    params: [new Date().toISOString(), set.id, set.revision],
    minRowsAffected: 1,
  });
  let results;
  try {
    results = await executeTransaction(statements);
  } catch (error) {
    await markChatChangeSetFailed(set.id);
    throw error;
  }
  try {
    if (
      revalidated.items.some(
        (item) =>
          item.payloadJson.kind === "update_profile_fact" &&
          item.payloadJson.fields != null &&
          typeof item.payloadJson.fields === "object" &&
          ("sex" in item.payloadJson.fields || "birthDate" in item.payloadJson.fields),
      )
    ) {
      await recomputeFlagsForProfile(profileId);
    }
    await rebuildSearchIndex(profileId);
  } catch (error) {
    console.error("Search index refresh failed after chat commit", error);
  }
  return records.map((record) => ({
    entityType: record.entityType,
    entityId:
      typeof record.entityId === "number"
        ? record.entityId
        : results[record.entityId.statement].lastInsertId,
  }));
}

function appendDomainStatement(
  statements: TransactionStatement[],
  profileId: number,
  item: ValidatedChangeItem,
  change: HealthChange,
  draftRefs: Map<string, TransactionParam>,
): number | { statement: number } {
  if (change.kind === "create_medication_course") {
    const schedule =
      change.frequency || change.times?.length || change.scheduleNotes
        ? JSON.stringify({
            frequency: change.frequency ?? "custom",
            ...(change.times?.length ? { times: change.times } : {}),
            ...(change.scheduleNotes ? { notes: change.scheduleNotes } : {}),
          })
        : null;
    let prescriptionId: TransactionParam = null;
    if (change.prescribedAtVisitRef) {
      const prescription = insert(statements, {
        sql: "INSERT INTO prescription (visit_id, drug_name, dose_amount, dose_unit, frequency, notes) VALUES (?, ?, ?, ?, ?, ?)",
        params: [
          requiredDraftRef(draftRefs, change.prescribedAtVisitRef),
          change.name,
          change.doseAmount ?? null,
          change.doseUnit ?? null,
          change.frequency ?? null,
          change.scheduleNotes ?? null,
        ],
      });
      prescriptionId = lastId(prescription.statement);
    }
    return insert(statements, {
      sql: "INSERT INTO medication (profile_id, name, type, dose_amount, dose_unit, schedule, as_needed, start_date, end_date, purpose, prescription_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      params: [
        profileId,
        change.name,
        change.medicationType,
        change.doseAmount ?? null,
        change.doseUnit ?? null,
        schedule,
        change.asNeeded,
        change.startDate,
        change.endDate ?? null,
        change.purpose ?? null,
        prescriptionId,
      ],
    });
  }
  if (change.kind === "end_medication_course") {
    statements.push({
      sql: "UPDATE medication SET end_date = ? WHERE id = ? AND profile_id = ? AND end_date IS NULL",
      params: [change.endDate, change.medicationId, profileId],
      minRowsAffected: 1,
    });
    return change.medicationId;
  }
  if (change.kind === "change_medication_regimen") {
    const before = item.beforeJson ?? {};
    const previousSchedule =
      before.schedule && typeof before.schedule === "object"
        ? (before.schedule as Record<string, unknown>)
        : null;
    const scheduleChanged =
      change.frequency != null || change.times != null || change.scheduleNotes != null;
    const schedule = scheduleChanged
      ? JSON.stringify({
          frequency: change.frequency ?? previousSchedule?.frequency ?? "custom",
          ...(change.times != null
            ? { times: change.times }
            : Array.isArray(previousSchedule?.times)
              ? { times: previousSchedule.times }
              : {}),
          ...(change.scheduleNotes != null
            ? { notes: change.scheduleNotes }
            : typeof previousSchedule?.notes === "string"
              ? { notes: previousSchedule.notes }
              : {}),
        })
      : before.schedule
        ? JSON.stringify(before.schedule)
        : null;
    statements.push({
      sql: "UPDATE medication SET end_date = ? WHERE id = ? AND profile_id = ? AND end_date IS NULL",
      params: [dayBefore(change.effectiveDate), change.medicationId, profileId],
      minRowsAffected: 1,
    });
    return insert(statements, {
      sql: "INSERT INTO medication (profile_id, name, type, dose_amount, dose_unit, schedule, as_needed, start_date, end_date, purpose, prescription_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)",
      params: [
        profileId,
        stringField(before, "name"),
        stringField(before, "type"),
        change.doseAmount !== undefined ? change.doseAmount : numberOrNull(before.doseAmount),
        change.doseUnit !== undefined ? change.doseUnit : stringOrNull(before.doseUnit),
        schedule,
        change.asNeeded ?? Boolean(before.asNeeded),
        change.effectiveDate,
        change.purpose ?? stringOrNull(before.purpose),
        numberOrNull(before.prescriptionId),
      ],
    });
  }
  if (change.kind === "log_medication_intake") {
    const takenAt = `${change.date}T${change.time ?? "12:00"}:00.000Z`;
    return insert(statements, {
      sql: "INSERT INTO medication_log (medication_id, taken_at, taken) VALUES (?, ?, ?)",
      params: [change.medicationId, takenAt, change.taken],
    });
  }
  if (change.kind === "create_diagnosis") {
    return insert(statements, {
      sql: "INSERT INTO diagnosis (profile_id, name, icd_code, date, status, notes, resolved_date, visit_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      params: [
        profileId,
        change.name,
        change.icdCode ?? null,
        change.date,
        change.status,
        change.notes ?? null,
        change.resolvedDate ?? null,
        change.visitDraftRef ? requiredDraftRef(draftRefs, change.visitDraftRef) : null,
      ],
    });
  }
  if (change.kind === "update_diagnosis_status") {
    statements.push({
      sql: "UPDATE diagnosis SET status = ?, resolved_date = ?, notes = coalesce(?, notes) WHERE id = ? AND profile_id = ?",
      params: [
        change.status,
        change.status === "active" ? null : (change.resolvedDate ?? null),
        change.notes ?? null,
        change.diagnosisId,
        profileId,
      ],
      minRowsAffected: 1,
    });
    return change.diagnosisId;
  }
  if (change.kind === "create_allergy") {
    return insert(statements, {
      sql: "INSERT INTO allergy (profile_id, allergen, category, severity, reaction, onset_date, status, notes) VALUES (?, ?, ?, ?, ?, ?, 'active', ?)",
      params: [
        profileId,
        change.allergen,
        change.category,
        change.severity,
        change.reaction ?? null,
        change.onsetDate ?? null,
        change.notes ?? null,
      ],
    });
  }
  if (change.kind === "update_allergy_status") {
    statements.push({
      sql: "UPDATE allergy SET status = ? WHERE id = ? AND profile_id = ?",
      params: [change.status, change.allergyId, profileId],
      minRowsAffected: 1,
    });
    return change.allergyId;
  }
  if (change.kind === "log_symptom") {
    return insert(statements, {
      sql: "INSERT INTO symptom_log (profile_id, date, time, symptom_name, severity, notes) VALUES (?, ?, ?, ?, ?, ?)",
      params: [
        profileId,
        change.date,
        change.time ?? null,
        change.symptomName,
        change.severity,
        change.notes ?? null,
      ],
    });
  }
  if (change.kind === "log_weight") {
    return insert(statements, {
      sql: "INSERT INTO weight_log (profile_id, date, weight_kg, notes) VALUES (?, ?, ?, ?)",
      params: [profileId, change.date, change.weightKg, change.notes ?? null],
    });
  }
  if (change.kind === "log_blood_pressure") {
    return insert(statements, {
      sql: "INSERT INTO bp_log (profile_id, date, time, systolic, diastolic, heart_rate_bpm, position, arm_side, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      params: [
        profileId,
        change.date,
        change.time ?? null,
        change.systolic,
        change.diastolic,
        change.heartRateBpm ?? null,
        change.position ?? null,
        change.armSide ?? null,
        change.notes ?? null,
      ],
    });
  }
  if (change.kind === "merge_lifestyle_day") {
    if (item.entityId) {
      const fields = lifestyleFields(change);
      statements.push({
        sql: `UPDATE lifestyle_log SET ${fields.map(([column]) => `${column} = ?`).join(", ")} WHERE id = ? AND profile_id = ?`,
        params: [...fields.map(([, value]) => value), item.entityId, profileId],
        minRowsAffected: 1,
      });
      return item.entityId;
    }
    const fields = lifestyleFields(change);
    return insert(statements, {
      sql: `INSERT INTO lifestyle_log (profile_id, date, ${fields.map(([column]) => column).join(", ")}) VALUES (?, ?, ${fields.map(() => "?").join(", ")})`,
      params: [profileId, change.date, ...fields.map(([, value]) => value)],
    });
  }
  if (change.kind === "create_health_note") {
    return insert(statements, {
      sql: "INSERT INTO health_note (profile_id, category, title, summary, original_text, date, date_precision, date_raw, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      params: [
        profileId,
        change.category,
        change.title ?? null,
        change.summary ?? null,
        change.originalText,
        change.date ?? null,
        change.datePrecision,
        change.dateRaw ?? null,
        JSON.stringify(change.tags),
      ],
    });
  }
  if (change.kind === "create_visit") {
    return insert(statements, {
      sql: "INSERT INTO visit (profile_id, date, doctor_name, clinic, city, country, specialty, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      params: [
        profileId,
        change.date,
        change.doctorName ?? null,
        change.clinic ?? null,
        change.city ?? null,
        change.country ?? null,
        change.specialty ?? null,
        change.notes ?? null,
      ],
    });
  }
  if (change.kind === "create_imaging_record") {
    return insert(statements, {
      sql: "INSERT INTO imaging_record (profile_id, date, modality_type, body_area, findings, radiologist_name, clinic, city, country) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      params: [
        profileId,
        change.date,
        change.modalityType,
        change.bodyArea,
        change.findings ?? null,
        change.radiologistName ?? null,
        change.clinic ?? null,
        change.city ?? null,
        change.country ?? null,
      ],
    });
  }
  if (change.kind === "create_vaccine") {
    return insert(statements, {
      sql: "INSERT INTO vaccine (profile_id, vaccine_name, date, manufacturer, batch_number, dose, expires_at, administered_by, country, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      params: [
        profileId,
        change.vaccineName,
        change.date,
        change.manufacturer ?? null,
        change.batchNumber ?? null,
        change.doseNumber ?? null,
        change.expiresAt ?? null,
        change.administeredBy ?? null,
        change.country ?? null,
        change.notes ?? null,
      ],
    });
  }
  if (change.kind === "create_retest_schedule") {
    return insert(statements, {
      sql: "INSERT INTO retest_schedule (profile_id, label, interval_months, last_tested_date, notes, active) VALUES (?, ?, ?, ?, ?, true)",
      params: [
        profileId,
        change.label,
        change.intervalMonths,
        change.lastTestedDate ?? null,
        change.notes ?? null,
      ],
    });
  }
  if (change.kind === "update_profile_fact") {
    const fields = profileFields(change.fields);
    statements.push({
      sql: `UPDATE profile SET ${fields.map(([column]) => `${column} = ?`).join(", ")} WHERE id = ?`,
      params: [...fields.map(([, value]) => value), profileId],
      minRowsAffected: 1,
    });
    return profileId;
  }
  throw new Error("Unsupported health change");
}

function lifestyleFields(
  change: Extract<HealthChange, { kind: "merge_lifestyle_day" }>,
): [string, TransactionParam][] {
  const mapping: Array<[keyof typeof change, string]> = [
    ["sleepHours", "sleep_hours"],
    ["sleepQuality", "sleep_quality"],
    ["trainingMinutes", "training_minutes"],
    ["trainingIntensity", "training_intensity"],
    ["steps", "steps"],
    ["restingHeartRate", "resting_heart_rate"],
    ["stressLevel", "stress_level"],
    ["energyLevel", "energy_level"],
    ["notes", "notes"],
  ];
  return mapping.flatMap(([key, column]) =>
    change[key] == null ? [] : [[column, change[key] as TransactionParam]],
  );
}

function profileFields(
  fields: Extract<HealthChange, { kind: "update_profile_fact" }>["fields"],
): [string, TransactionParam][] {
  const mapping: Array<[keyof typeof fields, string]> = [
    ["birthDate", "birth_date"],
    ["sex", "sex"],
    ["heightCm", "height_cm"],
    ["bloodType", "blood_type"],
    ["rhFactor", "rh_factor"],
    ["ethnicity", "ethnicity"],
    ["activityLevel", "activity_level"],
    ["smoking", "smoking"],
    ["alcohol", "alcohol"],
    ["pregnancyStatus", "pregnancy_status"],
    ["citizenship", "citizenship"],
    ["languages", "languages"],
    ["emergencyNotes", "emergency_notes"],
  ];
  return mapping.flatMap(([key, column]) =>
    Object.prototype.hasOwnProperty.call(fields, key)
      ? [[column, fields[key] as TransactionParam]]
      : [],
  );
}

function insert(
  statements: TransactionStatement[],
  statement: TransactionStatement,
): { statement: number } {
  const index = statements.length;
  statements.push(statement);
  return { statement: index };
}

function appendProvenance(
  statements: TransactionStatement[],
  input: {
    profileId: number;
    entityType: string;
    entityId: TransactionParam;
    sourceMessageId: number;
    sourceText: string;
    assertionType: string;
  },
): void {
  statements.push({
    sql: "INSERT INTO record_provenance (profile_id, entity_type, entity_id, source_type, source_id, assertion_type, verification_status, raw_text) VALUES (?, ?, ?, 'chat', ?, ?, 'user_confirmed', ?)",
    params: [
      input.profileId,
      input.entityType,
      input.entityId,
      String(input.sourceMessageId),
      input.assertionType,
      input.sourceText,
    ],
  });
}

function appendAudit(
  statements: TransactionStatement[],
  input: {
    profileId: number;
    entityType: string;
    entityId: TransactionParam;
    operation: string;
    before: Record<string, unknown> | null;
    after: Record<string, unknown>;
    sourceMessageId: number;
  },
): void {
  statements.push({
    sql: "INSERT INTO record_audit_event (profile_id, entity_type, entity_id, operation, before_json, after_json, source_type, source_id) VALUES (?, ?, ?, ?, ?, ?, 'chat', ?)",
    params: [
      input.profileId,
      input.entityType,
      input.entityId,
      input.operation,
      input.before ? JSON.stringify(input.before) : null,
      JSON.stringify(input.after),
      String(input.sourceMessageId),
    ],
  });
}

function appendRelation(
  statements: TransactionStatement[],
  profileId: number,
  sourceEntityType: string,
  sourceEntityId: TransactionParam,
  targetEntityType: string,
  targetEntityId: TransactionParam,
  relationType: string,
): void {
  statements.push({
    sql: "INSERT INTO record_relation (profile_id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relation_type, assertion_type) VALUES (?, ?, ?, ?, ?, ?, 'user_confirmed')",
    params: [
      profileId,
      sourceEntityType,
      sourceEntityId,
      targetEntityType,
      targetEntityId,
      relationType,
    ],
  });
}

function assertion(change: HealthChange): string {
  return "assertionType" in change ? change.assertionType : "user_reported";
}

function lastId(statement: number): { $lastInsertId: number } {
  return { $lastInsertId: statement };
}

function dayBefore(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value) throw new Error(`Missing medication ${key}`);
  return value;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function requiredDraftRef(refs: Map<string, TransactionParam>, ref: string): TransactionParam {
  const value = refs.get(ref);
  if (value == null) throw new Error(`Missing draft reference: ${ref}`);
  return value;
}
