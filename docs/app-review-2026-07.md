# Soma — UX, AI & Architecture Review (July 2026)

A full audit of the app across five dimensions: user experience & onboarding, the AI import
pipeline, the AI assistant & MCP server, the data layer (storage, backups, encryption), and
cross-cutting error handling. Findings are ordered by severity within each section and carry
`file:line` evidence. A prioritized action plan is at the end.

The three findings marked **[verified]** were independently re-checked against the source after
the initial audit pass.

---

## 1. Critical — data integrity & availability

### 1.1 Full-text search is silently dead on fresh installs **[verified]**

`src/db/search.ts:16` documents `fts_records` as an FTS5 virtual table created by
"migration 0006" — but the migrations folder contains only `0000_abandoned_scream.sql`, and no
`CREATE VIRTUAL TABLE` statement exists anywhere in the codebase. The table creation was lost
when migrations were squashed. Every FTS call site swallows the resulting "no such table" error
(`src/db/search.ts:269-271, 283-286, 336-339`), so Search and the ⌘K Command Palette silently
return zero results forever, with only a `console.warn`.

**Fix:** add a real migration creating `fts_records`; stop swallowing the error (at minimum,
surface a one-time "search index unavailable" notice).

### 1.2 Vault lock is not crash-safe — power loss can destroy the only copy of the DB **[verified]**

`vault.rs` writes the encrypted vault with a plain `fs::write` (no temp file, no fsync, no
rename) and then deletes the plaintext DB: `write_vault_from_snapshot`
(`src-tauri/src/vault.rs:252-264`) → `vault_lock_keychain` → `remove_plaintext`
(`vault.rs:378-383`); the passphrase path does the same (`vault.rs:386-415`). If the OS cache
hasn't flushed when power is lost, the vault is truncated and the plaintext is already gone —
total, unrecoverable data loss. The safe pattern (atomic `fs::rename`) already exists in
`restore_backup` (`src-tauri/src/backup.rs:485`) but is not used on the lock path.

**Fix:** write vault to a temp file, `sync_all()`, `rename`, only then remove the plaintext.

### 1.3 Argon2 KDF parameters are not stored in backup/vault headers

Both formats derive the key with `Argon2::default()` (`backup.rs:48`, `vault.rs:90`) and persist
only salt + nonce (`backup.rs:9,30`, `vault.rs:17,43`). If a future `argon2` crate bump changes
the default m/t/p cost parameters (this has happened historically), every previously written
backup and vault becomes permanently undecryptable.

**Fix:** persist the Argon2 parameters in the file header and use them on decrypt; pin explicit
params on encrypt.

### 1.4 `schemaVersion` is the *count* of migration files — old backups are wrongly rejected **[verified]**

`export const schemaVersion = Object.keys(migrationFiles).length` (`src/db/migrate.ts:29`),
currently **1** after the squash. It is stamped into every backup (`src/lib/backup.ts:124`,
`backup.rs:80`), and the restore UI blocks any backup with `schemaVersion > current` as "newer
than app" (`src/components/.../BackupCard.tsx:505,573-577`). Backups written by pre-squash builds
carry version ~6, so the app refuses to restore the user's own older backups.

**Fix:** replace with an explicit monotonic constant, and accept legacy version numbers on
restore.

### 1.5 Attachments live outside every integrity guarantee

Imported PDFs/photos are copied to `appDataDir()/attachments` (`src/lib/attachments.ts:17-24`),
but:

- **Not in backups** — backup/vault snapshot only the SQLite file via `VACUUM INTO`
  (`src/db/client.ts:63-66`). Restore on a new device yields rows pointing at missing files.
- **Not encrypted by the vault** — `vault.rs` encrypts only `soma.db`; the most sensitive raw
  documents stay in cleartext even with at-rest encryption on.
- **Never deleted from disk** — `deleteLinkedAttachments` (`src/db/repos.ts:408-415`) removes
  only the DB row; physical files accumulate forever, including after record deletion.

### 1.6 No real transactions — multi-step writes can partially apply

The sqlite-proxy driver runs each statement on a pooled connection, so `BEGIN/COMMIT` was
abandoned (`migrate.ts:16-18`, `repos.ts:394-397`). Consequences:

- `createPanelWithResults` (`repos.ts:336-403`): a crash between the panel insert and the
  results insert leaves an orphan panel (there is a compensating delete for the failure case,
  but not for a process death).
- `deleteVisit` is five separate writes (`repos.ts:693-701`); `deletePanel` is three
  (`repos.ts:417-422`) — a crash mid-sequence leaves half-detached records.
- Migrations run with `PRAGMA foreign_keys = OFF` and no transaction (`client.ts:89-91`,
  `migrate.ts:84-97`); a non-idempotent data backfill that fails halfway would double-apply on
  retry.

**Fix:** route multi-statement mutations through a single-connection transactional path (Tauri
command or dedicated pinned connection), or add compensations everywhere and make backfills
idempotent by construction.

---

## 2. High — reliability of the UI layer

### 2.1 Failed reads = infinite spinner on every page

`useQuery` tracks `error` (`src/hooks/useQuery.ts:7,29,38`) but **no page consumes it**. The
universal guard `if (loading || !data) return <Loading />` renders a spinner forever when a
query rejects (loading=false, data=null). Affects ~30 pages (`src/pages/Medications.tsx:67`,
`Dashboard.tsx:108`, `Labs.tsx:28`, `Timeline.tsx:95`, …). The root `ErrorBoundary` can't help —
the rejection is swallowed inside the hook.

**Fix (one place):** a shared page/data wrapper that renders error + Retry from `useQuery.error`.

### 2.2 Failed writes are silent — no error toast channel exists

The Toast API has only `show`/`showAction` (`src/components/app/Toast.tsx:13-23`) — no error
variant. ~20 mutation handlers across 8 pages are `await mutate(); void reload();` with no
try/catch (`src/pages/Allergies.tsx:100-124`, `Diagnoses.tsx`, `Journal.tsx`,
`Medications.tsx`, `LabPanelDetail.tsx`, …). A rejected write (DB locked, disk full, guard
throw) is logged to file via the global `unhandledrejection` hook (`src/lib/logger.ts:43`) but
the user sees **nothing** — the UI keeps showing stale state as if the action succeeded. Failed
Undo callbacks are equally silent.

**Fix:** add `toast.error`, wrap mutations (a `useMutation`-style helper would fix all call
sites uniformly).

### 2.3 `reload()` lies about completion

`reload: async () => setTick(t => t + 1)` (`src/hooks/useQuery.ts:38`) resolves immediately,
before the refetch runs. Callers that `await reload()` (e.g. `ImportWizard.tsx:145-147`
refreshing biomarker lookups before save) race against stale data.

**Fix:** have `reload()` return the actual refetch promise.

### 2.4 Single root-only ErrorBoundary

Mounted once at the top (`src/main.tsx:16`); a render throw on any page tears down the whole
shell. Routes are static (`src/App.tsx:46-77`) and React Router's route-level error handling is
unused.

**Fix:** per-route boundary (one wrapper in the route table).

---

## 3. AI import pipeline

The pipeline itself is well-architected (modular doc-type registry, human-in-the-loop review,
deterministic mapping with anti-collision safeguards, solid transport). The gaps:

### 3.1 No duplicate-document detection (HIGH)

Re-importing the same file silently creates a second full record set: attachments get a new
`${Date.now()}-name` (`src/lib/attachments.ts:21`), `createPanelWithResults` inserts
unconditionally (`repos.ts:336`), vaccine/discharge saves have no existence check. Only
within-batch dedup (`src/ai/pipeline/map.ts:283`) and non-blocking name-match badges for
prescription/allergy exist. Same lab PDF imported twice = every biomarker trend point doubled.

**Fix:** content-hash the source file, warn "already imported on <date>" before extraction; add
date+panel-level duplicate warnings on save.

### 3.2 No file-size/page limits, no cost estimate (HIGH)

`runExtraction` (`src/pages/ImportWizard.tsx:195-208`) base64-encodes an arbitrarily large file
and sends it whole. Input is unbounded → provider 413s (which land in the unhelpful `unknown`
error class, see 3.5), truncation, unbounded cost. No pre-flight estimate is shown.

### 3.3 Truncated LLM output is unrecoverable (HIGH)

`extractJson` (`src/ai/prompts.ts:227-263`) requires balanced brackets; output truncated at the
token cap throws `bad_response`, and Retry re-issues the identical request with the same
`maxTokens` (`ImportWizard.tsx:269`) — large multi-page panels can never import.

**Fix:** salvage complete array elements from truncated output, and/or escalate `maxTokens` /
suggest page-splitting on retry.

### 3.4 AI biomarker-mapping fallback: sequential and silently lossy (HIGH)

`mapExtractions` awaits `provider.mapBiomarker` one row at a time (`src/ai/pipeline/map.ts:245-276`),
each with its own 60s timeout — N ambiguous rows = N sequential paid round-trips. Only `auth`
errors surface; `rate_limit`/`network` failures are `console.warn`ed and rows just appear
"unmatched" with no banner explaining that the AI step failed (`map.ts:272-273`).

### 3.5 Import state is memory-only; mid-import close loses paid work (MEDIUM)

`step`/`draft`/`filePath` are React `useState` (`ImportWizard.tsx:95-100`). Closing the app after
extraction but before save discards the reviewed draft; the user re-uploads and pays again. No
cancellation is wired either — navigating away leaves the 60s request running and `setState`
fires on an unmounted component.

**Fix:** persist the extracted draft (localStorage or a `pending_imports` table) and offer
"resume review"; abort in-flight requests on unmount; add a Cancel button.

### 3.6 Discharge-summary allergies are always `category: "drug"` (MEDIUM, safety)

`discharge.save` hardcodes `category: "drug"` (`src/ai/import/docs/discharge.tsx:208`) and the
extraction never captures a category. Food/environmental allergies from an epicrisis are
mis-categorized as drug allergies — which then feed the drug-allergy interaction warnings.

### 3.7 `unknown` provider errors give no guidance (MEDIUM)

`classifyStatus` (`src/ai/providers/base.ts:262`) maps only 401/403/429/503/529. 400 (bad
model), 404, 413 (the most likely real failure for big documents), 500 → `unknown` → banner with
raw provider body text and no affordance (`ImportWizard.tsx:173`).

### 3.8 Custom model bypasses capability checks (MEDIUM)

`effectiveModelId` prefers the free-text `customModel` over the dropdown
(`src/ai/index.ts:52-54`), skipping the vision/PDF filter (`Settings.tsx:405`) — and silently
overrides the dropdown selection with no UI indication. `testKey` is text-only, so a text-only
custom model passes the test and fails at extraction with an opaque error.

### 3.9 Privacy notice gap (MEDIUM)

Chat sends only a distilled summary (`src/ai/context.ts:1-10`), but import uploads the **entire
raw document** to the provider. No explicit UI notice at the point of import says the document
leaves the device.

### 3.10 Minor parsing edges (LOW)

- `numberOrNull` string fallback: `"1,234"` (US thousands) parses as `1.234` — latent 1000×
  error (`src/ai/import/validate.ts:47-70`).
- `parseRefRange`: `"1,234.5"` → low 1.234 / high 5 (`src/ai/import/docs/lab.tsx:652`).
- All-qualitative lab reports are reported as "wrong document type"
  (`lab.tsx:258`, `ImportWizard.tsx:209-217`).
- `isoDateOrNull` accepts `2099-99-99` (`validate.ts:26-28`); no future-date or plausibility
  bounds anywhere in import validation.

---

## 4. AI assistant & trend interpretation

### 4.1 No streaming, no cancellation (HIGH for perceived quality)

`AIProvider.chat` returns `Promise<string>` (`src/ai/types.ts:114`); the UI shows a static
"Thinking…" for up to 60s (`src/pages/AiAnalysis.tsx:148-154`) with no way to abort
(`base.ts:107-139` has only the internal timeout).

### 4.2 Chat history: not persisted, unbounded, lossily encoded

- History is component `useState` (`AiAnalysis.tsx:32`) — navigation loses the conversation.
- Every turn resends the full history with no truncation (`base.ts:81-86`); long chats
  eventually blow the context window as a non-retryable `unknown` error.
- Multi-turn is flattened into one `"User:/Assistant:"` text blob instead of native role
  messages (`base.ts:81-90`) — hurts model quality and prompt caching on all four vendors.

### 4.3 Trend interpretations are never cached

`AiInterpretation.tsx:26-30,88` holds the result in local state; every visit to a biomarker page
starts at idle and each generation is a fresh paid call. Cache keyed on a data hash (series +
ranges + meds) would eliminate repeat cost and enable history.

### 4.4 Context transparency

The user can't see or edit what `buildHealthContext` (`src/ai/context.ts:83-158`) sends —
no "view context" affordance, no per-category opt-out. Also `MAX_ABNORMAL = 25` caps labs but
diagnoses/meds/allergies are uncapped.

### 4.5 Minor

- Disclaimer renders only under the last assistant message (`AiAnalysis.tsx:143`).
- Chat/trend context is rebuilt only on mount (`AiAnalysis.tsx:24-30`) — data added mid-session
  is invisible.
- Response cap `maxTokens: 4096` hardcoded (`base.ts:89`), silent truncation, no "continue".
- Only Gemini maps truncation/safety finishes to useful errors (`gemini.ts:26-46`); Anthropic/
  OpenAI/OpenRouter throw generic "Empty response" (`anthropic.ts:40-41`, `openai.ts:35-42` —
  which also ignores `status: "incomplete"` on reasoning models).

---

## 5. MCP server

### 5.1 Unauthenticated, unconfirmed writes to health data (HIGH)

The sidecar exposes write tools (`add_lab_panel`, `add_allergy`, `add_vaccine`, `log_symptom` —
`mcp/src/index.ts:89-820`) with no auth and no in-app confirmation; `dryRun` defaults to `false`.
Any local MCP client (i.e. any LLM the user connects) can silently insert safety-critical
records. `mcp/README.md:4-6` markets "no network, no ports" without mentioning writes.

**Fix:** default writes to `dryRun: true` + an in-app "pending MCP writes" approval queue, or at
minimum a settings toggle "allow MCP writes" (off by default).

### 5.2 Correctness gaps around sidecar writes (MEDIUM)

- Provenance lost: panels stamped `importMethod: "manual"` (`index.ts:623`; README TODO at
  `mcp/README.md:79-81`).
- Sidecar writes don't update the FTS index or notify the running app — UI/search silently
  stale.
- App never sets `journal_mode` (only `busy_timeout`, `src/db/client.ts:85`) while the sidecar
  forces WAL (`mcp/src/db.ts:101-102`) — journal-mode disagreement between two processes.
- With the vault enabled and the app closed, `soma.db` doesn't exist → sidecar throws
  "database not found" (`mcp/src/db.ts:95-99`, `vault.rs:363-373`). Undocumented failure mode.
- Raw Drizzle/SQLite exceptions (e.g. `SQLITE_BUSY` past 5s) bubble uncaught.
- `mcp_install` detection compares only the `command` string, ignoring `args`
  (`src-tauri/src/mcp.rs:119-157`).
- Zero tests for the MCP package (no test script in `mcp/package.json`).

Strengths worth keeping: schema-drift gating to read-only (`mcp/src/db.ts:64-92`), strict input
validation, atomic panel insert, `dryRun` previews.

---

## 6. UX & onboarding

### 6.1 Localization gaps break the Russian experience (HIGH)

- Hardcoded English placeholders across forms: `Vaccines.tsx:312,335,368,380,388`,
  `Allergies.tsx:306,370,377`, `Medications.tsx:387,428,451,471` (+ literal `"no dose set"`
  fallback at `:175`), `VisitDetail.tsx:375,398,413`, `Visits.tsx:187`, `Diagnoses.tsx:538`,
  `LabPanelNew.tsx:155`.
- `formatDate` always uses `en-GB` (`src/lib/utils.ts:16`; also `Journal.tsx:1150`,
  `EnrichedTimeline.tsx:124`); decimal separators never localized (`utils.ts:23`); lab cost
  hardcoded `$` (`LabPanelDetail.tsx:82`).
- aria-labels are English literals (`Toast.tsx:105`, `dialog.tsx:98`, `date-input.tsx:217`,
  `Breadcrumbs.tsx:8`).
- Untranslated English strings thrown as errors surface verbatim (`Settings.tsx:459-465,583`).

### 6.2 Dialogs: no focus trap, silent data loss (HIGH)

`src/components/ui/dialog.tsx` has `role="dialog"`/`aria-modal` but no focus containment, no
autofocus, no focus-return. Backdrop click (`dialog.tsx:75`) and Escape (`:53`) close instantly;
there is no dirty-state tracking anywhere in the app — a half-filled form dies on a stray click
with no warning and no undo.

### 6.3 Marquee features are undiscoverable (MEDIUM)

Onboarding covers profile/interests/restore only; the `GettingStarted` checklist nudges 3 items
(`src/components/app/GettingStarted.tsx:42-65`). The medication overlay — the app's defining
feature (`TrendChart.tsx:18,175-197`) — has no hint/tooltip anywhere. Backups, encryption, MCP
and export live only deep in a 12-card flat Settings page (`Settings.tsx:86-99`).

### 6.4 Command palette: search-only, routes to lists (MEDIUM)

`routeFor` sends `diagnosis`/`medication`/`allergy`/`symptom` matches to *list* pages instead of
the record (`CommandPalette.tsx:31-54`); no command actions ("Add medication", "Import…").
(And with 1.1 unfixed, the palette currently returns nothing at all.)

### 6.5 Minor

- No skeletons; every page shows the same full-page spinner (`Loading.tsx`).
- Onboarding is hard-gated before the router (`AppContext.tsx:148`) — no "skip and explore".
- Undo toasts auto-dismiss in 6s (`Toast.tsx:74`) — tight for screen-reader users.
- DB-boot failure screen and ErrorBoundary dump raw error/stack text
  (`AppContext.tsx:138`, `ErrorBoundary.tsx:28,38`).

Strengths: uniform undo-instead-of-confirm pattern, actionable empty states, identical en/ru
key sets with proper fallback, breadcrumbs + scroll restoration, keychain-status-aware AI setup
with a real "Test key" round-trip, drug-allergy inline warnings, anaphylaxis delete protection
enforced in both repo guard and UI.

---

## 7. Validation, performance, ops

- **Semantic validation missing at boundaries:** no shared validator; future dates allowed in
  most fields (`disableFuture` is opt-in, `date-input.tsx:17-18`), no plausibility ranges for
  lab values/weight/BP; each form re-implements ad-hoc checks.
- **Full-table loads:** `getLatestResults` selects all results then reduces in JS
  (`repos.ts:464-481`); list queries have no LIMIT; years of daily logs will hurt. Only search
  caps output (LIMIT 40).
- **No corruption detection:** `PRAGMA integrity_check` never runs; decrypt validates only the
  16-byte SQLite magic.
- **Backup write not atomic** (`backup.rs:365-379`); truncated newest file can masquerade as the
  latest backup while rotation keeps 12.
- **No updater:** `tauri-plugin-updater` absent (`src-tauri/src/lib.rs:116-135`), no version
  surfaced in UI for bug reports; `"csp": null` in `tauri.conf.json`.
- **Config reads silently default:** ~10 `catch → default` sites without logging
  (`dashboard-prefs.ts:42`, `notifications.ts:130,201`, `unit-memory.ts:27,40,95`, …).
- **Tests:** strong pure-logic coverage (units/mapping/validate/transport/Rust crypto), but zero
  component/e2e tests, zero MCP tests, no tests for `buildHealthContext`/prompt builders,
  doc-module `prepare`/`save`, `useQuery`, repos mutations, backup/encryption orchestration.

---

## Prioritized action plan

**P0 — data loss / broken feature (do first):**
1. Create the `fts_records` migration; stop swallowing FTS errors (1.1).
2. Crash-safe vault lock: temp + fsync + rename before deleting plaintext (1.2).
3. Persist Argon2 params in backup/vault headers (1.3).
4. Fix `schemaVersion` and accept legacy backup versions (1.4).
5. Include attachments in backup & vault; delete files on record delete (1.5).

**P1 — reliability users hit weekly:**
6. Error + Retry state for `useQuery` consumers (2.1) and a `toast.error` +
   mutation wrapper (2.2); `reload()` returning the real promise (2.3).
7. Duplicate-document detection on import (3.1); file-size guard + truncation salvage (3.2/3.3).
8. Persist in-progress import drafts; cancel/abort wiring (3.5).
9. MCP writes behind confirmation/opt-in; document the vault interaction (5.1/5.2).
10. Fix discharge allergy category (3.6) — small, safety-relevant.

**P2 — experience quality:**
11. Localize placeholders/dates/currency/aria (6.1); dialog focus trap + dirty guard (6.2).
12. Streaming + cancel + persisted history with native multi-turn roles (4.1/4.2); cached trend
    interpretations (4.3); "view context" transparency (4.4).
13. Feature discovery: medication-overlay hint, palette actions + record-level routing,
    Settings anchor nav (6.3/6.4).
14. Shared semantic validator (dates/ranges) used by both manual forms and AI import.

**P3 — hardening:**
15. Transactional multi-step writes; WAL alignment with the sidecar; integrity_check on boot.
16. Updater + visible app version; CSP; parallelize AI mapping fallback with a failure banner.
17. Test the gaps: MCP tools, doc modules, context/prompt builders, component smoke tests.
