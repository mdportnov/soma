import type { AIProvider, AgentMessage } from "../types";
import type { ChatMessageRecord } from "@/db/schema";
import { addChatToolEvent, createChatChangeSet, type ChangeSetWithItems } from "@/db/chat-repos";
import { buildHealthContext } from "../context";
import { healthChangeSetSchema } from "./change-schema";
import { validateHealthChangeSet } from "./change-validator";
import { agentToolDefinitions, executeReadTool } from "./tools";
import { buildHealthAgentSystem } from "./system";
import { localIsoDate } from "@/lib/clinical-date";

const MAX_ROUNDS = 6;
const MAX_TOOL_CALLS = 12;

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
}): Promise<HealthAgentResult> {
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
    const result = await input.provider.runAgentTurn({
      messages,
      systemPrompt,
      tools: agentToolDefinitions,
      signal: input.signal,
    });
    if (result.kind === "message") {
      return { content: sanitizeEvidence(result.content, evidenceRefs), changeSet: null };
    }
    callsUsed += result.calls.length;
    if (callsUsed > MAX_TOOL_CALLS) throw new Error("AI tool-call limit exceeded");
    messages.push({ role: "assistant", content: result.content, toolCalls: result.calls });
    const draftCalls = result.calls.filter((call) => call.name === "draft_health_changes");
    if (draftCalls.length > 1) throw new Error("AI returned multiple health change drafts");
    if (draftCalls[0]) {
      const startedAt = performance.now();
      try {
        const parsed = healthChangeSetSchema.parse(draftCalls[0].arguments);
        const validated = await validateHealthChangeSet(input.profileId, parsed);
        const changeSet = await createChatChangeSet({
          threadId: input.threadId,
          sourceMessageId: input.sourceMessageId,
          ...validated,
        });
        await addChatToolEvent({
          messageId: input.sourceMessageId,
          toolName: draftCalls[0].name,
          argumentsJson: draftCalls[0].arguments,
          resultSummaryJson: {
            changeSetId: changeSet.id,
            items: changeSet.items.length,
            status: changeSet.status,
          },
          status: "completed",
          durationMs: Math.round(performance.now() - startedAt),
        });
        return {
          content:
            sanitizeEvidence(result.content, evidenceRefs) ||
            (input.language === "ru"
              ? "Я подготовил изменения. Проверьте карточки перед сохранением."
              : "I prepared the changes. Review the cards before saving."),
          changeSet,
        };
      } catch (error) {
        await addChatToolEvent({
          messageId: input.sourceMessageId,
          toolName: draftCalls[0].name,
          argumentsJson: draftCalls[0].arguments,
          resultSummaryJson: { error: error instanceof Error ? error.message : String(error) },
          status: "failed",
          durationMs: Math.round(performance.now() - startedAt),
        });
        messages.push({
          role: "tool",
          toolCallId: draftCalls[0].id,
          name: draftCalls[0].name,
          content: JSON.stringify({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          }),
        });
        continue;
      }
    }
    const outputs = await Promise.all(
      result.calls.map(async (call) => {
        const startedAt = performance.now();
        try {
          const value = await executeReadTool(input.profileId, call.name, call.arguments);
          collectEvidenceRefs(value, evidenceRefs);
          await addChatToolEvent({
            messageId: input.sourceMessageId,
            toolName: call.name,
            argumentsJson: call.arguments,
            resultSummaryJson: summarizeToolResult(value),
            status: "completed",
            durationMs: Math.round(performance.now() - startedAt),
          });
          return {
            role: "tool" as const,
            toolCallId: call.id,
            name: call.name,
            content: JSON.stringify({ ok: true, data: value }),
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await addChatToolEvent({
            messageId: input.sourceMessageId,
            toolName: call.name,
            argumentsJson: call.arguments,
            resultSummaryJson: { error: message },
            status: "failed",
            durationMs: Math.round(performance.now() - startedAt),
          });
          return {
            role: "tool" as const,
            toolCallId: call.id,
            name: call.name,
            content: JSON.stringify({ ok: false, error: message }),
          };
        }
      }),
    );
    messages.push(...outputs);
  }
  throw new Error("AI agent did not finish within the tool-call limit");
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

function sanitizeEvidence(content: string, refs: Set<string>): string {
  return content.replace(/\[record:([a-z_]+):(\d+)\]/g, (token, entityType, entityId) =>
    refs.has(`${entityType}:${entityId}`) ? token : "",
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
