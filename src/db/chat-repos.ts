import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "./client";
import {
  chatChangeItem,
  chatChangeSet,
  chatMessage,
  chatThread,
  chatToolEvent,
  type ChatChangeItem,
  type ChatChangeSet,
  type ChatMessageRecord,
  type ChatThread,
} from "./schema";

export type ChangeSetWithItems = ChatChangeSet & { items: ChatChangeItem[] };

export async function getOrCreateChatThread(profileId: number): Promise<ChatThread> {
  const rows = await db
    .select()
    .from(chatThread)
    .where(and(eq(chatThread.profileId, profileId), eq(chatThread.status, "active")))
    .orderBy(desc(chatThread.updatedAt), desc(chatThread.id))
    .limit(1);
  if (rows[0]) return rows[0];
  const [created] = await db.insert(chatThread).values({ profileId }).returning();
  return created;
}

export async function listChatMessages(threadId: number, limit = 80): Promise<ChatMessageRecord[]> {
  const rows = await db
    .select()
    .from(chatMessage)
    .where(eq(chatMessage.threadId, threadId))
    .orderBy(desc(chatMessage.id))
    .limit(limit);
  return rows.reverse();
}

export async function addChatMessage(data: {
  threadId: number;
  role: "user" | "assistant";
  content: string;
  turnStatus?: "completed" | "running" | "failed" | "cancelled";
  providerId?: string | null;
  modelId?: string | null;
}): Promise<ChatMessageRecord> {
  const [created] = await db.insert(chatMessage).values(data).returning();
  const now = new Date().toISOString();
  await db.update(chatThread).set({ updatedAt: now }).where(eq(chatThread.id, data.threadId));
  return created;
}

export async function updateChatMessageStatus(
  id: number,
  turnStatus: "completed" | "running" | "failed" | "cancelled",
): Promise<void> {
  await db.update(chatMessage).set({ turnStatus }).where(eq(chatMessage.id, id));
}

export async function getChatMessage(id: number): Promise<ChatMessageRecord | null> {
  const rows = await db.select().from(chatMessage).where(eq(chatMessage.id, id));
  return rows[0] ?? null;
}

export async function archiveChatThread(threadId: number): Promise<void> {
  await db
    .update(chatThread)
    .set({ status: "archived", updatedAt: new Date().toISOString() })
    .where(eq(chatThread.id, threadId));
}

export async function addChatToolEvent(data: {
  messageId: number;
  toolName: string;
  argumentsJson: Record<string, unknown>;
  resultSummaryJson?: unknown;
  status: "completed" | "failed";
  durationMs?: number;
}): Promise<void> {
  await db.insert(chatToolEvent).values(data);
}

export async function createChatChangeSet(data: {
  threadId: number;
  sourceMessageId: number;
  summary: string;
  riskLevel: "standard" | "elevated" | "destructive";
  items: Array<{
    operation: "create" | "update" | "end" | "merge" | "delete";
    entityType: string;
    entityId?: number | null;
    payloadJson: Record<string, unknown>;
    beforeJson?: Record<string, unknown> | null;
    status: "ready" | "blocked";
    warningsJson: string[];
    errorsJson: string[];
    candidateMatchesJson: { entityType: string; entityId: number; label: string }[];
    confidence?: number | null;
  }>;
}): Promise<ChangeSetWithItems> {
  const status = data.items.some((item) => item.status === "blocked") ? "draft" : "ready";
  const [set] = await db
    .insert(chatChangeSet)
    .values({
      threadId: data.threadId,
      sourceMessageId: data.sourceMessageId,
      summary: data.summary,
      riskLevel: data.riskLevel,
      status,
    })
    .returning();
  try {
    if (data.items.length) {
      await db.insert(chatChangeItem).values(
        data.items.map((item) => ({
          ...item,
          changeSetId: set.id,
          entityId: item.entityId ?? null,
          beforeJson: item.beforeJson ?? null,
          confidence: item.confidence ?? null,
        })),
      );
    }
  } catch (error) {
    await db.delete(chatChangeSet).where(eq(chatChangeSet.id, set.id));
    throw error;
  }
  const items = await db
    .select()
    .from(chatChangeItem)
    .where(eq(chatChangeItem.changeSetId, set.id))
    .orderBy(asc(chatChangeItem.id));
  return { ...set, items };
}

export async function listThreadChangeSets(threadId: number): Promise<ChangeSetWithItems[]> {
  const sets = await db
    .select()
    .from(chatChangeSet)
    .where(eq(chatChangeSet.threadId, threadId))
    .orderBy(asc(chatChangeSet.id));
  if (!sets.length) return [];
  const items = await db
    .select()
    .from(chatChangeItem)
    .where(
      inArray(
        chatChangeItem.changeSetId,
        sets.map((set) => set.id),
      ),
    )
    .orderBy(asc(chatChangeItem.id));
  const bySet = new Map<number, ChatChangeItem[]>();
  for (const item of items) {
    const list = bySet.get(item.changeSetId) ?? [];
    list.push(item);
    bySet.set(item.changeSetId, list);
  }
  return sets.map((set) => ({ ...set, items: bySet.get(set.id) ?? [] }));
}

export async function getChatChangeSet(id: number): Promise<ChangeSetWithItems | null> {
  const sets = await db.select().from(chatChangeSet).where(eq(chatChangeSet.id, id));
  if (!sets[0]) return null;
  const items = await db
    .select()
    .from(chatChangeItem)
    .where(eq(chatChangeItem.changeSetId, id))
    .orderBy(asc(chatChangeItem.id));
  return { ...sets[0], items };
}

export async function setChangeItemSelected(id: number, selected: boolean): Promise<void> {
  await db.update(chatChangeItem).set({ selected }).where(eq(chatChangeItem.id, id));
}

export async function discardChatChangeSet(id: number): Promise<void> {
  await db.update(chatChangeSet).set({ status: "discarded" }).where(eq(chatChangeSet.id, id));
}

export async function markChatChangeSetCommitted(id: number): Promise<void> {
  const now = new Date().toISOString();
  await db
    .update(chatChangeSet)
    .set({ status: "committed", committedAt: now })
    .where(eq(chatChangeSet.id, id));
  await db
    .update(chatChangeItem)
    .set({ status: "committed" })
    .where(and(eq(chatChangeItem.changeSetId, id), eq(chatChangeItem.selected, true)));
}

export async function markChatChangeSetFailed(id: number): Promise<void> {
  await db.update(chatChangeSet).set({ status: "failed" }).where(eq(chatChangeSet.id, id));
}
