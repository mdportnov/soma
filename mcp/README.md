# soma-mcp

Local stdio MCP server that exposes the Soma health database to AI assistants
(Claude Code, Claude Desktop, or any MCP-capable client). Everything runs on
your machine over stdin/stdout — no network, no ports, data never leaves the
device.

## Tools

| Tool                  | What it does                                                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_medical_summary` | **Call FIRST.** Safety-critical context: profile basics, active allergies (anaphylactic first), active diagnoses, active meds, recent vaccines |
| `get_profile`         | Demographics, body metrics, lifestyle, conditions — context for interpreting labs                                                              |
| `search_biomarkers`   | Resolves a name in any language/spelling against the dictionary (same matcher as the import pipeline)                                          |
| `get_biomarker_trend` | Time series in the default unit + reference/optimal ranges + medications overlapping the period                                                |
| `get_symptom_trend`   | Severity series for a symptom (case-insensitive) + overlapping meds; lists known names when no match                                           |
| `get_weight_trend`    | Body-weight series (kg) + target weight                                                                                                        |
| `get_bp_trend`        | Blood-pressure series with per-reading flag (normal/stage2/crisis) + summary counts                                                            |
| `add_lab_panel`       | Writes a lab-draw event; strict validation (dictionary mapping, unit conversion), `dryRun` supported                                           |
| `add_allergy`         | Records an allergy (severity/category enums, date validation), `dryRun` supported                                                              |
| `add_vaccine`         | Records a vaccination (date validation, expiry), `dryRun` supported                                                                            |
| `log_symptom`         | Logs a symptom (1–10 severity); reuses an existing symptom's spelling on case-insensitive match                                                |

Plus the `soma://biomarkers` resource — the full biomarker dictionary.

> **Rule:** always call `get_medical_summary` before interpreting any health data — allergies and active conditions are safety-critical.

The `add_*` / `log_*` write tools require the DB schema to match this checkout's
migrations; until the app applies migrations 0002+ they refuse with the
read-only schema note (see [Database](#database)).

## Build

```sh
cd mcp
pnpm install
pnpm build        # → dist/index.js
```

## Register

**Claude Code** — the repo ships `.mcp.json`, so the server is picked up
automatically when working in this project. To register globally:

```sh
claude mcp add --scope user soma -- node /path/to/soma/mcp/dist/index.js
```

**Claude Desktop** — add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "soma": {
      "command": "node",
      "args": ["/path/to/soma/mcp/dist/index.js"]
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

## Notes

- No raw SQL is exposed — only typed, validated tools.
- `add_lab_panel` reuses the app's unit-conversion (`src/lib/units.ts`) and
  fuzzy-matching (`src/lib/fuzzy.ts`) code paths; unmapped or inconvertible
  rows reject the whole panel atomically.
- Panels written via MCP currently get `import_method = "manual"`; a dedicated
  `mcp` source value needs a schema migration (TODO).
