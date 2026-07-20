# soma-mcp

Local stdio MCP server that exposes the Soma health database to AI assistants
(Claude Code, Claude Desktop, or any MCP-capable client). Everything runs on
your machine over stdin/stdout — no network, no ports, data never leaves the
device.

## Tools

| Tool                      | What it does                                                                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_medical_summary`     | **Call FIRST.** Safety-critical context: profile basics, active allergies (anaphylactic first), active diagnoses, active meds, recent vaccines |
| `get_profile`             | Demographics, body metrics, lifestyle, conditions — context for interpreting labs                                                              |
| `search_biomarkers`       | Resolves a name in any language/spelling against the dictionary (same matcher as the import pipeline)                                          |
| `get_biomarker_trend`     | Time series in the default unit + reference/optimal ranges + medications overlapping the period                                                |
| `get_symptom_trend`       | Severity series for a symptom (case-insensitive) + overlapping meds; lists known names when no match                                           |
| `get_weight_trend`        | Body-weight series (kg) + target weight                                                                                                        |
| `get_bp_trend`            | Blood-pressure series with per-reading flag (normal/stage2/crisis) + summary counts                                                            |
| `get_lifestyle_trend`     | Daily lifestyle series (sleep/training/steps/RHR/stress/energy) + per-field averages                                                           |
| `list_medications`        | Medications with intake periods; `active` / `past` / `all`                                                                                     |
| `list_diagnoses`          | Diagnoses with status, ICD code and linked visit                                                                                               |
| `list_visits`             | Doctor visits with diagnoses linked to each                                                                                                    |
| `list_lab_panels`         | Lab-draw events with result / out-of-range / finding counts                                                                                    |
| `get_lab_panel`           | One panel in full: normalized results with ranges/flags + unstructured findings                                                                |
| `list_vaccines`           | Full vaccination history with `expired` flags                                                                                                  |
| `list_health_notes`       | Journal notes filtered by category/date/tag/text query                                                                                         |
| `list_imaging_records`    | Imaging studies (X-ray/CT/MRI/US/PET) with findings                                                                                            |
| `list_retest_schedules`   | Re-test reminders with computed next-due date and overdue/due_soon status                                                                      |
| `add_lab_panel`           | Writes a lab-draw event; strict validation (dictionary mapping, unit conversion), `dryRun` supported                                           |
| `add_allergy`             | Records an allergy (severity/category enums, date validation), `dryRun` supported                                                              |
| `add_vaccine`             | Records a vaccination (date validation, expiry), `dryRun` supported                                                                            |
| `log_symptom`             | Logs a symptom (1–10 severity); reuses an existing symptom's spelling; links to a visit via `visitId`                                          |
| `add_medication`          | Starts an intake period; refuses a duplicate active row for the same name                                                                      |
| `stop_medication`         | Closes an intake period by id or by (unambiguous) name                                                                                         |
| `add_diagnosis`           | Records a diagnosis; duplicate-guarded, links to a visit via `visitId`                                                                         |
| `update_diagnosis_status` | active / remission / resolved transitions with `resolvedDate` stamping                                                                         |
| `add_visit`               | Records a doctor visit; the returned id links diagnoses/symptoms/imaging                                                                       |
| `log_weight`              | Body-weight measurement (kg), reports same-date entries                                                                                        |
| `log_blood_pressure`      | BP reading with position/arm context; echoes the normal/stage2/crisis flag                                                                     |
| `log_lifestyle`           | One row per day; merges only the fields passed (safe to log sleep and training separately)                                                     |
| `add_health_note`         | Free-form journal note (verbatim text + optional summary, vague-date support, tags)                                                            |
| `add_imaging_record`      | Imaging study with verbatim findings                                                                                                           |
| `set_retest_schedule`     | Creates/updates a re-test cadence (label-matched upsert)                                                                                       |
| `update_profile`          | Lifestyle/body profile fields (height, weight snapshots, activity, smoking, alcohol, conditions)                                               |

Plus the `soma://biomarkers` resource — the full biomarker dictionary.

> **Rule:** always call `get_medical_summary` before interpreting any health data — allergies and active conditions are safety-critical.

Every write tool validates dates (no future dates, except a planned medication
`endDate`) and enums, refuses instead of guessing, and supports `dryRun=true`
to preview the exact row (updates preview a before/after diff). Write tools
require the DB schema to match this checkout's migrations; otherwise they
refuse with the read-only schema note (see [Database](#database)).

## Build

```sh
pnpm install --frozen-lockfile
pnpm --filter soma-mcp build
```

This produces the standalone `mcp/dist/soma-mcp` executable. Desktop packages use
`pnpm mcp:sidecar` automatically to compile and name the executable for Tauri's target triple.

## Register

**Claude Code** — the repo ships `.mcp.json`, so the server is picked up
automatically when working in this project. To register globally:

```sh
claude mcp add --scope user soma -- /path/to/soma/mcp/dist/soma-mcp
```

**Claude Desktop** — add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "soma": {
      "command": "/path/to/soma/mcp/dist/soma-mcp"
    }
  }
}
```

## Database

The server opens the same SQLite file the app uses
(`app_config_dir/com.soma.health/soma.db`), in WAL mode with a busy timeout, so
it can run alongside the app. Override the path with `--db <path>` or
`SOMA_DB=<path>`.

Migrations are owned by the app. On startup the server compares the
`__migrations` table against `src/db/migrations/`; on any mismatch it degrades
to **read-only** and write tools explain why.

## Write access

Write tools (all `add_*` / `log_*` / `stop_*` / `set_*` / `update_*`) are
**disabled by default**. Any local process can talk to a stdio MCP server, so
inserting health records — including safety-critical allergy and vaccine rows —
requires an explicit opt-in: set `SOMA_MCP_ALLOW_WRITES=1` in the environment of
the server process. In an MCP client config, add it to the `soma` server entry:

```json
{
  "mcpServers": {
    "soma": {
      "command": "soma-mcp",
      "env": { "SOMA_MCP_ALLOW_WRITES": "1" }
    }
  }
}
```

Without the flag every write tool refuses with an explanation and all read tools
keep working. Rows written via MCP are stamped `import_method = "mcp"` so their
provenance is distinguishable from hand-entered and AI-imported data.

## Notes

- No raw SQL is exposed — only typed, validated tools.
- `add_lab_panel` reuses the app's unit-conversion (`src/lib/units.ts`) and
  fuzzy-matching (`src/lib/fuzzy.ts`) code paths; unmapped or inconvertible
  rows reject the whole panel atomically.
- If at-rest encryption is enabled and the app is closed, only an encrypted
  `soma.db.vault` exists on disk; the server reports that the database is locked
  and asks you to open the app, rather than claiming it is missing.
