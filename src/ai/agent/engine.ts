import type { AIProvider, AgentMessage } from "../types";
import type { ChatMessageRecord } from "@/db/schema";
import {
  addChatToolEvent,
  clearChatToolEvents,
  supersedeOpenChangeSets,
  createChatChangeSet,
  recordThreadRecords,
  type ChangeSetWithItems,
} from "@/db/chat-repos";
import { parseRecordRefs } from "@/db/chat-threads";
import { buildHealthContext } from "../context";
import { healthChangeSetSchema } from "./change-schema";
import { validateHealthChangeSet } from "./change-validator";
import { agentToolDefinitions, executeReadTool } from "./tools";
import { buildHealthAgentSystem } from "./system";
import { localIsoDate } from "@/lib/clinical-date";

// The overview tools answer broad questions in one call, so these bounds are
// about runaway loops, not about starving a legitimate multi-step review.
const MAX_ROUNDS = 8;
const MAX_TOOL_CALLS = 16;

/** One tool call as the transcript shows it while the turn is still running. */
export type AgentToolActivity = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: "running" | "completed" | "failed";
  resultSummary?: unknown;
  durationMs?: number;
};

export type HealthAgentResult = {
  content: string;
  changeSet: ChangeSetWithItems | null;
};

export async function runHealthAgentTurn(input: {
  provider: AIProvider;
  profileId: number;
  threadId: number;
  sourceMessageId: number;
  messages: ChatMessageRecord[];
  language: "en" | "ru";
  signal?: AbortSignal;
  onToolActivity?: (activity: AgentToolActivity) => void;
  /** Streams the current round's text as it is written; "" when a new round starts. */
  onText?: (text: string) => void;
}): Promise<HealthAgentResult> {
  let sequence = 0;
  // Persists a finished call and reports it live; the live id is local to this
  // turn because the provider's call ids are not unique across rounds.
  const track = async <T>(
    call: { name: string; arguments: Record<string, unknown> },
    run: () => Promise<{ value: T; summary: unknown }>,
  ): Promise<{ ok: true; value: T } | { ok: false; error: string }> => {
    const id = `${input.sourceMessageId}:${sequence++}`;
    const startedAt = performance.now();
    const report = (activity: Omit<AgentToolActivity, "id" | "name" | "arguments">) =>
      input.onToolActivity?.({ id, name: call.name, arguments: call.arguments, ...activity });
    report({ status: "running" });
    let outcome: { ok: true; value: T; summary: unknown } | { ok: false; error: string };
    try {
      outcome = { ok: true, ...(await run()) };
    } catch (error) {
      outcome = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    const durationMs = Math.round(performance.now() - startedAt);
    const summary = outcome.ok ? outcome.summary : { error: outcome.error };
    const status = outcome.ok ? "completed" : "failed";
    // The log is bookkeeping: failing to write it must not turn a call that
    // worked into an error the model then tries to work around.
    try {
      await addChatToolEvent({
        messageId: input.sourceMessageId,
        toolName: call.name,
        argumentsJson: call.arguments,
        resultSummaryJson: summary,
        status,
        durationMs,
      });
    } catch (error) {
      console.error("Failed to record tool call", error);
    }
    report({ status, resultSummary: summary, durationMs });
    return outcome;
  };
  await clearChatToolEvents(input.sourceMessageId);
  await supersedeOpenChangeSets(input.sourceMessageId);
  let changeSet: ChangeSetWithItems | null = null;
  const safetyContext = await buildHealthContext(input.profileId);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const systemPrompt = buildHealthAgentSystem({
    safetyContext,
    language: input.language,
    localDate: localIsoDate(new Date(), timezone),
    timezone,
  });
  const messages: AgentMessage[] = input.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
  let callsUsed = 0;
  const evidenceRefs = new Set<string>();
  if (!input.provider.runAgentTurn)
    throw new Error("Configured AI provider does not support tools");
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let roundText = "";
    input.onText?.("");
    const result = await input.provider.runAgentTurn({
      messages,
      systemPrompt,
      tools: agentToolDefinitions,
      signal: input.signal,
      onTextDelta: input.onText
        ? (delta) => {
            roundText += delta;
            input.onText?.(roundText);
          }
        : undefined,
    });
    if (result.kind === "message") {
      const content = sanitizeEvidence(result.content, evidenceRefs);
      await rememberCitations(input.threadId, content);
      return { content: content || (changeSet ? draftFallback(input.language) : ""), changeSet };
    }
    callsUsed += result.calls.length;
    if (callsUsed > MAX_TOOL_CALLS) {
      // A draft already made is still worth reviewing; only a turn with
      // nothing to show for its calls is an error.
      if (changeSet) return { content: draftFallback(input.language), changeSet };
      throw new Error("AI tool-call limit exceeded");
    }
    messages.push({ role: "assistant", content: result.content, toolCalls: result.calls });
    const draftCalls = result.calls.filter((call) => call.name === "draft_health_changes");
    if (draftCalls.length > 1) throw new Error("AI returned multiple health change drafts");
    if (draftCalls[0]) {
      const draft = draftCalls[0];
      const outcome = await track(draft, async () => {
        const parsed = healthChangeSetSchema.parse(draft.arguments);
        const validated = await validateHealthChangeSet(input.profileId, parsed);
        // A corrected draft replaces the one this turn made before it.
        await supersedeOpenChangeSets(input.sourceMessageId);
        const created = await createChatChangeSet({
          threadId: input.threadId,
          sourceMessageId: input.sourceMessageId,
          ...validated,
        });
        return {
          value: created,
          summary: {
            changeSetId: created.id,
            items: created.items.length,
            status: created.status,
          },
        };
      });
      if (outcome.ok) changeSet = outcome.value;
      // The model sees what the validator made of its draft, so it can fix a
      // blocked item (wrong id, missing date) or describe the card honestly.
      // Every call of the round gets an answer: providers reject a turn with an
      // unanswered call.
      messages.push(
        ...result.calls.map((call) => ({
          role: "tool" as const,
          toolCallId: call.id,
          name: call.name,
          content: JSON.stringify(
            call !== draft
              ? {
                  ok: false,
                  error: "Not executed: read first, then call draft_health_changes on its own.",
                }
              : outcome.ok
                ? {
                    ok: true,
                    status: outcome.value.status,
                    note: "Shown to the user as a card; nothing is saved until they press Save.",
                    items: outcome.value.items.map((item) => ({
                      kind: item.payloadJson.kind,
                      status: item.status,
                      errors: item.errorsJson,
                      warnings: item.warningsJson,
                    })),
                  }
                : { ok: false, error: outcome.error },
          ),
        })),
      );
      continue;
    }
    const outputs = await Promise.all(
      result.calls.map(async (call) => {
        const outcome = await track(call, async () => {
          const value = await executeReadTool(input.profileId, call.name, call.arguments);
          collectEvidenceRefs(value, evidenceRefs);
          return { value, summary: summarizeToolResult(value) };
        });
        return {
          role: "tool" as const,
          toolCallId: call.id,
          name: call.name,
          content: JSON.stringify(
            outcome.ok ? { ok: true, data: outcome.value } : { ok: false, error: outcome.error },
          ),
        };
      }),
    );
    messages.push(...outputs);
  }
  if (changeSet) return { content: draftFallback(input.language), changeSet };
  throw new Error("AI agent did not finish within the tool-call limit");
}

function draftFallback(language: "en" | "ru"): string {
  return language === "ru"
    ? "Я подготовил изменения. Проверьте карточку и нажмите «Сохранить»."
    : "I prepared the changes. Review the card and press Save.";
}

/**
 * Stores the records an answer cited as the thread's footprint. Only refs that
 * survived `sanitizeEvidence` reach here, i.e. records a tool actually
 * returned this turn — the model cannot claim a record it never read.
 * Best-effort: a bookkeeping failure must never turn a finished answer into
 * an error.
 */
async function rememberCitations(threadId: number, content: string): Promise<void> {
  try {
    await recordThreadRecords(threadId, parseRecordRefs(content), "cited");
  } catch (error) {
    console.error("Failed to record thread citations", error);
  }
}

function collectEvidenceRefs(value: unknown, refs: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectEvidenceRefs(item, refs);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key === "ref" && typeof item === "string") refs.add(item);
    else collectEvidenceRefs(item, refs);
  }
}

/**
 * Keeps only references to records a tool returned this turn, and repairs the
 * shapes models drift into — `[vaccine:29]`, `[history:1, vaccine:29]`,
 * `[record:a:1, record:b:2]` — into one `[record:type:id]` token per record, so
 * a stray format never reaches the reader as raw brackets.
 */
export function sanitizeEvidence(content: string, refs: Set<string>): string {
  return content.replace(
    /\[((?:record:)?[a-z_]+:\d+(?:\s*[,;]\s*(?:record:)?[a-z_]+:\d+)*)\]/g,
    (_, list: string) =>
      list
        .split(/\s*[,;]\s*/)
        .map((item) => item.replace(/^record:/, ""))
        .filter((ref) => refs.has(ref))
        .map((ref) => `[record:${ref}]`)
        .join(""),
  );
}

function summarizeToolResult(value: unknown): unknown {
  if (Array.isArray(value)) return { count: value.length };
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [
      key,
      Array.isArray(item) ? { count: item.length } : item,
    ]),
  );
}
