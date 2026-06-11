# PRD: Health Record Expansion (Guava-parity, adapted)

> Compiled 2026-06-11 from a two-stage agent analysis (business-logic-reviewer + ux-product-designer, Sonnet 4.6) benchmarking Soma against Guava (guavahealth.com) and scoping what to adopt, adapt, or skip for Soma's local-first desktop / nomad positioning.

## Overview

Soma today is a labs-first dashboard (biomarkers + medication overlay USP). To be a complete *personal health record* for its nomad/expat/biohacker personas it needs the table-stakes record types (allergies, vaccines, a real problem list, imaging), an emergency card, lightweight symptom/vitals journaling that feeds the existing overlay engine, and full-text search — while explicitly **skipping** Guava's US-patient features (wearable sync, patient portals, health score, cycle tracking, daily lifestyle logs, standalone mood).

## Personas

- **A — Nomad Biohacker (primary):** labs every 1–4 months in different countries, self-optimizes, privacy-first, desktop, technical. No patient-portal continuity.
- **B — Expat with Chronic Condition (secondary):** manages 1–2 conditions abroad, needs a portable record for new doctors, attaches PDFs.
- **C — Health-Anxious US Self-Tracker (anti-persona):** Guava's core user; explains every Guava feature Soma skips.

## User Stories

- As a nomad, I want my allergies, vaccines, and active diagnoses recorded so I can hand a complete record to any clinic in any country.
- As a nomad, I want a self-contained offline emergency card (HTML) so an ER doctor can read my critical data without my device or an account.
- As a biohacker, I want to log symptoms with severity and overlay them on biomarker trends so I can see whether a drug changed how I *feel*, not just my labs.
- As an expat with hypertension, I want home BP and weight logs with charts so home measurements live next to my lab data.
- As a traveler, I want vaccine expiry flags (e.g. yellow fever) so I know what borders require before a trip.
- As a user with years of records, I want full-text search across everything so I can answer "when was my ferritin last low" in seconds.
- As an AI-assistant user, I want the local MCP server to expose my medical summary and search so a model can reason over my data safely.

## Scope Verdicts (Guava capability → Soma decision)

| # | Capability | Verdict | Priority |
|---|---|---|---|
| 1 | Allergies (record type) | ADOPT | **P0** |
| 2 | Vaccines (record type, expiry, batch) | ADOPT | **P0** |
| 3 | Diagnoses → first-class problem-list page | ADOPT (promote existing) | **P0** |
| 4 | Emergency info card + offline HTML export | ADOPT | P1 |
| 5 | Symptom log + overlay on biomarker trend | ADAPT (lightweight; no body-map/auto-correlations) | P1 |
| 6 | Imaging records (MRI/CT/X-ray/US) | ADAPT | P1 |
| 7 | Weight log (time series) | ADAPT | P1 |
| 8 | Blood-pressure log | ADAPT | P1 |
| 9 | Full-text search (FTS5) + command palette | ADOPT | P1 |
| 10 | AI import for vaccination certs & discharge summaries | EXTEND existing pipeline | P1 |
| 11 | Prescription model fix (structural debt) | FIX | P1 |
| 12 | Daily sleep/steps/caffeine/food logs | **SKIP** — Persona C friction |
| 13 | Standalone mood tracking | **SKIP** — loggable as a symptom |
| 14 | Wearable / Apple Health sync | **SKIP** — desktop local-first, big platform cost |
| 15 | Cycle & pregnancy | **SKIP** — out of positioning |
| 16 | Guava Score gamification | **SKIP** — US-guideline-bound, anti-persona |
| 17 | Patient-portal / EHR sync | **SKIP** — US-only, incompatible with local-first |

Soma-specific gaps surfaced by the analysis (more important than raw parity): symptom correlation is the missing half of the medication-overlay USP; AI import handles only lab panels; `prescription` is structurally broken (note-only, cascade-deletes with visit while `medication.prescriptionId` dangles); weight exists only as a profile snapshot; diagnoses have data but no prominent product surface.

## Business Rules

### Allergy
- Belongs to one profile; `allergen` free text (no dictionary — names vary across countries/languages).
- `category`: drug | food | environmental | other. `severity`: mild | moderate | severe | anaphylactic. `status`: active | resolved.
- **Anaphylactic entries cannot be hard-deleted** — must be resolved first (enforced in repo layer, not only UI).
- Always present on the emergency card; resolved entries visually distinguished.
- Timeline event `kind: "allergy"` only when `onsetDate` is set.

### Vaccine
- Administration `date` required; optional `dose` (1 of N), `batchNumber`, `manufacturer`, `expiresAt`, `administeredBy`, `country`, attachment.
- `expiresAt < today` → "Expired" flag in UI and emergency card. Expiry is computed, never stored as status.
- **Append-only**: no user-visible delete (edit allowed for typo fixes). Sort by name, then date.
- Timeline event `kind: "vaccine"`.

### Symptom log
- Free-text `symptomName` with case-insensitive autocomplete from previously used names (existing spelling ranked first — prevents "Fatigue"/"fatigue" split series).
- `severity` 1–10 required; date required, optional HH:MM time; multiple entries per day allowed.
- Timeline shows only severity ≥ 6 by default, with "show all" toggle (noise control).
- Overlays on the biomarker TrendChart as **point events** (vertical reference lines + dots on a hidden secondary 0–10 axis), distinct from medication period bands. ≥6 solid red, 3–5 dashed amber.

### Imaging record
- `modalityType`: xray | ct | mri | ultrasound | pet | other. `bodyArea` required. `findings` free text.
- Optional `visitId` link and `attachmentId`. `attachment.kind` enum extended with `"imaging"`, `"vaccination_cert"`.
- Timeline event `kind: "imaging"`.

### Weight log
- Stored canonically in kg (`weightKg`), displayed per `profile.unitSystem` (existing `kgToLb`).
- **Not in the unified timeline** (noise); dedicated chart + biomarker-trend overlay option.
- `profile.weightKg`/`targetWeightKg` stay as snapshot fields, not auto-updated from the log.

### Blood-pressure log
- `systolic`/`diastolic` mmHg integers required; optional HR bpm, `position` (sitting/standing/supine), `armSide`.
- Stage 2 (≥140 sys or ≥90 dia): amber badge + amber chart band. **Crisis (>180 sys or >120 dia): persistent non-dismissable destructive banner** on the BP tab (and Dashboard) while a qualifying reading exists within 7 days. Entry-time on-blur warning for crisis values (non-blocking).
- Not in the unified timeline.

### Emergency card
- **Computed view**, not new storage — except 3 new profile fields: `emergencyContactName/Phone/Relation`.
- Pulls: blood type + Rh, active allergies (sorted by severity, anaphylactic first), active medications, active diagnoses, last 5 vaccines.
- Export: fully self-contained HTML (inline CSS, system font stack, no CDN/JS), Tauri save dialog, default name `emergency-card-YYYY-MM-DD.html`, print-optimized, **"Generated: date" stamp**.
- Explicit "No known allergies recorded" empty state (distinguish "not recorded" from "none known").
- Must work fully offline; respects unitSystem and language.
- Emergency card prefers `diagnosis` rows with `status = active` over the free-text `profile.conditions` (fallback only).

### Full-text search
- SQLite FTS5 shadow index over: biomarker names, panel lab names, visit notes, diagnoses, symptoms, medications, allergens, vaccines, imaging findings, attachment filenames. Rebuilt at startup if empty; updated incrementally on writes. Not the source of truth.
- Surfaces: global command palette (Cmd/Ctrl+K) + inline filter on Timeline. Results grouped by entity type, capped at 5 per group, deep-linked.

### Diagnosis (promoted)
- Status machine: active ↔ remission → resolved; resolved → active (relapse). Transition guards in repo layer (today `updateDiagnosis` accepts anything).
- New fields: `notes`, `resolvedDate` (auto-filled with today on resolve, editable).

### Prescription fix
- Add structured fields (`drugName`, `doseAmount`, `doseUnit`, `frequency`, `durationDays`, `refills`).
- Change `prescription.visitId` cascade → `onDelete: "set null"`; soft-delete via `archivedAt` instead of hard delete (prevents dangling `medication.prescriptionId` under `foreign_keys = ON`).

### AI import (non-lab)
- New first step in ImportWizard: document type — Lab report / Vaccination certificate / Discharge summary.
- **Non-lab extractions require 100% manual review**: all rows start unchecked, no auto-accept threshold (no dictionary fallback exists for these).

## Data Model

New Drizzle tables (conventions: integer PK autoincrement, `profileId` FK, text ISO dates, indexes on `(profileId, date)`):

- **`allergy`**: allergen, category enum, severity enum, reaction, onsetDate, status enum, notes, createdAt. Index on profileId.
- **`vaccine`**: vaccineName, date, manufacturer, batchNumber, dose int, expiresAt, administeredBy, country, notes, attachmentId FK. Index (profileId, date).
- **`symptom_log`**: date, time, symptomName, severity int (1–10 app-level check), notes, createdAt, optional visitId (open question). Indexes (profileId, date) and (symptomName).
- **`imaging_record`**: date, modalityType enum, bodyArea, findings, radiologistName, clinic, city, country, visitId FK, attachmentId FK, createdAt. Index (profileId, date).
- **`weight_log`**: date, weightKg real, notes. Index (profileId, date).
- **`bp_log`**: date, time, systolic int, diastolic int, heartRateBpm int, position enum, armSide enum, notes. Index (profileId, date).
- **`profile` additions**: emergencyContactName, emergencyContactPhone, emergencyContactRelation.
- **`prescription` additions**: drugName, doseAmount, doseUnit, frequency, durationDays, refills, archivedAt; visitId FK → set null.
- **`attachment.kind`** enum + `"imaging"`, `"vaccination_cert"` (type-level only, no migration needed).
- **FTS5 virtual table** `fts_records(entity_type UNINDEXED, entity_id UNINDEXED, profile_id UNINDEXED, content, tokenize='unicode61')` — raw SQL migration; rebuild function at startup.

Full Drizzle definitions are in the business analysis (section 6) — follow schema.ts conventions exactly.

## API Design (local app — repos.ts + MCP)

### repos.ts additions
- Allergies: `listAllergies`, `createAllergy`, `updateAllergy`, `deleteAllergy` (blocked for anaphylactic).
- Vaccines: `listVaccines` (order name, date asc), `createVaccine`, `updateVaccine`.
- Symptoms: `listSymptomLog(profileId, from?, to?)`, `getSymptomSeries(profileId, name)`, `listSymptomNames` (distinct, for autocomplete), `createSymptomEntry`, `deleteSymptomEntry`.
- Imaging: `listImagingRecords`, `createImagingRecord`, `updateImagingRecord`, `deleteImagingRecord`.
- Weight/BP: `listWeightLog`, `createWeightEntry`, `getWeightSeries`; `listBpLog`, `createBpEntry`, `getBpSeries`.
- Emergency: `getEmergencyCard(profileId)` → `{ profile, activeAllergies, activeMedications, activeDiagnoses, recentVaccines }` (read-only aggregate).
- Search: `searchRecords(profileId, query)` → `{ entityType, entityId, snippet, score }[]`.
- `getTimeline` extended with kinds: `symptom` (severity ≥ 6 default), `vaccine`, `allergy` (onsetDate only), `imaging`. Weight/BP excluded.

### MCP server new tools (mcp/src/index.ts)
- `get_medical_summary` — active allergies + diagnoses + medications + recent vaccines (safety-critical context-loading tool for AI).
- `search_records` — FTS query, grouped results.
- `get_symptom_trend` — mirrors `get_biomarker_trend` (series + overlapping medications).
- `get_weight_trend`, `get_bp_trend`.
- Write tools `add_vaccine`, `add_allergy`, `log_symptom` — follow `add_lab_panel` pattern (validate → dryRun review → write; refuse on schema mismatch).

### AI provider interface extension (src/ai/types.ts)
- `extractVaccineFromDocument(doc)` → `{ vaccineName, date?, batchNumber?, manufacturer?, dose?, expiresAt? }[]`
- `extractDischargeFromDocument(doc)` → `{ visitDate?, clinic?, diagnoses[], medications[], notes }`

## UX Specification

### Information architecture
Sidebar gets non-clickable section labels (no new nav paradigm); 11 clickable items total:

```
Dashboard /          Timeline /timeline
RECORDS:       Diagnoses /diagnoses · Allergies /allergies · Vaccines /vaccines · Imaging /imaging
LABS & VITALS: Lab results /labs · Biomarkers /biomarkers · Journal /journal (?tab=weight|bp|symptoms)
CARE:          Medications /medications · Visits /visits
```

`/emergency` is **not** in the sidebar — entry via Dashboard button (`HeartPulse`), command palette, deep link. New routes: `/allergies`, `/vaccines`, `/imaging`, `/imaging/new`, `/imaging/:id`, `/journal`, `/emergency`.

### Pattern decisions (dialog vs page form)
| Feature | Pattern | Why |
|---|---|---|
| Allergies, Vaccines, Diagnoses, Weight, BP, Symptom | Dialog CRUD (Medications pattern) | compact forms |
| Imaging new/edit | Full-page form (LabPanelNew pattern) | 5+ meta fields + findings textarea + attachment |
| Emergency card | Full read-only page, one action (Export) | computed view |

### Key screens (condensed; full spec below in source outputs)
- **Allergies**: card grid, Active/Resolved sections; severity badge mapping (mild=secondary, moderate=warning, severe/anaphylactic=destructive + lock); anaphylactic delete button disabled with explanatory tooltip; resolved cards at 60% opacity.
- **Vaccines**: table grouped by vaccine name; Expired warning badge; edit-only action column (no delete affordance); name Combobox pre-filled from previously recorded names (`allowCustom`).
- **Diagnoses**: Active as cards with quick actions ("Move to Remission" direct, "Resolve" with inline date confirm — no modal), Remission/Resolved as compact tables.
- **Journal** (`?tab=` in URL for deep links): Weight tab — line chart with dashed Target reference line + entries table; BP tab — dual-line chart (systolic red, diastolic blue) with amber stage-2 and red crisis ReferenceArea bands + crisis banner; Symptoms tab — severity-threshold control, compact event-dot strip (severity color-coded), entries table.
- **Symptom overlay** on BiomarkerDetail: "Symptoms" toggle chip next to existing med-overlay legend; TrendChart gains `symptomOverlays` prop + hidden secondary Y-axis; tooltips with name/severity/notes; handles symptom points outside sparse biomarker date range.
- **Emergency card page**: identity → contact → allergies (anaphylactic first) → meds → diagnoses → vaccines cards; amber "incomplete data" banner with Settings link; footer disclaimer + generated date.
- **Command palette**: Cmd/Ctrl+K, portal overlay at top-third, grouped results with ↑↓/Enter/Esc, per-group cap 5 + "see all"; Search icon in sidebar footer; Timeline gets an inline filter input.
- **ImportWizard**: new `selectType` step with 3 option cards (Lab report / Vaccination certificate / Discharge summary); dynamic picker copy; VaccineReview and DischargeReview steps with all rows unchecked + amber 100%-manual-review banner.
- **Dashboard**: second stats row — active allergies, active diagnoses, next vaccine expiry, Emergency card button.

### States & guards (completeness matrix)
Every screen specifies empty (EmptyState icons: ShieldAlert/Syringe/Stethoscope/ScanLine/Scale/HeartPulse), loading, error-banner, and boundary states: anaphylactic delete protection, expired vaccine badge, BP crisis persistent banner, symptom threshold filtering, single-data-point charts, narrow-window behavior (sidebar 56px collapse, table overflow-x scroll, tab strip horizontal scroll).

### Files to create/modify
New pages: `Allergies.tsx`, `Vaccines.tsx`, `Imaging.tsx`, `ImagingNew.tsx` (create+edit), `Journal.tsx`, `EmergencyCard.tsx`; new `components/app/CommandPalette.tsx`. Modified: `App.tsx` (routes), `Shell.tsx` (nav sections, search button, Cmd+K listener), `Diagnoses.tsx`, `Dashboard.tsx`, `Timeline.tsx`, `ImportWizard.tsx`, `BiomarkerDetail.tsx`, `charts/TrendChart.tsx`, `app/ProfileFields.tsx`, i18n `en.ts`/`ru.ts`. New i18n namespaces: `allergies.*`, `allergyCategory.*`, `allergySeverity.*`, `vaccines.*`, `imaging.*`, `imagingModality.*`, `journal.*`, `symptoms.*`, `symptomSeverity.*`, `weight.*`, `bp.*`, `emergency.*`, `search.*`, plus additions to `nav.*`, `diagnoses.*`, `importWizard.*`, `profile.*`.

## Edge Cases

- Anaphylactic allergy delete blocked at repo layer (not just UI).
- Vaccine multi-dose ordering by date, not insertion id.
- Symptom name case collisions → normalize via autocomplete ranking of existing spellings.
- Symptom points outside sparse biomarker chart range → render with clipping indicator.
- BP crisis = safety threshold, not a reference range: persistent banner, not a badge.
- Emergency card: explicit "No known allergies recorded"; export fully self-contained, no network.
- FTS index empty after migration → rebuild on first startup.
- Prescription cascade change is a destructive DDL migration; verify no orphans with `foreign_keys = ON` (MCP sets it).
- Backup restore must apply pending migrations before opening; MCP read-only message should name the offending migrations.
- Timeline flooding by daily symptoms → severity ≥ 6 default filter.

## Risks

1. Symptom log flooding the timeline → threshold + toggle (accepted mitigation).
2. Vaccine expiry is user-entered, not verified → contextual note, never display "VALID" as certification.
3. Non-lab AI extraction has no deterministic dictionary fallback → 100% manual review mandated.
4. Exported emergency card goes stale → prominent "Generated: date" stamp.
5. Prescription migration changes live FK behavior → dedicated migration + verification step.

## Open Questions

1. `symptom_log.visitId` optional FK — recommended yes (P1), not required.
2. Should weight/BP become "virtual biomarkers" in the dictionary instead of separate tables? **Recommendation: separate tables**, exposed as overlay options (mixing into `lab_result` corrupts panel semantics).
3. Deprecate free-text `profile.conditions` in favor of `diagnosis`? **Recommendation: keep for onboarding speed; emergency card prefers `diagnosis` when present.**
4. CommandPalette state in Shell vs context — start in Shell.
5. Dashboard: 8 stat cards vs 4+replacement — developer's call; Emergency entry point is mandatory.

## Implementation Order

1. **Migration batch 1 (P0 schema):** `allergy`, `vaccine`, profile emergency-contact fields; repos + i18n; Allergies & Vaccines pages; Diagnoses promotion; timeline integration.
2. **Migration batch 2 (P1 schema):** `symptom_log`, `imaging_record`, `weight_log`, `bp_log`; Journal page + charts; Imaging pages; TrendChart symptom/vitals overlays.
3. **Emergency card** (depends on allergies): aggregate repo + page + HTML export.
4. **FTS5 migration + search**: index, rebuild-on-startup, command palette, Timeline filter.
5. **AI import extension**: provider interface methods, selectType step, Vaccine/Discharge review screens.
6. **Prescription model fix** (own destructive migration, with verification).
7. **MCP tools**: `get_medical_summary`, `search_records`, `get_symptom_trend`, `get_weight_trend`, `get_bp_trend`, write tools — after the corresponding tables ship.

Each batch ends with: drizzle migration generated, `pnpm typecheck && pnpm lint && pnpm build` green, backup/restore round-trip tested, MCP schema check verified.
