# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.0] — 2026-07-20

### Added

- **MCP server: full record coverage** (22 new tools). AI assistants connected
  over MCP can now read and write every major record type, not just labs:
  medications as intake periods (`add_medication` / `stop_medication`, with a
  duplicate-active guard), diagnoses with status transitions (`add_diagnosis` /
  `update_diagnosis_status`), doctor visits whose id links diagnoses, symptoms
  and imaging (`add_visit`), home measurements (`log_weight`,
  `log_blood_pressure` with the normal/stage2/crisis flag), daily lifestyle
  context with one merged row per day (`log_lifestyle` / `get_lifestyle_trend`),
  free-form journal notes with vague-date support (`add_health_note` /
  `list_health_notes`), imaging studies (`add_imaging_record`), re-test
  reminders with computed due status (`set_retest_schedule` /
  `list_retest_schedules`), lab browsing (`list_lab_panels` / `get_lab_panel`),
  full vaccination history (`list_vaccines`), profile lifestyle fields
  (`update_profile`), and list tools for medications, diagnoses, visits and
  imaging. Every write validates dates and enums, refuses instead of guessing,
  and supports `dryRun` previews (updates show a before/after diff);
  `log_symptom` can now link to a visit.

### Changed

- **Settings redesign**: the settings page is now organised into four tabs —
  General (appearance and updates side by side, sidebar sections, dashboard
  layout), AI, Profile (profile and emergency info), and Data (backup,
  encryption, export, logs). Reset personalization moved to a separated danger
  zone at the end. All existing deep links into settings sections keep working.

### Fixed

- **AI assistant chat failed with Gemini** (HTTP 400): tool schemas were sent
  verbatim, but Gemini's function-calling API accepts only a strict OpenAPI
  subset and rejected keywords like `additionalProperties`, `oneOf` and
  `const`, so every chat request with tools failed. Schemas are now lowered to
  Gemini's subset, empty-parameter tools omit the schema entirely, and history
  entries that would produce empty message parts are skipped.
- **AI error logs** now include the provider's error message for HTTP failures
  instead of only the status code.

## [0.4.0] — 2026-07-19

### Added

- **Additional findings**: analytes the biomarker dictionary doesn't know and
  qualitative results ("negative", titres) are no longer dropped at import —
  they are saved as structured, editable findings attached to the panel
  (new `lab_finding` table), shown on the panel page, aggregated across all
  panels on the labs page, and included in the AI assistant's health context.
  Unmapped rows are saved as findings by default (per-row opt-out on the review
  screen); the custom-biomarker dialog is now pre-filled by an AI-drafted
  definition (name/category/unit/direction + aliases).
- **Import review ordering**: rows sort by review need (unmatched → broken unit
  conversion → fuzzy → AI → translated → exact); duplicate groups nest their
  alternates under the kept row with a one-click swap.
- **Lab location extraction**: city/country are read from the report letterhead
  and prefill the panel metadata.

### Fixed

- **Source document preview** falsely reported "file could not be found": the
  availability check used the fs `exists` command without granting
  `fs:allow-exists`, so it always failed for stored attachments.

## [0.3.0] — 2026-07-19

## [0.2.1] — 2026-07-19

### Fixed

- **Actionable Settings links** now open, scroll to and highlight the exact requested section;
  AI setup links land directly on the expanded provider and API-key controls.
- **All-time Timeline navigation** now uses a horizontally scrollable, density-aware canvas with
  sticky lane labels instead of compressing decades of events into the viewport.

## [0.2.0] — 2026-07-18

### Fixed

- **Attachments are backed up and encrypted**: imported PDFs/photos are now
  bundled into the encrypted backup (new v3 `.somabk` archive format; v1/v2 files
  still restore) and sealed alongside the database under at-rest encryption (a
  sibling `attachments.vault`), instead of being left out of backups and in
  cleartext on disk.
- **Failed loads no longer spin forever**: a rejected data query now surfaces an
  inline "couldn't load — retry" card (via a new per-route error boundary) instead
  of an endless spinner, and `reload()` resolves only after the refetch settles.
- **Failed writes are no longer silent**: added an error-toast variant and a global
  safety net that surfaces otherwise-swallowed write failures (DB locked, disk
  full, guard rejections) instead of leaving the UI silently stale.
- **AI import — large documents**: oversized files are rejected before the API
  call with clear guidance; a response the model truncated at the token cap now
  salvages its complete rows instead of failing the whole import; provider 413/400
  errors map to actionable messages.
- **AI import — discharge allergies** are categorised (drug/food/environmental/
  other) instead of all being saved as drug allergies.
- **AI import — biomarker mapping** runs with bounded concurrency and surfaces a
  retryable error on rate-limit/network failures instead of silently leaving rows
  unmapped.
- **Full-text search restored**: the `fts_records` FTS5 table (lost in a migration
  squash) is now created by a real migration, so global search and the ⌘K palette
  return results on fresh installs again; the "no such table" error is no longer
  swallowed silently.
- **Crash-safe at-rest encryption and backups**: the vault lock, the vault→plaintext
  unlock and the backup/staging writes now write to a temp file, fsync, and rename
  atomically before removing any source — a power loss mid-write can no longer leave
  a truncated vault with the plaintext already deleted.
- **Backups survive an Argon2 default change**: the vault and backup formats (now v2)
  store their Argon2id parameters in the header; older v1 files still decrypt under
  the pinned legacy parameters. Previously a crate-default change would have made
  every existing backup and vault permanently unreadable.
- **Restore of older backups**: `schemaVersion` is now an explicit constant instead
  of the count of migration files, so backups written by pre-squash builds are no
  longer wrongly rejected as "newer than the app".
- **Attachment files are deleted with their records**: removing a record now removes
  the backing imported PDF/photo from disk instead of leaking it forever.

### Security

- **MCP write tools are opt-in**: `add_lab_panel`, `add_allergy`, `add_vaccine` and
  `log_symptom` are disabled unless `SOMA_MCP_ALLOW_WRITES=1` is set for the server,
  so a connected assistant can no longer silently insert safety-critical health
  records. Rows written via MCP are stamped `import_method = "mcp"` for provenance,
  and a locked (encrypted) database now reports "unlock the app" instead of "not
  found".

### Added

- **One-field GitHub releases**: maintainers can enter the next SemVer in Actions → Release; the
  workflow updates version files and changelog, creates the commit and tag atomically, validates
  the project, builds every desktop installer, adds checksums and publishes only after all jobs pass.
- **In-app update check**: Settings now shows the installed version, checks the latest published
  stable GitHub Release and opens the release page for manual download and installation.
- **Lifestyle context** (v0.3): a dedicated `/lifestyle` page with daily sleep / training /
  stress-and-energy cards and a recent-entries table; the rolling-window summary is folded into the
  AI health context so chat and trend interpretation account for it. Ships with a forward-looking
  Apple Health / Google Fit / Health Connect integration design (`docs/health-data-integrations.md`,
  file-import-first); entry is manual for now, but the schema is already shaped for device sync.
- **Doctor report** (v1.0): an on-device PDF summary (`/report`) of current problems, medications,
  allergies, out-of-range markers and recent labs / visits / imaging / vaccines / lifestyle, with a
  configurable time range and per-section toggles. Carries the not-medical-advice disclaimer.
- **In-app reminders feed** (v1.0): a `/notifications` page plus a header bell surfacing
  medication-intake nudges and **scheduled re-testing** (every N months) as passive, in-app items —
  no OS notifications, nothing leaves the device. Re-test cadences are user-managed.
- **Optional at-rest database encryption** (v1.0): an encrypt-when-closed vault
  (Argon2id + AES-256-GCM) that keeps the live database encrypted on disk while the app is closed,
  with two unlock modes — automatic via the OS keychain, or a passphrase typed at launch.
- **AI assistant** (v0.3, bring-your-own-key): a health-context chat (`/assistant`) and one-tap
  **trend interpretation** on any biomarker, both through the shared vendor-agnostic provider
  interface; every answer carries the not-medical-advice disclaimer.
- **Side-by-side comparison** of two lab dates (`/labs/compare`) with per-marker deltas.
- **Medication adherence log**: mark a med taken/skipped, with a trailing-window % and a streak.
- **In-app dictionary editor**: edit any biomarker's reference/optimal ranges and aliases; edits to
  seeded entries survive the on-launch dictionary sync (new `is_user_modified` flag + migration).
- **Per-lab unit memory** (recall a lab's unit when a report prints none) and **16 added molar
  conversions** (total/free T3 & T4, BUN vs. urea, PTH, C-peptide, vitamins A/C/E, trace metals…).
- **Automated tests**: a Vitest suite for the critical pure-logic core (unit conversions, biomarker
  mapping, import validation, repo guards) plus `cargo test` for the backup round-trip — both in CI.
- **Allergies** section: severity-aware allergy records (mild → anaphylactic); anaphylactic
  entries are protected from hard-deletion (must be resolved). Drug-allergy interaction warnings
  surfaced on medications.
- **Vaccines** section: dose series, manufacturer/batch and expiry tracking; a WHO childhood
  immunization calendar; childhood-vs-actionable split with travel-vaccine guidance.
- **Imaging** section: X-ray / CT / MRI / ultrasound / … records, entered manually or AI-imported.
- **Journal**: weight, blood pressure and symptom logs; weight goals with a glide-path projection
  and an overview chart.
- **Emergency Card**: a printable/exportable summary of blood type, conditions, medications and
  allergies for emergencies.
- **Encrypted backups**: AES-256-GCM snapshots (Argon2id key from a passphrase in the OS keychain)
  written into a cloud-synced folder (iCloud / Google Drive / Dropbox / OneDrive), with scheduled
  runs, rotation and restore. The live database never leaves the device.
- **Search & Command Palette**: SQLite FTS5 full-text search across all records, with a ⌘K palette.
- **Local MCP server** (`mcp/`): typed stdio tools over `soma.db` for AI assistants, with one-click
  setup from Settings.
- **AI import for every document type** via a doc-type registry: lab reports, vaccine certificates,
  discharge summaries, imaging reports, prescriptions/medication lists and allergy records.
- **Multilingual lab parsing**: the model returns an English `analyte_en` translation key so
  non-English reports map against the English dictionary; safer mapping + model guidance.
- **Reference explanations** for every biomarker (what high/low means, what affects it), EN + RU.
- **Sex/age-specific reference ranges**; per-result provenance (source page, mapping confidence,
  review state); source-file linking; persistent "needs review".
- **Navigation**: route registry, breadcrumbs, hierarchical back and scroll restoration; detail
  pages for diagnoses and medications with related-entity links.
- First-run **onboarding** wizard and profile fields; dashboard **attention digest** with a health
  verdict and safety banner.
- UI **localization (EN/RU)**, settings information-architecture overhaul, searchable unit
  comboboxes, attachment viewer.
- Dev fake-data seeder (`pnpm seed:dev`).

### Changed

- AI-import transport hardened: an explicit request timeout (AbortController), `Retry-After`
  handling, and a PII-free failure log, on top of the existing retry/backoff.
- Biomarker dictionary expanded from ~65 to **178 markers**.
- **Clinically-aware critical flags**: per-analyte panic thresholds replace blind multipliers, so a
  benign extreme (e.g. 0% eosinophils) is no longer reported as critical; unit-integrity hardening
  and biomarker sparklines on the labs view.
- Chrome text is non-selectable by default; data opts in. Migrations consolidated into a single
  initial schema.

### Fixed

- Domain-logic, data-integrity and memory-leak hardening across the stack.
- Hardened corner cases across onboarding, import, CRUD and export flows.
- Vaccines: dropped false "overdue" flags; childhood vs actionable split.
- Weight glide-path rendering in WKWebView; weight-chart fit; dropdown jitter/positioning.
- CI: declare `tsx` as a devDependency for the import gates; stub the MCP sidecar binary for the
  clippy job.

> **Note:** the breadth of work above (new sections, encrypted backups, MCP server, 178-marker
> dictionary, all-section AI import) warrants cutting a **`0.2.0`** release tag.

## [0.1.0] — 2026-06-09

### Added

- Drizzle/SQLite schema and migrations for all core entities: profiles, biomarkers,
  lab panels & results, medications (+ adherence log), visits, diagnoses,
  prescriptions, attachments.
- Seeded biomarker dictionary (~65 markers) with reference/optimal ranges and
  multilingual aliases (EN/RU).
- Manual lab panel entry; trend charts with reference/optimal bands and
  out-of-range markers.
- Medication & supplement tracking with dose, schedule and intake periods;
  medication overlay on biomarker trend charts.
- Visits, diagnoses and prescriptions CRUD.
- Unified horizontal timeline of all health events.
- AI settings: provider/model registry (multimodal-only), custom model override,
  API keys in the OS keychain, key validation.
- AI import pipeline (PDF/photo): strict structured extraction → deterministic
  dictionary mapping (exact → alias → fuzzy → narrow AI disambiguation) →
  mandatory human review with confidence indicators, duplicate detection and
  unit-conversion flags.
- Cyrillic-aware unit normalization and per-analyte molar conversion table.
- Full JSON export and lab results CSV export.
- Light/dark theme, responsive desktop UI.
