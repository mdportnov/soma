# PRD: AI chat as a health-data agent

Status: implementation-ready design  
Date: 2026-07-19  
Scope: in-app AI chat, conversational health-data capture, retrieval, evidence, confirmation, and persistence

## 1. Product outcome

The chat becomes a controlled interface to the Soma record, not a separate conversation that happens to know a summary.

A user can write:

> С 3 июня принимаю левотироксин 50 мкг утром натощак. Его назначил эндокринолог после диагноза «гипотиреоз».

Soma must:

1. Extract a medication course, a diagnosis, the explicit relationship between them, and any stated visit context.
2. Resolve dates relative to the user's locale and current date without inventing missing precision.
3. Compare the proposed facts with existing records.
4. Show editable change cards before anything reaches the source-of-truth tables.
5. Commit all approved changes atomically and attach provenance back to the exact chat message.
6. Refresh retrieval immediately so the next answer knows about the committed data.
7. Use the saved records in later questions, with visible links to the records supporting an answer.

The feature is successful when chat capture and manual forms produce the same validated domain records, while the user can always see what was interpreted, what was assumed, what was not saved, and which records were used in an answer.

## 2. Current-state audit

The existing implementation is a read-only, static-context chat:

- `AiAnalysis.tsx` loads `buildHealthContext(profileId)` once when the page query runs.
- The context contains profile basics, active allergies, active diagnoses, current medications, latest abnormal labs, and a 30-day lifestyle aggregate.
- `AIProvider.chat` accepts only text messages and returns only text. There are no tool calls or structured assistant events.
- The conversation is stored in `localStorage`, capped at 40 messages. It is not part of backup, provenance, search, or the medical record.
- User statements in chat are never parsed into domain entities and never written to SQLite.
- Data added elsewhere while the chat stays open is not guaranteed to enter the already-built context.
- Retrieval is all-or-nothing: a compact snapshot is always sent, but the model cannot ask for a specific diagnosis history, medication course, record detail, visit, imaging finding, or arbitrary time window.
- Answers have no record-level evidence references.

The MCP sidecar already demonstrates useful pieces—structured reads, validated writes, dry runs, schema gating—but it is not the correct write boundary for the in-app chat. Its tools write directly after an environment-level opt-in and do not provide an in-app approval queue, a cross-entity transaction, or chat-message provenance.

## 3. Non-negotiable invariants

1. The model never commits medical data directly.
2. Every mutation starts as a local, typed, editable change set.
3. The host application, not the model, validates types, dates, units, profile ownership, state transitions, and duplicates.
4. Confirmation refers to an immutable change-set revision. Editing a card creates a new revision and invalidates prior confirmation.
5. A multi-record change set commits atomically. Partial saves are forbidden.
6. The system stores only explicit user or source claims. Model inference can guide a question or a warning, but cannot silently become a medical fact.
7. A clinician's diagnosis, the user's own suspicion, a model hypothesis, and a document extraction are distinct assertion types.
8. Approximate or missing dates remain approximate or missing. The system never turns “in May” into an apparently exact May 1 without retaining and displaying month precision.
9. Absence of a record means “not recorded,” never “none” or “normal.”
10. Safety context is always loaded before health interpretation: active allergies, current medications and supplements, active diagnoses, pregnancy status where applicable, and critical recent measurements.
11. Tool and record content is untrusted data. Notes and imported text can never override system instructions.
12. Every committed record created or changed through chat has durable provenance and an audit event.
13. A deleted chat thread does not delete medical records created from it. It only removes conversational presentation after a clear retention warning.
14. Retrieval is scoped to the active profile at the host layer. The model cannot choose or override `profileId`.

## 4. Capability map

| User intent                           | Chat behavior                                                                               | Target data                                | Confirmation                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------- |
| “С 3 июня принимаю X”                 | Draft a medication course                                                                   | `medication`                               | Required                                             |
| “Снизил X с 50 до 25 мкг”             | End the old regimen and create the new regimen as one transaction                           | two `medication` course rows plus relation | Required                                             |
| “Сегодня выпил X”                     | Resolve the active course and draft an intake event                                         | `medication_log`                           | Required initially; quick-log can be an opt-in later |
| “Мне поставили диагноз X”             | Draft a diagnosis with the correct assertion type                                           | `diagnosis`                                | Required                                             |
| “Думаю, что у меня X”                 | Do not draft a diagnosis; optionally store a concern note or symptom facts                  | `health_note` and/or `symptom_log`         | Required for stored note                             |
| “Аллергия на X”                       | Draft allergy; preserve unknown severity rather than guessing                               | `allergy`                                  | Required, safety warning shown                       |
| “Вчера болела голова на 7/10”         | Draft symptom event                                                                         | `symptom_log`                              | Required initially                                   |
| “Давление 145/92 сегодня утром”       | Draft BP event, derive warning locally                                                      | `bp_log`                                   | Required initially                                   |
| “Вес 81.4 кг”                         | Draft weight event                                                                          | `weight_log`                               | Required initially                                   |
| “Спал 6 часов, стресс 4/5”            | Merge fields into that day's lifestyle row                                                  | `lifestyle_log` upsert                     | Required initially                                   |
| “Сделал МРТ колена…”                  | Draft imaging record; retain stated finding wording                                         | `imaging_record`                           | Required                                             |
| “Мне сделали вакцину…”                | Draft vaccine dose                                                                          | `vaccine`                                  | Required                                             |
| “Перепроверь ферритин через 3 месяца” | Draft retest schedule                                                                       | `retest_schedule`                          | Required                                             |
| “Что изменилось после начала X?”      | Retrieve medication period plus overlapping biomarkers, symptoms, BP, weight, and lifestyle | read-only tools                            | None                                                 |
| “Что ты знаешь про мой X?”            | Search, resolve matching records, then fetch details                                        | read-only tools                            | None                                                 |
| “Удали/исправь/я ошибся”              | Resolve the exact record, show before/after, apply domain guards                            | update/end/delete change                   | Required; destructive actions elevated               |
| Chat attachment                       | Hand off to the existing document import modules and return a review change set             | attachment plus typed records              | 100% review                                          |

The first release supports create, update, end, and merge. Hard delete through chat is limited to non-safety-critical accidental entries. Allergies with anaphylactic severity and append-only vaccine history keep their existing domain guards.

### 4.1 Complete storage coverage

| Soma domain                | Read through chat                              | Conversational write                                        | Distribution decision                                                               |
| -------------------------- | ---------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Profile demographics       | Safety capsule and explicit profile read       | Elevated `update_profile_fact`                              | Store only explicit identity/physiology facts; do not overwrite from casual wording |
| Height/current weight      | Profile plus weight trend                      | Height updates profile; dated weight creates `weight_log`   | A dated measurement is an event, not only a profile snapshot                        |
| Target weight              | Profile/goal read                              | `update_weight_goal`                                        | Requires explicit goal language and unit                                            |
| Blood type/Rh              | Safety capsule                                 | Elevated `update_profile_fact`                              | Never infer from a document unless the extracted field is reviewed                  |
| Smoking/alcohol/activity   | Profile/context read                           | `update_profile_fact`                                       | Preserve explicit status; lifestyle-day statements remain daily logs                |
| Pregnancy status           | Safety capsule when applicable                 | Elevated `update_profile_fact`                              | No model inference; explicit current status only                                    |
| Emergency/insurance fields | Explicit read only, never automatic AI context | Elevated write only after direct request                    | Excluded from ordinary provider payloads                                            |
| Biomarker dictionary       | Name resolution and ranges                     | Read-only in chat                                           | Dictionary edits stay in the dedicated manual UI                                    |
| Lab panels/results         | Trend and panel reads                          | Small complete panels only; bulk data goes to Import Wizard | Collection date, unit, and biomarker mapping are mandatory                          |
| Visits                     | History/detail read                            | Create/correct                                              | One visit can own diagnoses and prescriptions from the same statement               |
| Prescriptions              | Linked visit/medication read                   | Create as part of a prescription/visit statement            | Distinct from what the user actually took                                           |
| Medication courses         | Current safety capsule and full history        | Create/end/change/correct                                   | One row per historical regimen period                                               |
| Medication intake          | Optional adherence read                        | Log taken/skipped event                                     | Must resolve one specific course                                                    |
| Diagnoses                  | Active safety capsule and history              | Create/status change/correct                                | Assertion source and unknown status are preserved                                   |
| Allergies                  | Always-on active safety context and history    | Create/resolve/correct                                      | Adverse reaction is not silently upgraded to allergy                                |
| Vaccines                   | History/expiry read                            | Create/correct                                              | Append-only after commit                                                            |
| Symptoms                   | Trend and event reads                          | Create/correct                                              | Vague patterns route to `health_note`                                               |
| Imaging                    | History/detail read                            | Create/correct                                              | Findings preserve source wording                                                    |
| BP                         | Trend/critical read                            | Create/correct                                              | Flags are computed locally                                                          |
| Lifestyle                  | Summary/day read                               | Same-day merge/correct                                      | Missing fields are not erased during merge                                          |
| Retest schedules           | Active/due read                                | Create/pause/correct                                        | A reminder is not presented as a clinical recommendation                            |
| Attachments                | Metadata and explicit open action              | Chat upload reuses Import Wizard                            | Raw contents are never part of routine retrieval                                    |
| General health facts       | FTS and explicit detail read                   | `health_note` fallback                                      | Visible destination for unsupported or non-discrete facts                           |
| Chat and drafts            | Thread history                                 | Local persistence only                                      | Not treated as medical facts until an approved commit                               |

Profile writes are deliberately narrower than profile reads. The chat may propose a typed profile update only when the user clearly states a durable fact or asks to change it. It must not turn conversational context such as “я сейчас много хожу” into a permanent activity-level change.

## 5. End-to-end turn flow

> User message  
> → persist message locally  
> → load always-on safety capsule  
> → model requests local read tools when needed  
> → host executes scoped reads and returns structured results  
> → model either answers or submits `draft_health_changes`  
> → host validates, normalizes, deduplicates, and risk-scores the draft  
> → UI renders answer plus change cards  
> → user edits, excludes, confirms, or discards  
> → application service revalidates the immutable revision  
> → one local transaction commits records, relations, provenance, audit, and FTS refresh marker  
> → UI emits a deterministic saved result with record links  
> → safety capsule and query cache are invalidated

The model can read during a turn but cannot call a commit tool. `Confirm` is a host UI action, not a prompt interpreted by the model.

### 5.1 Turn state machine

`queued -> running -> waiting_for_user | completed | failed | cancelled`

A change set has an independent state:

`draft -> needs_clarification | ready -> committing -> committed | failed | discarded | superseded`

The user can continue chatting while a change set is pending. A later correction can supersede the pending revision. It must not mutate an already-rendered revision in place.

### 5.2 Agent-loop limits

- Maximum 6 model rounds per user turn.
- Maximum 12 read-tool calls per turn.
- Maximum 50 records returned across all tools unless the user explicitly requests export-like breadth.
- Maximum 20 proposed change items in one change set; larger imports move to Import Wizard.
- Tool results are compact JSON with stable record references, not rendered prose.
- Independent read calls execute in parallel after the model requests them.
- The engine stops immediately when it receives a valid write draft; further model activity cannot change that draft revision.

## 6. Conversational ingestion and distribution

### 6.1 One message may produce many records

The extraction unit is a `change_set`, not a single entity. For example:

> 12 июля был у эндокринолога Ивановой в MedSwiss. Поставили гипотиреоз и назначили Эутирокс 50 мкг ежедневно натощак с 13 июля.

Produces:

- one `visit` on July 12;
- one clinician-diagnosed `diagnosis` linked to the visit;
- one `prescription` linked to the visit;
- one `medication` course starting July 13 and linked to the prescription;
- provenance rows for all created records pointing to the same source message;
- explicit relations, not a model-inferred causal relationship.

The review UI groups these under one heading and lets the user exclude or edit individual items. Dependency rules are visible: excluding the visit keeps the diagnosis and medication but removes their visit/prescription links; excluding the medication also excludes a medication-specific intake event in the same draft.

### 6.2 Entity routing rules

#### Medication and supplement

- A `medication` row is one intake regimen over one continuous period.
- A drug and a supplement use the same table; `type` distinguishes them.
- A dose, frequency, timing, formulation, or route change ends the old regimen and creates a successor regimen. Updating the original row would corrupt historical trend correlation.
- “Перестал принимать X вчера” updates `endDate` on the matching active course.
- “Сегодня выпил X” creates `medication_log`, not a new medication course.
- Combination products remain one course by product name unless the user explicitly describes separately dosed ingredients. Ingredient normalization is not inferred.
- Brand and active ingredient can be preserved in `name` and notes in v1. A normalized drug dictionary is a later capability, not a prerequisite for safe capture.
- `asNeeded` is set only from explicit phrases such as “по необходимости” or equivalent.
- If the user does not identify drug versus supplement, store `unknown` after the schema supports it or ask only when classification changes behavior. Never default an unknown drug to supplement.

#### Diagnosis

- “Врач поставил/подтвердил” becomes `clinician_diagnosed` provenance.
- “В выписке указан” becomes `documented` provenance.
- “У меня X” becomes `user_reported`; it is not upgraded to clinician-diagnosed.
- “Кажется/подозреваю/ИИ сказал” does not create a diagnosis. It can create a `health_note` with category `concern` if the user chooses to save it.
- The current status is `unknown` unless active, remission, or resolved is explicit. Existing `active` default is not used for chat capture.
- ICD codes are stored only when explicitly provided by the user/source or deterministically present in a reviewed document. The model never invents a code.

#### Allergy and adverse reaction

- A claimed allergy creates an allergy draft even if reaction or severity is missing.
- Missing severity is `unknown`, not `mild`.
- “От X была тошнота” is an adverse reaction, not automatically an allergy. The draft asks whether to store it as an allergy or as a medication note/health note.
- Anaphylaxis is never inferred from “сильная аллергия”; it requires an explicit description or user selection.
- Duplicate matching uses normalized allergen text and aliases but never automatically merges two safety records.

#### Symptom

- A symptom event needs an occurrence date or a clearly current relative date.
- Severity may be unknown; forcing a 1–10 score causes invented data and unnecessary friction.
- Recurrent or vague statements such as “последние месяцы часто болит голова” become a symptom-pattern `health_note` unless individual dates are provided.
- The model may suggest logging future occurrences but cannot fabricate a time series from a frequency description.

#### Measurement and lifestyle

- BP, weight, pulse, sleep, steps, stress, energy, and training route to their existing typed logs.
- Units are converted locally. If a weight unit is absent, the UI can preselect the profile display unit as an explicit visible assumption; the value is not committed until confirmed.
- BP is stored in mmHg. Crisis and stage flags are computed by local code, never supplied by the model.
- Lifestyle uses a same-day upsert. The change card shows existing versus merged fields so a partial chat update cannot silently erase fields entered earlier.
- A statement that covers a range (“всю неделю спал около 6 часов”) becomes a summarized health note in v1, not seven invented daily logs.

#### Lab result

- A numeric lab result requires analyte resolution, value, unit, and collection date before it becomes a `lab_result`.
- The existing biomarker dictionary and unit conversion remain authoritative.
- Ambiguous analytes or units require clarification. The model cannot create a custom biomarker from chat without a separate explicit flow.
- Multiple values from the same date can form one proposed panel. A pasted report with many rows is redirected to Import Wizard for review.

#### Visit, imaging, vaccine, retest

- These map to their existing typed tables and use current domain guards.
- Imaging findings retain source wording; the model can create a separate non-persisted explanation but cannot rewrite findings as fact.
- Vaccines are append-only after commit; corrections are explicit updates with audit history.
- A retest reminder is distinct from medical advice. The chat creates it only from an explicit user request.

#### Unsupported or ambiguous fact

No meaningful user fact is silently dropped. If a statement cannot safely map to a typed record, the change set can propose `health_note` with:

- original user wording;
- optional concise summary;
- category;
- temporal precision;
- tags and links to related records;
- provenance.

The card must say why it is going to Notes rather than a typed section. The user can discard it or provide clarification.

### 6.3 Date semantics

Every conversational date carries four values:

- normalized anchor used for sorting;
- precision: `day | month | year | approximate | range | unknown`;
- optional lower and upper bounds used for overlap queries;
- original phrase, such as `в начале мая`.

Rules:

- Relative dates are resolved using the profile timezone and the turn's captured local date/time.
- Numeric dates such as `05/06/2026` are ambiguous unless locale makes them unambiguous; otherwise ask.
- “С мая” becomes May precision with bounds May 1–31, not an exact May 1 claim.
- “Около двух недель назад” stays approximate and displays as such.
- “Давно” or “несколько лет” remains unknown unless the user supplies a better bound.
- Future dates are valid for plans and retest schedules but invalid for completed intake, diagnosis, lab draw, vaccine administration, or symptom occurrence.
- The confirmation card always displays the interpretation of a relative or partial date.

## 7. Persistence model

### 7.1 Durable chat tables

Replace `localStorage` as the source of truth with SQLite:

`chat_thread`

- `id`, `profileId`, `title`, `status`, `createdAt`, `updatedAt`, `archivedAt`.

`chat_message`

- `id`, `threadId`, `role`, `content`, `turnStatus`, `providerId`, `modelId`, `createdAt`.
- Assistant text is stored separately from tool payloads.
- The raw user message is immutable after it has produced a committed change set; corrections are new messages.

`chat_tool_event`

- `id`, `messageId`, `toolName`, `argumentsJson`, `resultSummaryJson`, `status`, `durationMs`, `createdAt`.
- Sensitive full tool results are not duplicated when record references are enough.
- Provider request/response bodies and API keys are never persisted.

`chat_change_set`

- `id`, `threadId`, `sourceMessageId`, `revision`, `status`, `riskLevel`, `createdAt`, `committedAt`.

`chat_change_item`

- `id`, `changeSetId`, `operation`, `entityType`, `entityId`, `payloadJson`, `beforeJson`, `status`, `warningsJson`, `candidateMatchesJson`, `confidence`.
- `entityId` is required for update/end/delete and absent for create.
- `beforeJson` enables an exact diff, optimistic concurrency check, and audit explanation.

### 7.2 Provenance and audit

`record_provenance`

- `id`, `profileId`, `entityType`, `entityId`;
- `sourceType`: `chat | manual | document | mcp | integration`;
- `sourceId`: message, attachment, or external source identifier;
- `assertionType`: `user_reported | clinician_diagnosed | documented | measured | device_recorded`;
- `verificationStatus`: `user_confirmed | manually_reviewed | unverified`;
- `rawText`, `createdAt`.

`record_audit_event`

- `id`, `profileId`, `entityType`, `entityId`, `operation`, `beforeJson`, `afterJson`, `sourceType`, `sourceId`, `createdAt`.
- Audit events are append-only.
- Undo is implemented as a compensating audited mutation, not deletion of history.

`record_relation`

- polymorphic source and target references;
- `relationType`: `prescribed_at | diagnosed_at | treats | successor_of | reaction_to | associated_with`;
- `assertionType`: `explicit | user_confirmed`.

Model-inferred relationships are not persisted in `record_relation`. They can exist only as ephemeral answer text or retrieval hypotheses and are never shown as established causality.

### 7.3 Schema corrections needed for honest chat capture

Current required/default fields force the model to invent data. Before enabling conversational writes:

- `medication.startDate` must support unknown or partial dates; add date precision/raw/bounds.
- `medication.type` needs `unknown`; chat must not inherit `supplement` as a silent default.
- `medication` needs `notes` and an optional end reason.
- `diagnosis.date` must support unknown or partial dates.
- `diagnosis.status` needs `unknown`; chat must not silently default to active.
- `allergy.severity` needs `unknown`.
- `symptom_log.severity` must be nullable or support unknown.
- Date-bearing clinical entities need shared precision semantics rather than fake exact dates.
- Add `health_note` as the lossless fallback for facts that do not fit a typed table.

The existing exact-date columns can remain as sort anchors during migration, but UI and retrieval must use precision/bounds. A helper module owns parsing, rendering, overlap, and validation so every entity behaves consistently.

### 7.4 Medication history rule

A dose or schedule change is a compound domain command:

`change_medication_regimen(activeMedicationId, effectiveDate, successorFields)`

It must:

1. Ensure the selected course is active on the effective date.
2. End the old course on the day before the new regimen starts when day precision exists; otherwise preserve a non-overlapping bounded transition without inventing a day.
3. Create the successor course.
4. Link it with `successor_of`.
5. Commit both records, provenance, and audit together.

This preserves historical dosage overlays. A plain `updateMedication` is reserved for correcting a typo in the original record, not changing a real-world regimen.

## 8. Local tool contract

### 8.1 Read tools

The in-app engine gets a dedicated tool registry backed by application services, not the MCP process:

- `get_safety_context()`
- `find_records({ query, entityTypes?, statuses?, from?, to?, limit? })`
- `get_record({ ref })`
- `get_medication_history({ query?, from?, to?, includeIntake? })`
- `get_diagnosis_history({ query?, statuses?, from?, to? })`
- `get_biomarker_trend({ biomarkerId, from?, to?, includeOverlays? })`
- `get_symptom_trend({ symptomName, from?, to? })`
- `get_vitals_trend({ kind, from?, to? })`
- `get_lifestyle_summary({ from, to, granularity })`
- `get_timeline_slice({ from?, to?, entityTypes?, limit? })`
- `get_data_coverage()`

Tool arguments never contain `profileId`; the engine injects it from the active session. Results contain opaque refs such as `medication:42`, compact fields, and completeness metadata.

`find_records` uses structured filters plus FTS. FTS is candidate retrieval, not the source of truth. Every selected candidate is re-read from its source table before being used or cited.

### 8.2 Draft tool

There is one provider-visible mutation tool:

`draft_health_changes({ summary, items })`

`items` is a discriminated union of domain commands, not arbitrary table/column access:

- `create_medication_course`
- `end_medication_course`
- `change_medication_regimen`
- `log_medication_intake`
- `create_or_update_diagnosis`
- `create_or_update_allergy`
- `log_symptom`
- `log_weight`
- `log_blood_pressure`
- `merge_lifestyle_day`
- `create_visit`
- `create_imaging_record`
- `create_vaccine`
- `create_retest_schedule`
- `create_health_note`
- `update_profile_fact`
- `update_weight_goal`
- `correct_record`

The host converts tool arguments into a draft and returns validation results. It never executes the domain commands during the agent loop.

The model cannot propose:

- arbitrary SQL;
- profile reassignment;
- changing IDs or provenance;
- bypassing append-only or anaphylaxis guards;
- computed flags;
- audit deletion;
- direct commit.

### 8.3 Validation pipeline

Every draft passes the same ordered pipeline:

1. JSON-schema and Zod shape validation.
2. String trimming, Unicode normalization, decimal and unit parsing.
3. Semantic date validation and precision derivation.
4. Entity-specific enum and plausibility checks.
5. Exact and fuzzy candidate lookup against the active profile.
6. Duplicate and temporal-overlap detection.
7. Domain transition guards.
8. Dependency graph validation across change items.
9. Risk scoring and required-confirmation calculation.
10. Immutable revision hash generation.

Hard errors prevent confirmation. Soft warnings remain visible but can be confirmed. Model confidence never overrides a hard error.

### 8.4 Duplicate and conflict policy

The validator returns one of:

- `new`: no meaningful match;
- `exact_duplicate`: same entity and clinically relevant fields;
- `possible_duplicate`: similar name/date/details;
- `update_candidate`: one existing record is the likely intended target;
- `conflict`: incompatible status, overlapping regimen, or materially different value;
- `ambiguous_target`: multiple possible existing records.

Rules:

- Exact duplicates default to excluded.
- Possible duplicates require the user to select create, merge, or update.
- Two active courses with the same normalized medication and overlapping intervals are a conflict unless explicitly separate formulations/regimens.
- A diagnosis with the same normalized name is usually a status/history update, not a new diagnosis.
- A vaccine with matching name, date, dose, and batch is an exact duplicate.
- Same-date BP, symptom, and medication intake events may be valid repeats; time and source determine duplication.
- The model never decides a safety-critical merge by itself.

## 9. Retrieval and reasoning

### 9.1 Context layers

#### Layer A: always-on safety capsule

Built fresh at the start of every turn and after every commit:

- age or birth date, biological sex where recorded, pregnancy status where relevant;
- active allergies and reaction severity;
- current drugs, supplements, dose, frequency, PRN status, and start precision;
- active diagnoses plus separately labeled unknown-status diagnoses;
- recent crisis-level BP or critical lab flags;
- data-coverage statements such as “allergy history not recorded.”

This capsule is bounded and deterministic. It does not include the user's name, emergency contact, insurance details, raw notes, or unrelated historical records.

#### Layer B: intent-specific structured retrieval

The model requests only the records needed for the question. Examples:

- Effect of a supplement: medication history, relevant biomarkers, symptoms, BP/weight, lifestyle confounders over the same window.
- Diagnosis history: diagnosis rows, linked visits, prescriptions, imaging, and relevant attachments metadata.
- “What changed this month?”: a timeline slice plus current-versus-prior summaries.

#### Layer C: lexical evidence retrieval

FTS covers names and user-authored text. The model can expand a query into synonyms, but the host executes and ranks it. A later optional local embedding index may improve conceptual retrieval, but v1 does not require sending the entire record or notes to an embedding API.

#### Layer D: source detail

The model fetches a full record only after a candidate is selected. Attachment contents are never automatically sent. A raw document requires an explicit user action and the import privacy notice.

### 9.2 Evidence contract

Read tools return stable refs. The assistant may cite only returned refs. The renderer validates refs and converts them to record chips/deep links.

An answer distinguishes:

- `Recorded fact`: directly supported by a record.
- `Calculated`: locally derived delta, average, overlap, or flag.
- `Possible interpretation`: model explanation, explicitly non-causal.
- `Missing data`: information required for a stronger conclusion.

Invalid or hallucinated refs are removed and logged as an answer-quality failure. Safety-critical claims without evidence cause the turn to fail closed into a cautious response.

### 9.3 Correlation, not causation

For “что изменилось после начала X,” the local tool computes time windows and returns:

- exact/approximate medication start bounds;
- before and after marker summaries;
- overlapping medication and supplement changes;
- symptom, BP, weight, and lifestyle coverage;
- missingness and number of observations.

The model explains the structured result. It cannot claim the medication caused a change. When data is sparse, it says so and identifies what would make comparison stronger.

### 9.4 Data freshness and cache invalidation

- Every turn receives a fresh safety capsule.
- Read tools query source tables, not a page-mount snapshot.
- FTS updates in the same logical commit or is marked dirty and rebuilt before the next search.
- Trend interpretation cache keys include record IDs plus `updatedAt`/audit revision so corrections invalidate old text.
- The UI shows the record cutoff timestamp for answers that depend on a bounded snapshot.

## 10. Provider architecture

The current `chat(messages, systemPrompt)` interface is insufficient. Replace it with a provider-neutral `runAgentTurn({ messages, system, tools, toolChoice, signal })` call. It returns either a final message with content and evidence refs, or normalized tool calls with usage and finish reason.

Adapters translate this contract to native provider mechanisms:

- OpenAI Responses function tools;
- Anthropic tool use/content blocks;
- Gemini function declarations/function calls;
- OpenRouter Chat Completions tool calls.

Each configured model advertises capabilities: `chat`, `nativeTools`, `structuredOutput`, `vision`, and `pdf`. Conversational writes require `nativeTools`. Unsupported custom models retain the current read-only text chat with a visible “structured record updates unavailable for this model” state. A free-form JSON imitation is not accepted as a write draft.

Tool-call IDs, arguments, results, finish reasons, usage, cancellation, and provider errors are normalized in the base layer. The orchestration loop is provider-independent and unit-testable with a fake provider.

### 10.1 System instruction responsibilities

The system instruction tells the model to:

- use read tools instead of relying on conversation memory for medical facts;
- draft only explicit facts and label the assertion source;
- never infer diagnosis, allergy severity, dose, unit, date, or status;
- ask one focused clarification when a required distinction cannot be represented safely;
- preserve source wording in notes/findings;
- use returned record refs for claims;
- call `draft_health_changes` when the user is providing or correcting persistent data;
- answer without drafting when the user is merely discussing a hypothetical or asking a question.

Business rules remain in host code. Prompt text is not a security or correctness boundary.

## 11. Confirmation UX

### 11.1 Change cards

The assistant message can contain normal text followed by a deterministic host-rendered panel:

`Распознано 3 изменения`

Each card shows:

- operation and destination, such as `Add to Medications`;
- normalized fields;
- original phrase for transformed dates/units;
- assertion badge: `Reported by you`, `Diagnosed by clinician`, `From document`;
- duplicate/conflict warnings;
- editable fields and an include toggle;
- link and before/after diff for updates;
- why a field is missing or why a note was used as fallback.

Actions:

- `Save selected`;
- `Edit`;
- `Discard`;
- `Clarify in chat` when blocked;
- `Open existing record` for duplicates.

The save button states the actual operation count, for example `Save 2 records and update 1`.

### 11.2 Risk levels

- Standard: symptoms, lifestyle, weight, routine BP, notes, intake logs.
- Elevated: medications/supplements, diagnoses, allergies, vaccines, lab results, profile safety fields.
- Destructive: hard delete, resolving anaphylactic allergy, replacing conflicting clinical data.

All levels require preview in the first release. Elevated cards show provenance and conflicts prominently. Destructive actions require a separate explicit control and cannot be bundled with unrelated standard changes.

### 11.3 Correction behavior

- If a change set is pending, “нет, 25 мкг, не 50” revises the pending item and displays a new revision.
- If it was committed, the same phrase creates a correction draft with an exact before/after diff and audit event.
- “Отмени” within the pending state discards the draft.
- “Undo” after commit creates a compensating change set. It is unavailable when newer dependent records make reversal unsafe.
- Text such as “да” does not silently commit. It can focus the pending panel, but the actual save remains a host action.

### 11.4 Partial information

The chat does not interrogate the user for every optional field. It asks only when:

- the target entity cannot be selected safely;
- a required value cannot be represented as unknown;
- a unit changes the numeric meaning;
- an ambiguous date materially changes the record;
- multiple existing records could be updated;
- allergy versus adverse reaction is unclear;
- reported suspicion versus diagnosed condition is unclear.

Otherwise the draft stores null/unknown and makes the gap visible.

## 12. Chat attachments and imports

Attaching a document in chat does not create a second extraction stack.

1. The local host identifies or asks for document type.
2. The user sees that the raw file will be sent to the configured AI provider.
3. The existing import module extracts and validates the document.
4. The result becomes the same `chat_change_set` review representation used by conversational capture.
5. The local attachment is linked to every resulting record through provenance and existing entity links.
6. Large or complex documents open Import Wizard with a resumable draft.

Limits and safeguards:

- file size and page-count preflight;
- duplicate content hash before provider upload;
- abort on navigation/stop;
- persisted extraction draft;
- 100% review for non-lab documents;
- no raw attachment content in ordinary future chat retrieval;
- extraction failures never fall back to guessed records.

Voice input, OCR of pasted images, and bulk pasted tables can reuse this ingestion boundary later.

## 13. Safety, privacy, and security

### 13.1 Data minimization

- Only the safety capsule and explicitly retrieved records are sent to the provider.
- Record fields are projected per tool; insurance, contacts, and unrelated notes are excluded.
- The UI exposes “Data used for this answer” and a per-category AI sharing control.
- If a disabled category is required, the assistant says it cannot access it rather than claiming no record exists.
- Chat history and medical records remain local except for the exact turn payload sent to the selected provider.

### 13.2 Prompt injection resistance

- Tool results use structured envelopes and are labeled untrusted record data.
- Imported notes/documents never enter the system prompt.
- The model cannot define tools, table names, SQL, profile IDs, or confirmation state.
- The host ignores any model text that claims a write succeeded.
- Only a valid host-created change set can render confirmation UI.
- Tool-call arguments are size-limited and schema-validated before any local query.

### 13.3 Medical safety

- Current allergy and medication context precedes any treatment-related answer.
- The chat does not prescribe, diagnose, or turn its hypothesis into a saved diagnosis.
- Crisis BP and other existing critical flags are computed locally and surfaced with the existing escalation copy.
- A model refusal or provider failure does not prevent manual record entry.
- Safety warnings do not block the user from recording what happened; they block only invalid or dangerous state transitions.

### 13.4 Concurrency and integrity

The app, not the sidecar, owns in-app commits. The commit service must use a single-connection transaction that covers domain rows, relations, provenance, audit, and change-set status. Optimistic concurrency compares `beforeJson` or an entity revision immediately before commit. A mismatch returns the draft to review with refreshed data.

Search indexing and query-cache invalidation happen only after transaction success. If indexing fails, the source records remain committed and the index is marked dirty for deterministic rebuild.

## 14. Failure and edge-case behavior

| Case                                              | Required behavior                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Provider times out after user message             | Message stays persisted with Retry; no draft or data write                           |
| Tool loop exceeds limits                          | Stop with a bounded explanation; no partial mutation                                 |
| Invalid tool arguments                            | Return structured validation error to model once; repeated invalidity fails the turn |
| User switches profile mid-turn                    | Abort the turn; never replay tool results into the new profile                       |
| Existing record changes before confirm            | Reject stale revision and show refreshed diff                                        |
| DB commit fails                                   | Roll back every domain and audit write; keep change set in failed/retryable state    |
| Duplicate appears between draft and commit        | Re-run duplicate validation and return to review                                     |
| User deletes thread with committed records        | Keep records and provenance; provenance displays “source chat deleted”               |
| Model proposes unsupported enum                   | Host rejects; model can clarify, never coerce silently                               |
| Relative date crosses timezone boundary           | Use turn-captured profile timezone, shown on card                                    |
| One message contains >20 facts                    | Preserve message, redirect to bulk review/import                                     |
| User mentions another person's data               | Ask to switch/create profile; never write it to active profile                       |
| User discusses a hypothetical                     | Answer only; do not draft changes                                                    |
| User says “remember this” for non-medical context | Store only if a supported note category exists and confirmation is shown             |
| User revokes AI category access                   | Exclude it from subsequent provider payloads; local records remain intact            |

## 15. Delivery plan

### Phase 0: domain correctness

- Add shared semantic validators for dates, partial dates, units, ranges, state transitions, and profile ownership.
- Correct schema defaults/nullability that currently force invented medication, diagnosis, allergy, and symptom fields.
- Add `health_note`, provenance, audit, and record relations.
- Implement transaction-capable application services and medication regimen change command.

Exit criterion: manual forms and services can represent unknown/partial facts without chat or model involvement.

### Phase 1: durable read-only agent

- Move threads/messages from `localStorage` to SQLite with migration from existing local history where possible.
- Add provider-native tool-call abstraction and capability detection.
- Implement safety capsule, scoped read tools, evidence refs, agent loop, cancellation, and context refresh.
- Render evidence chips and “Data used” disclosure.

Exit criterion: the chat answers record questions through tools, cites source records, and never depends on a stale page-mount summary.

### Phase 2: conversational drafts

- Add `draft_health_changes`, change-set persistence, validators, duplicate resolution, and editable cards.
- Support medication/supplement create/end/change, diagnosis, allergy, symptom, BP, weight, lifestyle, health note.
- Commit through the local application service with provenance and audit.

Exit criterion: the core example and corrections survive restart, backup/restore, and search, with no direct model write path.

### Phase 3: full entity coverage

- Add visits, prescriptions, imaging, vaccines, retest schedules, lab-result chat capture, and medication intake events.
- Link multi-entity change sets and render dependencies.
- Reuse the change-set review UI for chat attachments/imports.

Exit criterion: every current Soma health entity is readable and either writable or explicitly read-only through chat.

### Phase 4: quality and scale

- Optional quick-log policy for low-risk repeated events.
- Local synonym dictionaries and optional local embeddings.
- Better before/after correlation tools and coverage scoring.
- Thread search, archive, export, retention controls, and usage/cost display.

## 16. Expected file-level changes

Core additions:

- `src/ai/agent/engine.ts`
- `src/ai/agent/tool-registry.ts`
- `src/ai/agent/read-tools.ts`
- `src/ai/agent/change-schema.ts`
- `src/ai/agent/change-validator.ts`
- `src/ai/agent/system.ts`
- `src/db/chat-repos.ts`
- `src/db/change-repos.ts`
- `src/db/application-services.ts`
- `src/lib/clinical-date.ts`
- `src/lib/record-refs.ts`
- `src/components/chat/ChangeSetPanel.tsx`
- `src/components/chat/ChangeItemCard.tsx`
- `src/components/chat/EvidenceChip.tsx`

Major modifications:

- `src/ai/types.ts`: agent messages, tool definitions/calls/results, capability metadata.
- all provider adapters: native tool translation and normalized finish reasons.
- `src/pages/AiAnalysis.tsx`: durable threads, agent loop, structured events, pending drafts.
- `src/db/schema.ts` and migration: chat, changes, provenance, audit, relations, health notes, honest unknown/partial values.
- `src/db/repos.ts`: read projections and service delegation; raw mutations stop being the chat boundary.
- `src/db/search.ts`: new entity coverage and post-commit freshness.
- backup/export: include all new tables and preserve provenance.
- i18n: change operations, assertion types, validation/conflict copy, AI data-sharing controls.
- MCP: reuse shared validators/application services where process boundaries permit; keep MCP authorization separate from in-app confirmation.

## 17. Test strategy

### 17.1 Deterministic unit tests

- date phrases with locale, timezone, partial precision, ranges, and future-date rules;
- unit normalization and decimal formats;
- every change-item schema;
- diagnosis assertion routing;
- allergy versus adverse-reaction routing;
- regimen change versus typo correction;
- duplicate classification for every entity;
- dependency graph and risk scoring;
- evidence-ref validation;
- context projection and AI category opt-outs.

### 17.2 Agent contract tests

Use a fake provider with scripted tool calls:

- read-only answer with citations;
- one message to multiple change items;
- clarification followed by revised draft;
- invalid args then correction;
- repeated invalid args fail closed;
- cancellation during read and during provider call;
- max-round and max-record bounds;
- unsupported model degrades to read-only chat;
- prompt injection text inside a record cannot produce a commit or tool override.

### 17.3 Repository and transaction tests

- approved change set commits all rows and provenance atomically;
- injected failure rolls back everything;
- stale revision is rejected;
- duplicate discovered at commit returns to review;
- FTS is fresh after commit or deterministically marked dirty;
- regimen change preserves non-overlapping history;
- anaphylaxis and append-only guards remain enforced;
- undo produces audit events and respects dependent records;
- backup/restore round-trip includes chats, pending drafts, provenance, audit, notes, and relations.

### 17.4 UI tests

- edit/exclude/save change cards;
- relative date and unit assumptions are visible;
- save button count matches operations;
- blocked cards cannot be confirmed;
- destructive change cannot be bundled accidentally;
- record and evidence links deep-link correctly;
- switching profile aborts a turn;
- refresh/restart restores pending drafts and failed turns;
- keyboard and screen-reader operation of the confirmation panel.

### 17.5 Golden conversational cases

Maintain RU and EN fixtures for at least:

- medication start, stop, dose change, PRN, adherence event;
- supplement with brand and compound ingredients;
- clinician diagnosis versus self-suspicion;
- allergy without severity and adverse drug effect;
- approximate date and ambiguous numeric date;
- multi-entity visit statement;
- repeated symptom pattern versus discrete symptom event;
- BP/weight/lifestyle same-day merge;
- correction before and after commit;
- duplicate and conflicting existing records;
- another person's medical fact;
- hypothetical conversation that must not persist anything.

Golden tests assert the draft schema and host validation result, not exact prose from a live model.

## 18. Acceptance criteria

The feature is ready when all of the following hold:

1. A clear medication or supplement statement creates an editable draft with correct type, dose, schedule, temporal precision, and provenance.
2. A medication regimen change preserves both historical periods rather than overwriting the first course.
3. A clinician diagnosis and a self-suspected condition cannot end up with the same assertion semantics.
4. Missing allergy severity, diagnosis status, symptom severity, or start date is represented honestly, not silently defaulted.
5. One user message can atomically create and link a visit, diagnosis, prescription, and medication.
6. No provider/model code path can write directly to a source-of-truth health table.
7. Every write requires a host-rendered preview and immutable revision confirmation.
8. Committed changes are immediately available to the next chat turn, search, timeline, entity pages, backup, and export where applicable.
9. Read answers link to the records used and identify missing data.
10. Tool retrieval is profile-scoped and data-minimized.
11. Duplicate and stale-record races are rechecked at commit.
12. A forced mid-transaction failure leaves no partial clinical records, provenance, or audit rows.
13. Provider failure, cancellation, app restart, and profile switch cannot produce hidden writes or lose a pending confirmed-but-uncommitted draft.
14. Unsupported models remain usable in visibly read-only mode.
15. RU and EN golden cases pass without relying on exact model wording.

## 19. Product metrics and diagnostics

Track locally by default; external analytics require separate consent:

- draft acceptance rate;
- per-field edit rate;
- clarification rate and reason;
- duplicate/conflict rate;
- discarded draft rate;
- correction/undo rate after commit;
- cited-answer rate and invalid-ref rate;
- tool rounds, latency, provider failures, and cancellation rate;
- percent of answers using only the safety capsule versus additional retrieval;
- percent of facts routed to `health_note` because typed storage was insufficient.

The most important quality signal is not message engagement. It is how often the user must correct structured fields before or after saving. High fallback-note usage identifies the next schema worth adding.

## 20. Decisions

- Use host-mediated native tool calls, not prompt-only JSON and not direct MCP writes.
- Use preview-and-confirm for every write in the first release.
- Persist chat, drafts, provenance, and audit in SQLite so they follow backup and restore.
- Treat a medication row as an immutable historical regimen period; dose changes create successor periods.
- Add honest unknown and partial-date representation before conversational writes.
- Add a visible `health_note` fallback so unsupported facts are preserved without corrupting typed data.
- Use deterministic structured retrieval plus FTS first; do not require remote embeddings.
- Require record evidence references in data-dependent answers.
- Reuse the existing import pipeline for attachments and converge it on the same review/change-set UI.
- Keep application services as the single rule boundary shared by manual forms, chat, and eventually MCP where feasible.
