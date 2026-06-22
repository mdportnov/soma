# DESIGN: Consumer Health & Fitness Integrations (Lifestyle auto-population)

> Forward-looking design / research note. **Nothing here is implemented.** This document scopes how Soma _could_ auto-populate the new `lifestyle_log` (sleep, training, stress, vitals) from consumer health platforms — Apple Health / HealthKit, Google Fit, Android Health Connect, Fitbit, Garmin/Oura/Whoop — without breaking the local-first, opt-in, keychain-secret, explicit-egress privacy model that already governs AI and backups. Written to match the depth and verdict style of `docs/PRD-health-record-expansion.md`.

## Overview

Soma is a **desktop** app (Tauri 2 — macOS / Windows / Linux). It already ships a `lifestyle_log` table that users fill in by hand (`source = manual`). Lifestyle context (sleep, training, stress) is exactly the kind of data people _do not_ want to type every day, and it is exactly the kind of data their phone and wearable already collect. So the pull is obvious; the constraint is brutal.

**The central tension:** the two richest, most authoritative consumer health stores — **Apple HealthKit** and **Android Health Connect** — are **mobile-only**. They are on-device databases reached through platform entitlements and per-app permission prompts on iOS / Android. There is **no desktop HealthKit**, no macOS API to read an iPhone's Health database, and no desktop Health Connect. A Tauri desktop binary cannot link `HealthKit.framework` or bind the Health Connect SDK, full stop. Anything claiming "Apple Health on desktop" is either a file export, a cloud relay, or a companion mobile app.

This document is therefore honest about what is reachable from a desktop process today (**files and Web APIs**) versus what requires a **mobile bridge** (the on-device stores), and recommends a phasing that delivers value on desktop first without betraying the privacy model. The PRD that introduced the record-expansion work explicitly listed "Wearable / Apple Health sync" as **SKIP — desktop local-first, big platform cost** (capability #14). This note does not overturn that verdict; it scopes the _cheapest honest path_ to the same outcome, gated behind the same opt-in discipline as AI.

## Goals & non-goals

|              |                                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**     | Reduce manual `lifestyle_log` entry by importing sleep / steps / resting HR / workouts / HRV-stress from sources the user already uses.                 |
| **Goal**     | Preserve audit parity with the AI import pipeline: nothing lands in the DB without a `source` tag and a human-reviewable provenance trail.              |
| **Goal**     | Keep every integration **off by default**, **user-triggered**, and **scoped** — identical posture to the AI key flow.                                   |
| **Non-goal** | Continuous background sync / a daemon that phones home. Soma has no servers and gains none here.                                                        |
| **Non-goal** | Becoming a fitness tracker. We import _daily summaries_ into one-row-per-day `lifestyle_log`, not raw sample streams (heart-rate every 5s, GPS tracks). |
| **Non-goal** | Medical-grade fidelity. Lifestyle data is context for trend interpretation, not a clinical record. The standing not-medical-advice disclaimer applies.  |

## The `lifestyle_log` target

One row per profile per day. The device-mappable fields (the columns an integration may write):

| Field               | Type                              | Meaning                                                     | Device-fillable?    |
| ------------------- | --------------------------------- | ----------------------------------------------------------- | ------------------- |
| `sleepHours`        | real                              | total sleep duration                                        | ✅                  |
| `sleepQuality`      | int 1–5                           | subjective/derived sleep quality                            | ⚠️ derived          |
| `trainingMinutes`   | int                               | active workout minutes                                      | ✅                  |
| `trainingIntensity` | enum `light`/`moderate`/`intense` | session intensity                                           | ⚠️ derived          |
| `steps`             | int                               | daily step count                                            | ✅                  |
| `restingHeartRate`  | bpm                               | resting HR                                                  | ✅                  |
| `stressLevel`       | int 1–5                           | stress                                                      | ⚠️ proxy (HRV)      |
| `energyLevel`       | int 1–5                           | subjective energy                                           | ❌ manual only      |
| `notes`             | text                              | free text                                                   | ❌ manual only      |
| `source`            | enum                              | `manual` / `apple_health` / `google_fit` / `health_connect` | written by importer |

`source` is the provenance anchor. It already enumerates `apple_health | google_fit | health_connect`; a Web-API phase (Fitbit/Oura/Withings) would extend this enum (see Open Questions). `energyLevel` and `notes` are inherently subjective and stay manual even when other fields are device-filled — a partially-imported row is normal and must be supported.

The table already encodes two facts that shape this whole design:

- **`source` is a per-row enum on `lifestyle_log`** (`text(... { enum: ["manual","apple_health","google_fit","health_connect"] }).default("manual")`), not a separate provenance table. A row's `source` is the provenance anchor; every other field is nullable, so partial rows are first-class.
- **There is a `uniqueIndex` on `(profileId, date)`** — one row per profile per day, enforced by the DB. That uniqueness constraint is what makes import an **upsert** and forces the merge-policy question below to be answered explicitly rather than by accident.

The schema comment already points back to this document, so the table and this design are intentionally coupled.

## Candidate sources

For each source: what data it exposes, the auth model, and the **desktop feasibility verdict**. Verdicts mirror the PRD's ADOPT / ADAPT / SKIP register, scoped to "what can a desktop Tauri process realistically do."

| Source                          | Relevant data                                                        | Auth model                                                                       | Reaches our fields                 | Desktop verdict                                                                                                                                                                                                                  |
| ------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Apple Health / HealthKit**    | sleep stages, steps, resting HR, HRV (SDNN), workouts, active energy | On-device entitlement + per-type permission prompt; **iOS/watchOS/iPadOS only**  | All of sleep/steps/HR/HRV/workouts | **NO direct desktop access.** Only via (a) file export `export.xml`, or (b) a companion mobile app (Phase 3). No desktop HealthKit exists.                                                                                       |
| **Apple Health file export**    | same as above, as XML                                                | None — user taps "Export All Health Data" → `export.zip` containing `export.xml` | sleep, steps, HR, HRV, workouts    | **FEASIBLE TODAY.** One-shot file import on desktop, no OAuth, no entitlement. Best first move.                                                                                                                                  |
| **Google Fit (REST API)**       | steps, HR, sleep, sessions                                           | OAuth2                                                                           | steps/HR/sleep                     | **AVOID.** Google Fit REST APIs are **deprecated** (no new sign-ups; shutdown trajectory). Google's stated migration is to **Health Connect** (Android) for read and **Fitbit Web API** for cloud. Do not build on a sunset API. |
| **Google Takeout (Fit export)** | steps, activity, sleep as CSV/JSON                                   | None — user-initiated Takeout archive                                            | steps/activity/sleep               | **FEASIBLE TODAY** as a file-import path, but lower priority than Apple's export (smaller installed base of useful data, messier formats).                                                                                       |
| **Android Health Connect**      | unified sleep/steps/HR/HRV/workouts from many apps                   | On-device SDK + per-type permission; **Android only**                            | All fields                         | **NO direct desktop access.** Companion Android app only (Phase 3). This is the strategic successor to Google Fit.                                                                                                               |
| **Fitbit Web API**              | sleep, steps, resting HR, HRV, activity, "readiness"-style metrics   | **OAuth2 (cloud)** — desktop-reachable                                           | sleep/steps/restingHR/HRV/workouts | **FEASIBLE** as Phase 2. Cloud API, server-to-server style auth, no mobile entitlement. PKCE flow with a loopback redirect fits a desktop app.                                                                                   |
| **Oura (Cloud API v2)**         | sleep, readiness, HRV, resting HR, activity                          | **OAuth2 / personal token (cloud)**                                              | sleep/HRV/restingHR/activity       | **FEASIBLE** as Phase 2. Clean documented daily-summary endpoints — arguably the best fit for `lifestyle_log` because it is already daily-summary shaped.                                                                        |
| **Withings**                    | sleep, steps, HR, weight                                             | **OAuth2 (cloud)**                                                               | sleep/steps/HR                     | **FEASIBLE** as Phase 2.                                                                                                                                                                                                         |
| **Garmin**                      | sleep, steps, HR, stress, workouts                                   | OAuth + **partner-program approval** (gated)                                     | all                                | **CONDITIONAL.** API access requires Garmin program approval; viable but higher partnership cost. Defer.                                                                                                                         |
| **Whoop**                       | recovery, strain, sleep, HRV                                         | OAuth2 (cloud)                                                                   | sleep/HRV/strain→intensity         | **FEASIBLE** but niche; defer behind Oura/Fitbit.                                                                                                                                                                                |

### Reading the table

Three classes emerge:

1. **File exports (no auth, desktop-native).** Apple Health `export.xml`, Google Takeout. The user does the egress (they hand us a file they already downloaded). This is the most privacy-aligned path — it is literally the same shape as the existing AI document-import flow (user picks a file → we parse → human review → save).
2. **Desktop-friendly cloud Web APIs (OAuth2).** Fitbit, Oura, Withings (Garmin/Whoop later). These _do_ phone a third-party cloud, so they live behind the same opt-in + keychain + explicit-egress gate as AI providers.
3. **On-device mobile stores (entitlement).** HealthKit, Health Connect. Unreachable from desktop by construction. Only a **companion mobile app** can read them and push into the desktop DB.

## Field mapping

How each source's native data types collapse onto the one-row-per-day `lifestyle_log`. Daily aggregation (sum / mean / max-session) happens in the adapter, not the DB.

| `lifestyle_log` field | Apple Health (`export.xml`)                                       | Health Connect                    | Fitbit Web API              | Oura v2                                  | Derivation rule                                                                                                                                               |
| --------------------- | ----------------------------------------------------------------- | --------------------------------- | --------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sleepHours`          | `HKCategoryTypeIdentifierSleepAnalysis` (asleep segments)         | `SleepSessionRecord` stages       | `sleep` → `minutesAsleep`   | `daily_sleep` / `sleep` total            | Sum asleep segments for the night attributed to the wake date; ÷60 → hours                                                                                    |
| `sleepQuality`        | derive from efficiency / stages                                   | derive from stages                | `sleep.efficiency`          | `daily_sleep.score`                      | Map source 0–100 score to 1–5 buckets; null if no score                                                                                                       |
| `steps`               | `HKQuantityTypeIdentifierStepCount`                               | `StepsRecord`                     | `activities/steps`          | `daily_activity.steps`                   | Sum per calendar day (dedupe overlapping sources — Apple records multiple)                                                                                    |
| `restingHeartRate`    | `HKQuantityTypeIdentifierRestingHeartRate`                        | `RestingHeartRateRecord`          | `activities/heart` resting  | `daily_readiness` / `resting_heart_rate` | Daily value; if multiple, take the device-reported resting value, not a mean of all HR                                                                        |
| `trainingMinutes`     | `HKWorkoutType` durations                                         | `ExerciseSessionRecord`           | `activities` active minutes | `daily_activity` high+medium active      | Sum workout durations for the day → minutes                                                                                                                   |
| `trainingIntensity`   | workout type + active energy / HR zone                            | `ExerciseSessionRecord` + HR      | activity zones / intensity  | `daily_activity` MET buckets             | Bucket by avg HR-zone or MET: `light` / `moderate` / `intense`; pick the day's hardest session                                                                |
| `stressLevel`         | **proxy** from `HKQuantityTypeIdentifierHeartRateVariabilitySDNN` | `HeartRateVariabilityRmssdRecord` | HRV / readiness             | `daily_readiness.score` (inverse)        | No source measures "stress 1–5" directly. Map HRV (or readiness score) to 1–5 **as a proxy**, clearly labelled as derived, never presented as measured stress |
| `energyLevel`         | —                                                                 | —                                 | —                           | —                                        | **Manual only.** Subjective; never device-filled                                                                                                              |
| `notes`               | —                                                                 | —                                 | —                           | —                                        | **Manual only**                                                                                                                                               |

**Mapping principles (non-negotiable, mirroring the AI pipeline's "never invent" rule):**

- **No invention.** If a source has no value for a field, write `null` — do not synthesize one. A day with steps but no sleep is a valid partial row.
- **Proxies are labelled.** `stressLevel` from HRV and `sleepQuality` from an efficiency score are _derived_, not _measured_. The review UI must say so; the mapping is deterministic and documented, never a hidden heuristic.
- **Day attribution is explicit.** Sleep that crosses midnight is attributed to the **wake date** (the morning), consistent with how each platform reports "last night's sleep." This rule is the single biggest source of off-by-one bugs and is fixed in code, not left to the model.
- **Deterministic, not AI.** Unlike lab import, lifestyle mapping needs **no** LLM — the schemas are typed and known. Mapping is plain adapter code, which is cheaper and fully offline.

## Architecture

The design reuses three patterns already in the codebase: the **vendor-agnostic provider interface** (`src/ai/types.ts` `AIProvider`), the **human-review import pipeline** (`src/ai/import/`), and the **Rust↔frontend command boundary with secrets in the keychain** (`src-tauri/src/backup.rs` + `src/ai/keystore.ts`).

### 1. `IntegrationProvider` interface (one adapter per source)

Mirror `AIProvider`: a single internal interface so that adding a source means writing **one adapter**, and the import/sync pipeline never touches a vendor SDK directly. Sketch (illustrative shape, not final):

```
interface IntegrationProvider {
  readonly id: "apple_health_file" | "google_takeout" | "fitbit" | "oura" | ...;
  readonly kind: "file" | "oauth";            // determines which flow the UI runs
  // FILE adapters: parse a user-picked export into normalized daily rows.
  parseExport?(file: DocumentInput): Promise<LifestyleDraft[]>;
  // OAUTH adapters: exchange/refresh tokens (tokens live in the keychain) and
  // pull a bounded date range of daily summaries.
  authorize?(): Promise<void>;
  pullRange?(from: string, to: string): Promise<LifestyleDraft[]>;
  testConnection?(): Promise<void>;           // cheap round-trip, like AIProvider.testKey()
}

type LifestyleDraft = Partial<LifestyleLog> & {
  date: string;            // ISO YYYY-MM-DD
  source: LifestyleSource; // apple_health | google_fit | health_connect | <web-api id>
  provenance: Record<string, string>; // raw source identifiers, kept for audit
};
```

`LifestyleDraft` carries `provenance` for the **same reason `lab_result` keeps `raw_label`**: every imported value can be traced to where it came from. Adapters live in `src/integrations/providers/` (parallel to `src/ai/providers/`); the pipeline stays vendor-agnostic.

### 2. Import / sync pipeline (review parity with AI import)

Lifestyle import reuses the AI pipeline's three-phase shape, minus the LLM:

```
File export OR OAuth pull
        │
        ▼
[ Phase 1 — Acquire ]  parse export.xml / Takeout, or pull a bounded date range
        │              → LifestyleDraft[] (one per day, partial fields allowed)
        ▼
[ Phase 2 — Normalize ] daily aggregation + deterministic field mapping
        │               (sum steps, attribute sleep to wake date, HRV→stress proxy)
        ▼
[ Phase 3 — Human review ] grid: date × field, showing NEW vs CONFLICT vs UNCHANGED
        │                  vs existing manual rows; per-row source badge; proxies flagged
        ▼
   user confirms  →  upsert into lifestyle_log (source set per row; manual fields preserved)
```

**Merge policy (the key correctness question):** a `manual` row for a date must **never** be silently overwritten by an import. The review grid surfaces conflicts; the default keeps manual `energyLevel`/`notes`/`sleepQuality` and only fills device-authoritative fields the user left blank. This is the lifestyle analogue of the PRD's "non-lab extractions require 100% manual review" stance — automation proposes, the human disposes.

### 3. Secrets & the Rust command boundary

OAuth tokens (access + refresh) are **secrets** and follow the exact rule API keys and the backup passphrase already follow: **OS keychain only, never SQLite, never config files**. Reuse the existing `keyring` bridge (`keychain_set` / `keychain_get` / `keychain_delete`, namespaced service `com.soma.health`) with integration-scoped usernames (e.g. `oauth-oura-refresh`). New Rust commands parallel the backup module's boundary:

| Concern                          | Where it lives                     | Pattern it copies                            |
| -------------------------------- | ---------------------------------- | -------------------------------------------- |
| OAuth token storage              | Rust `keyring` (`integrations.rs`) | `backup_passphrase_set/exists/delete`        |
| OAuth loopback redirect listener | Rust (localhost one-shot HTTP)     | new, but Rust-side like `create_backup`      |
| Token exchange / refresh HTTP    | Rust (scoped `tauri-plugin-http`)  | AI providers' scoped network access          |
| File-export parsing              | Rust or TS, user-picked file       | AI import's `DocumentInput` flow             |
| Settings & scheduling            | TS (`src/integrations/*.ts`)       | `src/lib/backup.ts` owns settings/scheduling |

The TS side owns settings, the date-range chooser, and the review UI; Rust owns secrets, the loopback OAuth listener, and any networking — the same split as backups (TS owns scheduling/settings; Rust owns crypto/keychain/IO).

### 4. Why OAuth networking goes through Rust

Egress must be **auditable and scoped**, like the AI provider allowlist. Routing token exchange and `pullRange` through Rust with an explicit per-provider host allowlist keeps the network surface enumerable (the same property the README's "network access is scoped to provider APIs only" row promises for AI). No background timer ever pulls; a pull is a user action (button or an explicitly-enabled, visible scheduled sync that mirrors the backup scheduler's opt-in posture).

## Recommended phased rollout

| Phase                     | What                                                                                      | Auth                                   | Desktop today?        | Privacy cost                       |
| ------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------- | --------------------- | ---------------------------------- |
| **0 (shipped)**           | Manual entry, `source = manual`                                                           | none                                   | ✅                    | none                               |
| **1 (recommended first)** | **One-shot file import** of Apple Health `export.xml` (+ Google Takeout)                  | none                                   | ✅                    | **zero new egress**                |
| **2**                     | OAuth pull from a desktop-friendly Web API — **Oura first**, then Fitbit / Withings       | OAuth2, tokens in keychain             | ✅                    | opt-in egress to one chosen vendor |
| **3**                     | Optional **companion mobile app** bridging HealthKit / Health Connect into the desktop DB | on-device entitlement + local transfer | ⚠️ needs a mobile app | largest scope; opt-in              |

### Recommendation: do Phase 1 first, and possibly only Phase 1 for a while.

**Build the Apple Health file import first.** Reasons:

1. **It works on desktop today** with zero platform entitlements and zero OAuth — a Tauri process can read a user-supplied `export.xml`.
2. **Zero new egress.** The user exports on their phone and AirDrops/copies the zip to their desktop. Nothing leaves the machine; nothing phones home. This is _more_ privacy-aligned than backups (which at least touch a sync folder).
3. **It reuses the existing import mental model and code path** — pick a file → parse → human-review grid → save — so it is cheap and consistent with how Soma already imports labs.
4. **It covers the richest source** (HealthKit aggregates Apple Watch + iPhone + connected apps) without any of HealthKit's mobile-only cost.
5. **It directly satisfies the v0.3 roadmap item** "Lifestyle context cards (sleep, training, stress) to enrich AI analysis" without committing to a sync platform.

The honest limitation: a file export is a **snapshot**, not live sync. The mitigation is to make re-import painless and idempotent (re-importing a fresh export only fills gaps and surfaces conflicts; it never duplicates days).

**Phase 2 (Oura/Fitbit OAuth)** is the right _second_ step because it delivers near-live data on desktop through a cloud API that is genuinely reachable — and **Oura is the standout** because its API is already daily-summary shaped, so the adapter is thin and the impedance match to `lifestyle_log` is near-perfect. It is gated behind the same opt-in/keychain/explicit-egress contract as AI keys, so it adds capability without changing the privacy posture.

**Phase 3 (companion mobile app)** is the only path to true HealthKit / Health Connect, and it is deliberately last: it means shipping and maintaining a second app, a transfer channel between phone and desktop, and a new threat surface. It should remain optional and only be pursued if file import proves insufficient. The PRD's original SKIP verdict on wearable sync stands as the default; Phase 3 is the escape hatch, not the plan.

## Data model & schema impact

`lifestyle_log` already exists with the columns this design targets, so **Phase 1 needs no schema change at all** — a file importer writes the same rows the manual UI writes, only with `source != "manual"`. That is a deliberate, valuable property: the cheapest phase is also schema-free.

What later phases touch:

| Change                                                                                     | Phase | Migration?      | Notes                                                                                          |
| ------------------------------------------------------------------------------------------ | ----- | --------------- | ---------------------------------------------------------------------------------------------- |
| Write rows with `source = "apple_health"`                                                  | 1     | **No**          | Enum value already exists; importer just sets it                                               |
| Extend `source` enum for Web-API vendors (`oura`, `fitbit`, `withings`)                    | 2     | **Yes** (small) | Drizzle enum edit → `pnpm db:generate`; per the repo convention, never hand-edit generated SQL |
| Optional per-field origin (to distinguish device-filled vs manual fields _within_ one row) | 2+    | **Open**        | See Open Questions #7; may live in a sidecar `lifestyle_provenance` table or stay review-only  |
| Connector settings (enabled, last-sync, last-result)                                       | 1–2   | **No**          | localStorage like `soma.backup.settings`; **never** the tokens                                 |

The one-row-per-day uniqueness means the importer is an **upsert keyed on `(profileId, date)`**, and the merge policy (below) is not optional polish — it is required for correctness the moment two sources (manual + device) describe the same day.

## Privacy & security

Mapping the design onto Soma's existing **Privacy model** table (README). Every row must hold — an integration that violates one of these is not shipped.

| Principle (README)     | How integrations comply                                                                                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Local-first**        | `lifestyle_log` stays in local SQLite. File import adds **zero** egress. Phase-2 pulls write straight to the local DB; no Soma server exists or is introduced.                                                                                               |
| **Opt-in**             | Every integration is **disabled by default**, like AI. No connector is configured, no token stored, nothing pulled until the user explicitly enables a source.                                                                                               |
| **Keys in keychain**   | OAuth access/refresh tokens live in the **OS keychain** via the existing `keyring` bridge — never in SQLite, never in config/localStorage. (Connector _settings_ like "last sync date" may live in localStorage like backup settings; **secrets never do**.) |
| **Explicit egress**    | Phase 1: no egress. Phase 2: network only on a user-triggered authorize/pull, scoped to the chosen vendor's host allowlist via Rust — matching "network access is scoped to provider APIs only." No background phoning-home.                                 |
| **Encrypted backups**  | Imported lifestyle rows are ordinary DB rows; they ride the existing AES-256-GCM `.somabk` backups unchanged.                                                                                                                                                |
| **Auditability**       | Every imported row carries `source` and a `provenance` trail (the lifestyle analogue of `raw_label`); the review grid shows what each field's origin is before it is saved.                                                                                  |
| **Not medical advice** | Lifestyle data is context, not diagnosis; the standing disclaimer covers any AI interpretation of it.                                                                                                                                                        |

Additional security notes specific to integrations:

- **Least-privilege scopes.** OAuth requests only the read scopes for the fields we map (no write scopes, no GPS/location, no raw stream access).
- **Revocation is real.** Disconnecting a source deletes its keychain tokens (`keychain_delete`) and stops all pulls — no orphaned credentials, same as deleting an AI key.
- **PKCE + loopback.** Desktop OAuth uses Authorization Code + PKCE with a `127.0.0.1` loopback redirect (no embedded webview capturing credentials, no client secret shipped in the binary where it cannot be kept secret).
- **No telemetry.** Connectors emit no analytics; a "last sync result" is stored locally like `backup.lastResult`, visible to the user, sent nowhere.

## Open questions / risks

| #   | Question / risk                                                                                               | Lean                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Extend `lifestyle_log.source` enum for Web-API sources (`oura`, `fitbit`) vs reuse a generic `web_api` value? | **Extend the enum** per source — preserves provenance precision; cheap (type-level + check constraint).                                                                |
| 2   | Sleep-crosses-midnight day attribution — wake date vs sleep-onset date?                                       | **Wake date.** Matches every platform's "last night" framing; fix in adapter, test explicitly.                                                                         |
| 3   | `stressLevel` from HRV is a proxy, not measured stress — risk of over-trust.                                  | Label as **derived** everywhere; document the mapping; never display "stress: measured."                                                                               |
| 4   | Merge policy when a `manual` row exists for an imported date.                                                 | **Never silently overwrite.** Fill only blank device fields; surface conflicts in review; keep subjective fields.                                                      |
| 5   | Google Fit REST is deprecated mid-design — building on it would rot.                                          | **Do not build on Google Fit REST.** Use Takeout (file) now; Health Connect (mobile bridge) later.                                                                     |
| 6   | Apple Health `export.xml` can be **very large** (years of per-sample data).                                   | Stream-parse, extract only the daily-summary types we map, cap memory; never load the whole DOM.                                                                       |
| 7   | Idempotent re-import — a user re-exports monthly.                                                             | Upsert keyed on `(profileId, date, field-origin)`; re-import fills gaps and flags conflicts, never duplicates.                                                         |
| 8   | OAuth token refresh failures / expiry while offline.                                                          | Treat like a rejected AI key: surface in Settings, never silently retry forever, require explicit reconnect.                                                           |
| 9   | Phase 3 companion app scope — full second app vs minimal export-relay?                                        | Prefer a **minimal export-relay** (read HealthKit/Health Connect → write the same `LifestyleDraft` JSON the file importer already consumes) over a full mobile client. |
| 10  | Garmin/Whoop partner-program gating.                                                                          | Defer; revisit only after Oura/Fitbit validate demand.                                                                                                                 |
| 11  | Does any of this dilute Soma's labs-first / medication-overlay USP?                                           | Keep it **strictly context**: lifestyle enriches AI analysis (v0.3), it does not become a tracker dashboard.                                                           |

## Implementation order (when Phase 1 is greenlit)

Parallel to the PRD's batch structure. Each step ends green: `pnpm typecheck && pnpm lint && pnpm build`, `cargo fmt && cargo clippy`, and a backup round-trip over the newly-written rows.

1. **`IntegrationProvider` interface + `LifestyleDraft` type** (`src/integrations/types.ts`) — vendor-agnostic, mirroring `src/ai/types.ts`. No vendor code yet.
2. **Apple Health export parser** (`src/integrations/providers/appleHealthFile.ts`) — stream-parse `export.xml`, extract only the mapped daily-summary types, daily aggregation + wake-date sleep attribution. Pure, unit-tested over fixture XML.
3. **Normalize + merge layer** — deterministic field mapping (HRV→stress proxy labelled), upsert keyed on `(profileId, date)`, manual-field preservation.
4. **Review grid UI** (`src/pages/Lifestyle.tsx` import flow) — date × field, NEW / CONFLICT / UNCHANGED, source + proxy badges, user confirms before write. Reuses the import-review mental model.
5. **Google Takeout parser** — second file adapter, same pipeline, lower priority.
6. **(Phase 2) OAuth scaffolding** — Rust `integrations.rs` (keychain token storage + loopback PKCE listener + scoped HTTP), then the **Oura** adapter first (thinnest, daily-summary shaped), then Fitbit/Withings. Extend the `source` enum (migration).
7. **(Phase 3) Companion mobile export-relay** — only if file import proves insufficient; emits the same `LifestyleDraft` JSON the file importer already consumes, so the desktop side needs no new pipeline.

## Summary

The desktop constraint is real and decisive: HealthKit and Health Connect are unreachable from a Tauri desktop process, so the only honest desktop-native paths are **file exports** (today, no egress) and **cloud Web APIs** (OAuth, opt-in, keychain tokens). The recommended order is **Phase 1 Apple Health / Takeout file import first** (zero new egress, reuses the existing review pipeline, covers the richest source), **Phase 2 Oura/Fitbit OAuth** for near-live data on desktop, and **Phase 3 an optional companion mobile bridge** only if file import proves insufficient. Every phase rides the same privacy contract as AI and backups — off by default, secrets in the keychain, explicit user-triggered egress, full auditability via a `source`/`provenance` trail, and no background phoning-home.
