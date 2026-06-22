<p align="center">
  <img src="docs/assets/logo.svg" width="116" alt="Soma logo" />
</p>

<h1 align="center">Soma</h1>

<p align="center">
  <b>Personal Health Dashboard</b> — privacy-first, local-first, yours.<br/>
  One timeline for labs, medications, doctor visits and diagnoses,<br/>
  built for people who move between countries and run regular blood-work cycles.
</p>

<p align="center">
  <a href="https://github.com/mdportnov/soma/actions/workflows/ci.yml"><img src="https://github.com/mdportnov/soma/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/mdportnov/soma/actions/workflows/release.yml"><img src="https://github.com/mdportnov/soma/actions/workflows/release.yml/badge.svg" alt="Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" /></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-5a5a5a" alt="Platforms" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-2.x-24C8DB?logo=tauri&logoColor=white" alt="Tauri 2" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Rust-stable-DEA584?logo=rust&logoColor=black" alt="Rust" />
  <img src="https://img.shields.io/badge/SQLite-Drizzle%20ORM-044a64?logo=sqlite&logoColor=white" alt="SQLite + Drizzle" />
  <img src="https://img.shields.io/badge/local--first-%F0%9F%94%92%20your%20data%20stays%20yours-0d9488" alt="Local-first" />
</p>

---

## Why Soma

If you don't have a permanent medical record in one country — you travel, you relocate, you do a
biohacking blood panel every 3–6 months in whatever lab is nearby — your health data ends up
scattered across PDFs, photos and memory. Soma puts all of it into a single local database with
one defining feature competitors don't have:

> **The medication overlay.** Toggle any drug or supplement on a biomarker's trend chart and see
> its intake period as a band over the graph — _"started taking X at dose Y → marker Z moved"_ at
> a glance.

Everything else follows from that: a seeded biomarker dictionary with reference _and_ optimal
ranges, a unified horizontal timeline of every health event, and an AI import pipeline that turns
a photo of a lab report in any language into structured, reviewed, unit-normalized results.

## Features

- 🧬 **Biomarker dictionary** — ~180 seeded markers (CBC, lipids, hormones, thyroid, vitamins, …)
  with reference & optimal ranges, **sex/age-specific ranges**, plain-language explanations (EN/RU),
  multilingual aliases, custom markers supported
- 📈 **Trend charts** — value over time with shaded norm/optimal bands, **clinically-aware
  out-of-range & critical flags**, cross-panel change detection, and **side-by-side comparison of
  two lab dates**
- 💊 **Medications & supplements** — dose, schedule, intake periods, purpose; overlay on any chart;
  **drug-allergy interaction warnings** and an **adherence log** (mark taken/skipped, % + streak)
- 🩺 **Visits, diagnoses, prescriptions** — full CRUD, linked together with detail pages
- 🚑 **Allergies & Emergency Card** — severity-aware allergy records (anaphylactic entries are
  protected from deletion) and a printable emergency summary (blood type, conditions, meds, allergies)
- 💉 **Vaccines** — records with dose series & expiry, a WHO childhood-immunization calendar, and
  travel/actionable vaccine guidance
- 🩻 **Imaging** — X-ray / CT / MRI / ultrasound / … records, entered manually or AI-imported
- 📓 **Journal** — weight, blood pressure and symptom logs, with weight-goal projection
- 🗓️ **Unified timeline** — labs, visits, diagnoses as dots, medication periods as bars, one scale
- 🤖 **AI import** (bring your own key) — PDF/photo in any language for **labs, vaccine certificates,
  discharge summaries, imaging reports, prescriptions and allergy records** → structured extraction →
  deterministic dictionary mapping → **mandatory human review** before anything is saved
- ✨ **AI assistant** (bring your own key) — a **health-context chat** and one-tap **trend
  interpretation** on any biomarker; vendor-agnostic, with a not-medical-advice disclaimer on every answer
- 🌙 **Lifestyle context** — daily **sleep, training and stress/energy** cards that enrich the AI
  health context; manual entry today, with a designed path to Apple Health / Google Fit sync
- 🔔 **Reminders feed** — medication-intake nudges and **scheduled re-testing** (every N months) as
  passive, **in-app** notifications; nothing leaves your device, no OS notifications
- 🖨️ **Doctor report** — a configurable **PDF summary** (problems, meds, allergies, recent labs) to
  hand a clinician, generated entirely on-device
- 🔎 **Search & Command Palette** — full-text search (SQLite FTS5) across every record, ⌘K palette
- 🔐 **Encrypted backups** — AES-256-GCM snapshots (Argon2id key) into your own cloud-synced folder
  (iCloud / Drive / Dropbox / OneDrive); the live database never leaves the device
- 🔒 **Optional at-rest encryption** — keep the live database encrypted on disk while the app is
  closed (Argon2id + AES-256-GCM), unlocked automatically via the OS keychain or with a passphrase
- 🧰 **Local MCP server** — typed stdio tools over your `soma.db` for AI assistants, one-click setup
- 🌍 **Cross-country units** — Cyrillic-aware unit normalization + per-analyte molar conversions
  (mg/dL ↔ mmol/L, nmol/L ↔ ng/mL, …); unknown conversions are flagged, never guessed
- 📤 **No lock-in** — full JSON export, lab results CSV export
- 🌗 Light/dark theme, **EN/RU localization**, responsive, keyboard-friendly desktop UI

## Privacy model

| Principle          | Implementation                                                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Local-first        | All data in a local SQLite file; fully functional offline                                                                                       |
| AI is opt-in       | Disabled by default; every AI surface shows a stub until you add a key                                                                          |
| Keys in keychain   | API keys live in the OS keychain (macOS Keychain / Windows Credential Manager / Secret Service) — never in the DB or config files               |
| Explicit egress    | Documents are sent to your chosen AI provider only when you click import; network access is scoped to provider APIs only                        |
| Encrypted backups  | Snapshots are AES-256-GCM encrypted with an Argon2id key from your passphrase before reaching a cloud-synced folder — unreadable without it     |
| At-rest encryption | Optional: the live database is kept encrypted on disk (Argon2id + AES-256-GCM) whenever the app is closed; in the clear only while the app runs |
| Auditability       | Every imported value keeps its original `raw_label` from the source document                                                                    |
| Not medical advice | Every AI output carries a disclaimer                                                                                                            |

## Getting started

### Download

Grab the installer for your OS from [**Releases**](https://github.com/mdportnov/soma/releases) —
`.dmg` (macOS, Apple Silicon & Intel), `.msi`/`.exe` (Windows), `.deb`/`.rpm`/`.AppImage` (Linux).

### Build from source

Prerequisites: **Node 22+**, **pnpm**, **Rust (stable)**, **[Bun](https://bun.sh)**
(used to compile the bundled MCP sidecar), and the
[Tauri system dependencies](https://tauri.app/start/prerequisites/) for your OS.
On **Linux**, the OS keychain is the freedesktop **Secret Service** — install/enable
`gnome-keyring` (or KWallet) so API keys and the backup passphrase can be stored.

```bash
git clone https://github.com/mdportnov/soma.git
cd soma
pnpm install                                # also installs the mcp/ sidecar deps (postinstall)
pnpm tauri icon docs/assets/logo.svg        # regenerate platform icon set from the brand mark
# macOS .icns uses the padded variant (Apple icon grid), overwrite it after the line above:
pnpm tauri icon docs/assets/logo-macos.svg -o /tmp/soma-icons && cp /tmp/soma-icons/icon.icns src-tauri/icons/icon.icns
pnpm tauri dev                             # run the app
pnpm tauri build                           # production installers
```

## Development

| Command                     | What it does                                                         |
| --------------------------- | -------------------------------------------------------------------- |
| `pnpm tauri dev`            | Run the desktop app with hot reload                                  |
| `pnpm dev`                  | Frontend only (Vite dev server; DB requires the Tauri shell)         |
| `pnpm lint` / `pnpm format` | ESLint / Prettier (write mode; `format:check` in CI)                 |
| `pnpm typecheck`            | `tsc --noEmit`                                                       |
| `pnpm build`                | Typecheck + production frontend build                                |
| `pnpm db:generate`          | Regenerate Drizzle migrations after editing `src/db/schema.ts`       |
| `pnpm mcp:sidecar`          | Compile the MCP sidecar for the host (auto-run by `tauri dev/build`) |
| `cargo fmt && cargo clippy` | Rust formatting / lints (run inside `src-tauri/`)                    |

CI (`.github/workflows/ci.yml`) runs Prettier, ESLint, TypeScript, the frontend build, a
migrations-up-to-date check, `rustfmt` and `clippy` on every push and PR.
Releases (`.github/workflows/release.yml`) build installers for **macOS (arm64 + x86_64),
Windows and Linux** and attach them to a draft GitHub Release on every `v*` tag.

## Architecture

```
src/
├── db/
│   ├── schema.ts             # Drizzle schema — single source of truth
│   ├── migrations/           # generated by drizzle-kit, applied in-app at startup
│   ├── client.ts             # Drizzle over tauri-plugin-sql (sqlite-proxy driver)
│   ├── seed-biomarkers.ts    # seeded dictionary (~180) with ranges + EN/RU aliases
│   ├── search.ts             # SQLite FTS5 full-text search across records
│   └── repos.ts              # typed data access + unified timeline selector
├── ai/
│   ├── model-registry.json   # configurable model list (vision/pdf flags), no hardcoded models
│   ├── types.ts              # AIProvider: extractStructured / mapBiomarker / chat / testKey
│   ├── prompts.ts            # all extraction prompts + the mandatory AI disclaimer
│   ├── providers/            # Anthropic · OpenAI · Gemini · OpenRouter adapters
│   ├── import/               # doc-type registry: lab · vaccine · discharge · imaging ·
│   │                         #   prescription · allergy (extract → validate → review → save)
│   ├── pipeline/map.ts       # deterministic mapping: normalize → exact/alias → fuzzy → AI
│   └── keystore.ts           # OS keychain bridge (Rust commands)
├── pages/                    # Dashboard · Timeline · Biomarkers · Labs · Import wizard ·
│                             #   Medications · Visits · Diagnoses · Allergies · Vaccines ·
│                             #   Imaging · Journal · Lifestyle · Notifications · Doctor report ·
│                             #   Emergency card · Onboarding · Settings
└── components/
    ├── app/CommandPalette.tsx         # ⌘K search/navigation
    ├── charts/TrendChart.tsx          # ref/optimal bands + medication overlay
    └── charts/HorizontalTimeline.tsx  # all events on one horizontal scale
src-tauri/                    # Rust shell: SQL/dialog/fs/http plugins + keyring commands
    ├── backup.rs             # encrypted .somabk snapshots (Argon2id + AES-256-GCM)
    ├── vault.rs              # optional at-rest DB encryption (encrypt-when-closed vault)
    └── mcp.rs                # one-click local MCP server setup
```

### AI import pipeline

The pipeline is collision-proof by design: the model never invents biomarkers, mapping is
deterministic code, and nothing reaches the database without human confirmation.

```mermaid
flowchart LR
    A[📄 PDF / photo<br/>any language] -->|strict JSON-only prompt| B["Phase 1 — Extraction<br/>raw_label · value · unit · ref_range"]
    B --> C{"Phase 2 — Mapping<br/>(deterministic)"}
    C -->|"1. normalize"| C1[exact / alias match<br/>incl. translations]
    C1 -->|miss| C2[fuzzy match<br/>Levenshtein + trigram<br/>+ ambiguity guard]
    C2 -->|"still ambiguous"| C3["narrow AI call:<br/>pick from candidate list<br/>or return null"]
    C1 --> D
    C2 --> D
    C3 --> D["Phase 3 — Human review<br/>🟢 exact · 🟡 fuzzy · 🔵 AI · 🔴 unmatched<br/>duplicates & unit conflicts flagged"]
    D -->|user confirms| E[(lab_result<br/>+ raw_label audit trail)]
```

## Roadmap

### ✅ v0.1 — MVP core

- [x] Drizzle/SQLite schema + migrations for all entities
- [x] Biomarker dictionary with reference/optimal ranges, aliases, custom markers
- [x] Manual lab entry → trend charts with range bands
- [x] Medications/supplements with intake periods + **overlay on biomarker charts**
- [x] Visits, diagnoses, prescriptions
- [x] Unified horizontal timeline
- [x] AI settings: provider/model registry, keychain, key validation, stubs when disabled
- [x] AI import: extraction → deterministic mapping → review UI
- [x] JSON/CSV export, light/dark theme

### ✅ v0.2 — Sections, safety & polish _(shipped)_

- [x] Allergies (severity-aware, anaphylactic delete guard) + drug-allergy interaction warnings
- [x] Vaccines: dose series & expiry, WHO childhood-immunization calendar, travel guidance
- [x] Imaging records (X-ray / CT / MRI / ultrasound), manual + AI import
- [x] Journal: weight, blood pressure & symptoms, with weight-goal projection
- [x] Emergency Card (blood type, conditions, medications, allergies)
- [x] AI import for all doc types: lab · vaccine · discharge · imaging · prescription · allergy
- [x] Dictionary grown to ~180 markers + plain-language explanations (EN/RU)
- [x] Sex/age-specific reference ranges + clinically-aware critical flags
- [x] Cross-panel correlation & notable-change detection
- [x] Encrypted cloud-folder backups (Argon2id + AES-256-GCM) with scheduled runs & restore
- [x] Full-text search (FTS5) + ⌘K command palette, attachment viewer
- [x] Local MCP server with one-click setup
- [x] Navigation: route registry, breadcrumbs, hierarchical back; entity detail pages & links
- [x] UI localization (EN/RU), searchable unit comboboxes, custom biomarkers with ranges/aliases

### ✅ Quality of life _(shipped)_

- [x] Side-by-side comparison of two lab dates
- [x] Medication adherence log (mark taken/skipped, trailing % + streak)
- [x] Per-lab unit memory & an expanded molar-conversion table
- [x] In-app editor for seeded dictionary entries (ranges & aliases, edit-safe across seed sync)

### ✅ v0.3 — AI analysis & lifestyle context _(shipped)_

- [x] AI chat with full health context (trends, meds, diagnoses)
- [x] Trend interpretation summaries with the mandatory disclaimer
- [x] **Lifestyle context cards** (sleep, training, stress) feeding the AI health
      context — manual entry today, with a documented design for future
      Apple Health / Google Fit / Health Connect sync
      ([`docs/health-data-integrations.md`](docs/health-data-integrations.md))

> _Descoped:_ a PDF "research knowledge base" (RAG over your own papers) was
> intentionally dropped — out of scope for a local-first records tool.

### ✅ v1.0 — Reports, reminders & encryption _(shipped)_

- [x] **PDF report generator for doctors** — configurable range & sections, built
      on-device
- [x] **In-app reminders feed** — medication-intake nudges & scheduled
      re-testing (every N months), surfaced as passive notifications only;
      nothing leaves the device and no OS notifications are raised
- [x] **Optional at-rest database encryption** — encrypt-when-closed vault
      (Argon2id + AES-256-GCM), with keychain auto-unlock or passphrase-on-launch

> _Descoped:_ multi-profile (family) and viewer-role sharing — Soma stays a
> single-profile, local-first record; the doctor PDF covers sharing outward.

## Tech stack

| Layer    | Choice                                                                        |
| -------- | ----------------------------------------------------------------------------- |
| Shell    | [Tauri 2](https://tauri.app) — Rust core, ~10 MB bundle                       |
| Frontend | React 19 + TypeScript + Vite                                                  |
| Styling  | Tailwind CSS v4, shadcn-style component kit, lucide icons                     |
| Charts   | Recharts                                                                      |
| Database | SQLite (`tauri-plugin-sql`) + Drizzle ORM                                     |
| AI       | Multi-provider behind one `AIProvider` interface; multimodal models only      |
| Secrets  | OS keychain via the Rust `keyring` crate                                      |
| CI/CD    | GitHub Actions: lint/typecheck/build matrix + cross-platform release pipeline |

## Contributing

### Branching workflow

- `master` is the stable branch — always green, never force-pushed, no direct commits.
- Features: branch from `master` as `feature/<name>` (e.g. `feature/onboarding`).
- Fixes: branch from `master` as `fix/<name>`.
- All changes land in `master` via a PR, merged with **squash merge** — one clean commit
  per feature/fix; delete the branch after merge.

### Checks

Issues and PRs are welcome. Before pushing, please run:

```bash
pnpm format && pnpm lint && pnpm typecheck && pnpm build
cd src-tauri && cargo fmt && cargo clippy --all-targets
```

Conventions: schema changes go through `src/db/schema.ts` + `pnpm db:generate` (never edit
generated SQL by hand), AI behavior changes go through `src/ai/prompts.ts` and
`src/ai/pipeline/`, and new AI providers are adapters in `src/ai/providers/` — the pipeline
itself must stay vendor-agnostic.

## License

[MIT](LICENSE) © Mikhail Portnov

> **Disclaimer:** Soma is a personal data-organization tool, not a medical device. Nothing in the
> app — including AI-generated summaries — is medical advice. Always consult a qualified
> clinician.
