# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
