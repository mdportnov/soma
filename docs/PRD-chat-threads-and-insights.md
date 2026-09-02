# PRD: Chat threads and insight-grade analysis

Status: phases 1 and 2 implemented (DB, AI, UI); live UI verification pending  
Date: 2026-09-02  
Scope: multiple persistent assistant threads with metadata, icon-only message actions, and an agent that reviews personal health data methodically instead of answering in generalities

Builds on `PRD-ai-chat-health-agent.md`; its invariants (§3) stay in force. Only what changes is specified here.

## 1. Product outcome

Three complaints drive this work:

1. **One chat, one "clear" button.** Everything ever discussed lives in a single thread that can only be archived out of sight. There is no way to come back to "the conversation about my ferritin in June", to keep a travel-vaccine thread separate from a lab-review thread, or to see what a chat changed in the record.
2. **Labelled buttons under every answer.** "Copy" and "Regenerate" as text next to the timestamp add noise to every assistant bubble. The user wants icons with a tooltip explaining what they do.
3. **Generic answers.** "What should I pay attention to?" gets a summary of the safety capsule. The user expects the assistant to look where a careful clinician-reader would: compare with previous readings, know the reference and the optimal range, remember the medications, notice what has not been re-checked, and — for vaccines — tell an overdue booster from a childhood dose that was simply never entered.

Success: the user can open a past chat and see what it discussed and changed; message actions are icons with tooltips; a broad health question is answered as a prioritized, cited review of their own data, with an explicit list of what could not be assessed.

## 2. Current-state audit (verified in code)

- `chat_thread`, `chat_message`, `chat_tool_event`, `chat_change_set`, `chat_change_item` already exist with the right foreign keys (messages, tool events, change sets and items cascade from their parents; `chat_change_set.source_message_id → chat_message` is `NO ACTION`).
- `chat-repos.ts` only had `getOrCreateChatThread` (newest active or create) and `archiveChatThread` (the "clear" button). No listing, switching, renaming, deleting, no thread-level metadata.
- `src/lib/chat-store.ts` is a localStorage transcript from before the DB tables. `AiAnalysis.tsx` reads it once to import a legacy transcript into the DB and clears it. It is not a second source of truth, but it is dead weight once every install has been migrated.
- The live database had 4 threads (3 archived by "clear", 1 active) and 17 messages; all survive phase 1 (migration `0004` is additive, verified on a copy).
- Agent tools: `get_safety_context`, `search_records`, `get_record`, `get_medication_history`, `get_diagnosis_history`, `get_biomarker_trend`, `get_symptom_trend`, `get_vitals_trend`, `get_health_notes`, `get_lifestyle_log`, `draft_health_changes`. Nothing returned ranges, previous readings, overdue re-tests, staleness or vaccine grading; a "what should I look at" answer would have needed 10+ calls and still guessed the ranges.
- The system prompt (31 lines) had safety rules but no method.
- The app already distinguishes vaccine `overdue` / `not_recorded` / `contextual` (`vaccine-schedule.ts`, `computeAntigen`, `countActionable`), and the dashboard digest, notifications feed and change analysis are pure modules (`dashboard-digest.ts`, `notifications.ts`, `insights.ts`). The agent reuses them rather than re-deriving.

## 3. Thread model

### 3.1 Lifecycle

| Event              | Rule                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open `/assistant`  | Opens the most recently updated **active** thread; creates one if none (`getOrCreateChatThread`).                                                                                                                                                                                                                                                                                                                             |
| New chat           | `createChatThread(profileId)`; becomes current; no title until the first message. Creating a second empty thread is allowed but the UI reuses an existing empty active thread instead of stacking blanks.                                                                                                                                                                                                                     |
| First user message | Auto-title from the message (`deriveThreadTitle`): whitespace collapsed, greeting filler dropped ("Привет, подскажи…" → "Что по прививкам?"), cut at a word boundary at 48 chars with "…", first letter capitalized. Set once, in `addChatMessage`, only while `title IS NULL AND title_source = 'auto'`. Emoji-only / empty text leaves the title null and the UI shows "New chat".                                          |
| Rename             | `renameChatThread(id, title)` pins `title_source = 'user'`; the auto-titler never overwrites it. Empty rename un-pins and returns to the derived title. Max 120 chars in UI.                                                                                                                                                                                                                                                  |
| Archive            | `status = archived`, `archived_at = now`. Hidden from the default list, visible under "Archived", restorable (`restoreChatThread`). Nothing is deleted. Replaces today's "Clear chat".                                                                                                                                                                                                                                        |
| Delete             | `deleteChatThread(id)` — one transaction, child-first: change items → change sets → tool events → messages → thread records → thread. Explicit, not cascade-reliant (see 3.3). Requires a confirm dialog naming what goes: N messages, M draft change sets. Health records created from the thread stay; their `record_provenance` rows keep the source message text, so the audit trail survives (PRD-ai-chat invariant 13). |
| Regenerate         | Unchanged: the old assistant message is deleted, tool events cascade, change sets stay anchored to the user message.                                                                                                                                                                                                                                                                                                          |

### 3.2 History limits

- Storage: unlimited. Messages are small; the DB is local.
- Model window: the last 40 messages of the thread (`MAX_AGENT_MESSAGES`, unchanged). Older turns are not sent; the agent re-reads records via tools, so nothing medical is lost by the cut.
- UI load: `listChatMessages(threadId, 80)` newest-first-then-reversed, with `beforeId` paging for "Show earlier messages" (phase 2).
- Thread list: 200 newest by `updated_at`; search narrows further.

### 3.3 Cascade audit

Schema cascades are real (`ON DELETE cascade` on message → thread, tool event → message, change set → thread, item → change set, thread record → thread). They are still not relied on for deletion, for two reasons: `tauri-plugin-sql` pools connections and `PRAGMA foreign_keys = ON` is per connection, so a cascade could silently not fire; and `chat_change_set.source_message_id` is `NO ACTION`, so deleting messages before change sets on an FK-enforcing connection fails. `execute_transaction` (Rust side) always opens with `foreign_keys(true)`, so the ordered statements above are both safe and atomic.

## 4. Thread metadata

Shown in the list row (compact) and in a details popover (full). All derived; nothing is typed by the user except the title.

| Field                   | Source                                                                                                                                                                    | Where shown                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Title                   | `title` or derived from the first user message                                                                                                                            | Row, header                                 |
| Last activity           | `updated_at` (bumped on every message)                                                                                                                                    | Row (relative: "2 h ago", "12 Aug")         |
| Preview                 | last message, one line, 96 chars                                                                                                                                          | Row                                         |
| Message count           | `count(chat_message)`                                                                                                                                                     | Details                                     |
| Created / first message | `created_at`, first message `created_at`                                                                                                                                  | Details                                     |
| Provider / model        | `provider_id`, `model_id` of the last assistant reply; full breakdown (every model used, replies each) in details                                                         | Row (model badge), details                  |
| Records cited           | `chat_thread_record` where relation = `cited`: refs the answer actually cited as `[record:entity:id]` after the engine stripped anything not returned by a tool this turn | Row count, details list with deep links     |
| Records changed         | `chat_thread_record` where relation = `changed`: entity ids committed by change sets from this thread (written by `commitHealthChangeSet` after the transaction succeeds) | Row count, details list                     |
| Change sets             | committed / pending (ready or draft) / discarded / failed counts                                                                                                          | Row shows a pending badge; details show all |
| Tool calls              | `count(chat_tool_event)` joined through messages                                                                                                                          | Details ("what the assistant read")         |
| Archived at             | `archived_at`                                                                                                                                                             | Archived section                            |

Reverse lookup: `findThreadsByRecord(profileId, ref)` answers "which chats discussed this record" — phase 3 candidate for record pages.

## 5. UI specification (phase 2)

### 5.1 Layout

Constraints: Tauri desktop; global navigation sidebar is `w-52` (`w-14` below `md`); the chat column is `max-w-3xl`. A second permanent sidebar would leave ~560 px for the transcript at 1024 px wide, which is acceptable but tight, so the thread panel is **collapsible with a header fallback**:

```
┌─ nav w-52 ─┬─ /assistant ───────────────────────────────────────────────┐
│            │ PageHeader: "Soma AI"                                       │
│            │ [☰ History] [Thread title ▾] ······ [ⓘ details] [＋ New]    │
│            │ ┌ threads w-64 ─┐ ┌ transcript (max-w-3xl, centered) ─────┐│
│            │ │ 🔍 search      │ │  user bubble                          ││
│            │ │ ＋ New chat    │ │  assistant bubble                     ││
│            │ │ ● Today        │ │    ⧉ ↻   (icon actions, tooltips)     ││
│            │ │   Ferritin…    │ │  change-set card                      ││
│            │ │ ● Earlier      │ │                                       ││
│            │ │   Vaccines…    │ │  composer                             ││
│            │ │ ▸ Archived (3) │ └───────────────────────────────────────┘│
│            │ └────────────────┘                                          │
└────────────┴────────────────────────────────────────────────────────────┘
```

- **Thread panel** (`w-64`, left of the transcript, inside the page): open by default at ≥ 1200 px window width, collapsed below; the toggle is remembered in `localStorage` (`soma.assistant.threadPanel`). Collapsing animates width 200 ms ease-out; content fades.
- **Header thread switcher**: the current title is a button with a chevron; it opens the same list as a popover (search + New chat + rows) so switching works with the panel collapsed. This is the only switcher below `md`.
- **Details** (ⓘ): popover with the metadata table of §4, "Rename", "Archive", "Delete" at the bottom; destructive action visually separated (same pattern as the admin visual pass in Punto Cero: neutral tiles, destructive at the end).
- **New** (＋): creates or reuses an empty active thread, focuses the composer.

### 5.2 Row anatomy

```
Ferritin dropped after June panel          2 h    ← title (1 line, truncate), relative time
Что мне пересдать в сентябре?…            ← preview, muted, 1 line
[claude-sonnet] [3 records] [1 pending]   ← badges, only when non-zero
```

Hover/focus: row background; "…" menu (Rename / Archive / Delete). Active row: accent bar on the left, `bg-muted`. Groups: Today / Yesterday / Last 7 days / Earlier / Archived (collapsed by default with a count).

### 5.3 States

| State                             | Behaviour                                                                                                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty (no threads)                | Panel shows one placeholder row "New chat" (current, untitled) and the existing empty-state starters in the transcript. No illustration.                                                                            |
| Untitled current thread           | Row title "New chat" in muted text; header shows the same.                                                                                                                                                          |
| Long list (200+)                  | Virtualization not needed at 200 rows; list scrolls independently, `overscroll-contain`. Search filters.                                                                                                            |
| Search                            | Input at the top (⌘F while the panel has focus); filters by title and message text via `listChatThreads({ query })`, 150 ms debounce; empty result shows "No chats match "…"" with a "New chat" button. Esc clears. |
| Loading                           | Skeleton rows (3) for 150 ms+; switching threads keeps the panel and swaps the transcript with `Loading`.                                                                                                           |
| Switching while a turn is running | Blocked: the pending indicator stays, rows are disabled, tooltip "Wait for the answer or stop it". Stop first, then switch.                                                                                         |
| Pending change sets in a thread   | Row badge "1 pending"; archiving is allowed (drafts stay), deleting warns "2 draft change sets will be discarded".                                                                                                  |
| Rename                            | Inline: title becomes an input (Enter saves, Esc cancels, blur saves), 120 chars max, empty reverts to the derived title.                                                                                           |
| Archive                           | Immediate, undoable via toast "Chat archived — Undo" for 6 s (restore). If the archived thread was current, the next active thread opens, or a new one is created.                                                  |
| Delete                            | `ConfirmDialog`, destructive, title "Delete this chat?", body lists message and draft counts and states that saved health records are not affected.                                                                 |
| Error (list fails)                | Inline text in the panel with Retry; the transcript still works.                                                                                                                                                    |
| Provider not configured           | Existing stub screen; the panel is hidden (there is nothing to talk to).                                                                                                                                            |

### 5.4 Message actions (icons + tooltips)

Under each assistant bubble, replace the labelled buttons with icon-only buttons using `src/components/ui/tooltip.tsx`:

- `Copy` icon → tooltip "Copy answer" / "Скопировать ответ"; click shows the existing "Copied" toast; icon swaps to a check for 1.5 s.
- `RefreshCw` icon → tooltip "Regenerate answer" / "Сгенерировать заново"; disabled while pending, tooltip then says why.
- Each button: `aria-label` equal to the tooltip text; 28×28 px hit area (padding around a 14 px icon; desktop pointer, no 44 px touch requirement), visible focus ring, `text-muted-foreground hover:text-foreground`.
- Actions appear on hover/focus of the bubble and always for the last answer, so the transcript stays quiet.

### 5.5 Keyboard

| Keys                                | Action                                       |
| ----------------------------------- | -------------------------------------------- |
| ⌘/Ctrl + Shift + O                  | New chat                                     |
| ⌘/Ctrl + Shift + H                  | Toggle thread panel                          |
| ↑ / ↓ in the list, Enter            | Move / open                                  |
| F2 or double-click on a row         | Rename                                       |
| Delete / Backspace on a focused row | Delete (opens confirm)                       |
| Esc                                 | Close popover / clear search / cancel rename |
| Enter, Shift+Enter in the composer  | Unchanged                                    |

Tab order: header controls → panel search → rows → transcript actions → composer.

## 6. Insight-grade analysis

### 6.1 What changes versus today

Today the agent has a safety capsule and a bag of narrow read tools; every judgement about ranges, trends and staleness was left to the model, and it answered from the capsule. Now:

- Three review tools compute the bookkeeping locally and deterministically, reusing the UI's own classifiers, so the assistant and the screens can never disagree:
  - `get_health_overview` — latest out-of-range markers with previous reading and change classification (`analyzeChange`), notable moves, sub-optimal values (inside reference, outside optimal, using the sex/age-specific range via `resolveRange`), markers abnormal when last measured and not re-checked for ≥ 365 days, re-test schedules (overdue / due soon / scheduled / unanchored, via `retestDueDate`), active medications with days on course, planned end and drug-allergy conflicts (`matchDrugAllergies`), 90-day blood-pressure summary with stages (`bpStage`), weight versus target, 30-day symptoms, data coverage and named gaps.
  - `get_changes_since` — every marker measured on/after a date versus its last reading before it; medications started/stopped, diagnoses added/resolved, visits, vaccines, symptoms, BP/weight before vs after. Without a date: the latest panel versus the record before it.
  - `get_vaccination_status` — `computeAntigen` per calendar antigen with `isGradedTier`, grouped into actionable (overdue boosters, lapsed certificates), due, upcoming, done, **not recorded**, contextual, plus unmatched records and a legend that spells out what each status means.
- `get_biomarker_trend` now returns the range in effect for this profile and the medications covering each reading.
- The system prompt carries the method (§6.3) and a grounding contract: every number, date and record name must come from a tool result of this turn and be cited as `[record:entity:id]`; general knowledge is allowed only when labelled as such; no thresholds or scores computed from memory.
- The safety capsule adds pregnancy status and a "record coverage" line (counts and date spans per section), so the model knows what exists before it reads and never describes an empty section as normal.
- The engine stores the records an answer cited (thread footprint) and commits store the records changed.

### 6.2 Scenarios

**"На что мне обратить внимание?"**

1. `get_health_overview`.
2. Rank: critical flags → new out-of-range (became_out_of_range) → worsening trends → medication–allergy conflicts → overdue re-tests and stale abnormal markers → actionable vaccines → sub-optimal values → vitals.
3. For each of the top 3–6: value, unit, date, previous value and direction, ref; medications covering the reading; one or two sentences on why it may matter, in general terms; the concrete next step (re-check, record, discuss at the next visit).
4. Go deeper only if needed (`get_biomarker_trend` for a marker with several readings; `get_record` on the panel for fasting/time of draw).
5. "Could not assess": the `gaps` list, in words ("no blood-pressure readings recorded", "birth date missing, vaccine schedule cannot be graded").
6. One closing reminder that it is information from their record, not medical advice.

**"Что по прививкам?"**

1. `get_vaccination_status`.
2. If `birthDateKnown` is false: say the schedule cannot be graded and suggest adding the birth date; still list recorded shots.
3. Actionable first (overdue boosters with the date they became due; lapsed certificates with expiry and ref), then due now, then upcoming with dates.
4. Not-recorded childhood doses: one sentence as a documentation gap ("BCG, MMR… are not in the record; for an adult they were almost certainly given — enter them if you have the certificate"), never framed as missed.
5. Contextual/travel antigens: only if the user mentions travel or a region; otherwise a single line offering them.
6. Unmatched records: list so the user can rename or verify them.

**"Что изменилось с прошлого раза?"**

1. `get_changes_since` (with the date if the user named one; otherwise latest panel vs. before).
2. Say which window was used ("latest panel 20 Aug 2026 vs. the readings before it").
3. Labs: worsened first (alert → watch), then improved (back in range), then new markers; skip unchanged, give their count.
4. Record changes in the window: medications started/stopped, diagnoses, visits, vaccines, symptoms — as facts with refs; where a medication started before a moved marker, mention "taken at the time" as a possible relation to discuss, not a cause.
5. Vitals before/after when both exist.

### 6.3 Method the prompt enforces

1. Dynamics over points; one reading is a snapshot.
2. Two ranges (reference for flags, optimal with direction for watch-worthiness); name the one used.
3. Context: medications at the reading, diagnoses, allergies, age/sex/pregnancy, fasting/time of draw.
4. Freshness: a year-old value is history; name what needs re-checking.
5. Vaccine vocabulary: overdue ≠ not recorded ≠ contextual.
6. Gaps are findings; absence is "not recorded".

### 6.4 Answer shape

Prioritized findings (3–6), each: what the record shows → why it may matter → what to do; then "could not assess"; one disclaimer at the end. No per-item disclaimers, no generic advice.

## 7. Out of scope

- Cross-thread memory or summaries; the model only sees the current thread's last 40 messages plus tools.
- Folders, tags, pinning, sharing or exporting threads.
- Full-text search index for chat (LIKE over titles and messages is enough at local scale; `search.ts` untouched).
- Any new medical knowledge base, drug-interaction database or risk calculators. The assistant may use general knowledge only when labelled as general.
- OS notifications or proactive "you should look at this" nudges outside the chat.
- Editing sent messages; branching conversations.
- Multi-profile thread views (threads stay scoped to the active profile).

## 8. Risks

| Risk                                                                  | Mitigation                                                                                                                                                                                                                |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The model still invents a number or extrapolates                      | Grounding contract in the prompt; evidence refs are stripped unless a tool returned them; review tools hand the model finished comparisons so it has nothing to compute. Residual risk accepted and disclosed in UI copy. |
| Overview payload too large for a big record                           | Lists capped at 25 (with `truncated` counts); the model is told to go deeper by tool, not by asking for more.                                                                                                             |
| Stale "not recorded" wording drifts into "overdue" in Russian answers | Legend travels with every vaccination result; the prompt names the vocabulary; a test locks the prompt text.                                                                                                              |
| Deleting a thread orphans provenance                                  | By design: provenance keeps the message text; documented in the confirm dialog.                                                                                                                                           |
| Auto-title reveals sensitive text in the list                         | Titles come from the user's own words on their own device; renaming is one keystroke away. No title is sent anywhere.                                                                                                     |
| Pool connection without FK enforcement                                | Deletion is explicit and child-first inside `execute_transaction`, which enforces FKs.                                                                                                                                    |
| Longer prompt raises per-turn cost                                    | ~1.3k tokens added; acceptable for a desktop tool the user pays for per call; overview tools cut round-trips, which dominate cost.                                                                                        |

### 8.1 Medical safety

The app does not diagnose and does not replace a clinician. The wording rules that keep answers useful without crossing that line:

- Findings are stated as what the record shows (value, date, range, previous value) — factual, cited, never "you have X".
- "Why it may matter" is general information: what the marker measures, what typically moves it, what a clinician usually checks. It never asserts a cause in this person.
- "What to do" is always one of: re-check, record what is missing, bring it to a clinician with a concrete question. Never start/stop/change a dose.
- Critical flags, crisis blood pressure and relevant anaphylactic allergies are named plainly as warranting prompt medical attention — hedging there would be the unsafe choice.
- One disclaimer per answer, at the end; repeating it per item is what turns an answer into "useless water".
- Absence of data is a gap, not reassurance.

## 9. Phase 1 deliverables (done)

- Schema: `chat_thread.title_source`, `chat_thread.archived_at`, new `chat_thread_record`; migration `0004_cute_demogoblin.sql` (additive; backfills `archived_at` for already-archived threads); `schemaVersion` 9 → 10.
- `src/db/chat-threads.ts` (pure): `deriveThreadTitle`, `messagePreview`, `truncateAtWord`, `parseRecordRefs`, `escapeLike` + tests.
- `src/db/chat-repos.ts`: `listChatThreads` (status/query/limit), `getChatThread`, `getChatThreadSummary`, `createChatThread`, `getOrCreateChatThread`, `renameChatThread`, `archiveChatThread`, `restoreChatThread`, `deleteChatThread`, `getChatThreadMeta`, `recordThreadRecords`, `listThreadRecords`, `findThreadsByRecord`, `listChatMessages(threadId, limit, beforeId)`, `countChatMessages`; auto-title in `addChatMessage`.
- AI: `review.ts`, `review-data.ts`, `vaccination.ts` (pure + loader); tools `get_health_overview`, `get_changes_since`, `get_vaccination_status`; richer `get_biomarker_trend`; new system prompt; coverage + pregnancy in the capsule; citation footprint in `engine.ts`; change footprint in `commit.ts`; tests for review, vaccination, tools, prompt.

## 10. Phase 2 (UI) — files and keys

Files: `src/pages/AiAnalysis.tsx` (thread state, panel, switcher, icon actions), new `src/components/chat/ThreadPanel.tsx`, `ThreadRow.tsx`, `ThreadDetails.tsx`, `src/lib/i18n/en.ts` + `ru.ts` (keys below), `src/app/Shell.tsx` only if the ⌘⇧O / ⌘⇧H shortcuts are registered globally, `src/lib/chat-store.ts` deleted together with the legacy import in `AiAnalysis.tsx` (one release after 0.8 to let installs migrate).

i18n keys (`aiAnalysis.threads.*`): `title` ("Chats"), `new`, `newUntitled` ("New chat"), `search`, `noMatches`, `today`, `yesterday`, `lastWeek`, `earlier`, `archived`, `rename`, `archive`, `restore`, `delete`, `archivedToast`, `undo`, `deleteTitle`, `deleteBody` ({{messages}}, {{drafts}}), `details`, `messages`, `created`, `lastActivity`, `model`, `recordsCited`, `recordsChanged`, `changesSaved`, `pending`, `toolCalls`, `switchBlocked`, `togglePanel`; `aiAnalysis.copyAnswer`, `aiAnalysis.regenerateAnswer` (tooltips).

Verification for phase 2: open each of the 4 existing threads and confirm the transcript matches; rename/archive/restore/delete on a throwaway thread; regenerate keeps one reply per question; tooltip positioning at the bottom edge of the transcript.
