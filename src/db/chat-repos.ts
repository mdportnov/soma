import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "./client";
import { executeTransaction } from "./transaction";
import { markSearchIndexStale } from "./search-freshness";
import {
  chatChangeItem,
  chatChangeSet,
  chatMessage,
  chatThread,
  chatThreadRecord,
  chatToolEvent,
  type ChatChangeItem,
  type ChatChangeSet,
  type ChatMessageRecord,
  type ChatThread,
  type ChatThreadRecord,
} from "./schema";
import { deriveThreadTitle, escapeLike, messagePreview, type RecordRef } from "./chat-threads";

export type ChangeSetWithItems = ChatChangeSet & { items: ChatChangeItem[] };

// ── threads ────────────────────────────────────────────────────────────────

/** Thread row plus the derived facts the thread list renders. */
export type ChatThreadSummary = ChatThread & {
  /** Title to display: the stored one, else one derived from the first user
   *  message, else null (the UI shows its "New chat" placeholder). */
  displayTitle: string | null;
  messageCount: number;
  lastMessageAt: string | null;
  lastMessageRole: "user" | "assistant" | null;
  lastMessagePreview: string | null;
  /** Provider/model of the most recent assistant reply. */
  lastProviderId: string | null;
  lastModelId: string | null;
  /** Change sets saved to the health record from this thread. */
  committedChangeSets: number;
  /** Drafts still awaiting review (ready or draft). */
  pendingChangeSets: number;
  citedRecords: number;
  changedRecords: number;
};

export type ThreadListFilter = {
  status?: "active" | "archived" | "all";
  /** Case-insensitive substring over titles and message text. */
  query?: string;
  limit?: number;
};

/**
 * The profile's threads, most recently updated first, with everything the
 * list needs in a handful of grouped queries rather than one per thread.
 */
export async function listChatThreads(
  profileId: number,
  filter: ThreadListFilter = {},
): Promise<ChatThreadSummary[]> {
  const status = filter.status ?? "active";
  const conditions = [eq(chatThread.profileId, profileId)];
  if (status !== "all") conditions.push(eq(chatThread.status, status));
  const query = filter.query?.trim();
  if (query) {
    const pattern = `%${escapeLike(query)}%`;
    conditions.push(
      or(
        sql`${chatThread.title} LIKE ${pattern} ESCAPE '\\'`,
        inArray(
          chatThread.id,
          db
            .select({ id: chatMessage.threadId })
            .from(chatMessage)
            .where(sql`${chatMessage.content} LIKE ${pattern} ESCAPE '\\'`),
        ),
      )!,
    );
  }
  const threads = await db
    .select()
    .from(chatThread)
    .where(and(...conditions))
    .orderBy(desc(chatThread.updatedAt), desc(chatThread.id))
    .limit(filter.limit ?? 200);
  return summarizeThreads(threads);
}

async function summarizeThreads(threads: ChatThread[]): Promise<ChatThreadSummary[]> {
  if (!threads.length) return [];
  const ids = threads.map((thread) => thread.id);

  const stats = await db
    .select({
      threadId: chatMessage.threadId,
      count: sql<number>`count(*)`,
      lastId: sql<number>`max(${chatMessage.id})`,
      firstUserId: sql<
        number | null
      >`min(case when ${chatMessage.role} = 'user' then ${chatMessage.id} end)`,
      lastAssistantId: sql<
        number | null
      >`max(case when ${chatMessage.role} = 'assistant' then ${chatMessage.id} end)`,
    })
    .from(chatMessage)
    .where(inArray(chatMessage.threadId, ids))
    .groupBy(chatMessage.threadId);
  const statsByThread = new Map(stats.map((row) => [row.threadId, row]));

  const wanted = new Set<number>();
  for (const row of stats) {
    wanted.add(Number(row.lastId));
    if (row.firstUserId != null) wanted.add(Number(row.firstUserId));
    if (row.lastAssistantId != null) wanted.add(Number(row.lastAssistantId));
  }
  const messages = wanted.size
    ? await db
        .select()
        .from(chatMessage)
        .where(inArray(chatMessage.id, [...wanted]))
    : [];
  const messageById = new Map(messages.map((message) => [message.id, message]));

  const sets = await db
    .select({
      threadId: chatChangeSet.threadId,
      status: chatChangeSet.status,
      count: sql<number>`count(*)`,
    })
    .from(chatChangeSet)
    .where(inArray(chatChangeSet.threadId, ids))
    .groupBy(chatChangeSet.threadId, chatChangeSet.status);
  const committed = new Map<number, number>();
  const pending = new Map<number, number>();
  for (const row of sets) {
    const target =
      row.status === "committed"
        ? committed
        : row.status === "ready" || row.status === "draft"
          ? pending
          : null;
    if (target) target.set(row.threadId, (target.get(row.threadId) ?? 0) + Number(row.count));
  }

  const records = await db
    .select({
      threadId: chatThreadRecord.threadId,
      relation: chatThreadRecord.relation,
      count: sql<number>`count(*)`,
    })
    .from(chatThreadRecord)
    .where(inArray(chatThreadRecord.threadId, ids))
    .groupBy(chatThreadRecord.threadId, chatThreadRecord.relation);
  const cited = new Map<number, number>();
  const changed = new Map<number, number>();
  for (const row of records) {
    (row.relation === "cited" ? cited : changed).set(row.threadId, Number(row.count));
  }

  return threads.map((thread) => {
    const stat = statsByThread.get(thread.id);
    const last = stat ? messageById.get(Number(stat.lastId)) : undefined;
    const firstUser =
      stat?.firstUserId != null ? messageById.get(Number(stat.firstUserId)) : undefined;
    const lastAssistant =
      stat?.lastAssistantId != null ? messageById.get(Number(stat.lastAssistantId)) : undefined;
    return {
      ...thread,
      displayTitle: thread.title ?? (firstUser ? deriveThreadTitle(firstUser.content) : null),
      messageCount: stat ? Number(stat.count) : 0,
      lastMessageAt: last?.createdAt ?? null,
      lastMessageRole: last?.role ?? null,
      lastMessagePreview: last ? messagePreview(last.content) : null,
      lastProviderId: lastAssistant?.providerId ?? null,
      lastModelId: lastAssistant?.modelId ?? null,
      committedChangeSets: committed.get(thread.id) ?? 0,
      pendingChangeSets: pending.get(thread.id) ?? 0,
      citedRecords: cited.get(thread.id) ?? 0,
      changedRecords: changed.get(thread.id) ?? 0,
    };
  });
}

export async function getChatThread(id: number): Promise<ChatThread | null> {
  const rows = await db.select().from(chatThread).where(eq(chatThread.id, id));
  return rows[0] ?? null;
}

export async function getChatThreadSummary(id: number): Promise<ChatThreadSummary | null> {
  const thread = await getChatThread(id);
  if (!thread) return null;
  const [summary] = await summarizeThreads([thread]);
  return summary ?? null;
}

export async function createChatThread(profileId: number): Promise<ChatThread> {
  markSearchIndexStale();
  const [created] = await db.insert(chatThread).values({ profileId }).returning();
  return created;
}

/**
 * The thread the assistant page opens by default: the most recently updated
 * active one, or a fresh one when the profile has none. Kept as the single
 * entry point for "just show me the chat" so callers never have to decide.
 */
export async function getOrCreateChatThread(profileId: number): Promise<ChatThread> {
  const rows = await db
    .select()
    .from(chatThread)
    .where(and(eq(chatThread.profileId, profileId), eq(chatThread.status, "active")))
    .orderBy(desc(chatThread.updatedAt), desc(chatThread.id))
    .limit(1);
  if (rows[0]) return rows[0];
  return createChatThread(profileId);
}

/**
 * Renames a thread. A user-typed title is pinned (`titleSource = "user"`) so
 * the auto-titler never overwrites it; an empty title un-pins it and returns
 * the thread to the derived title.
 */
export async function renameChatThread(id: number, title: string): Promise<void> {
  markSearchIndexStale();
  const clean = title.replace(/\s+/g, " ").trim();
  await db
    .update(chatThread)
    .set(clean ? { title: clean, titleSource: "user" } : { title: null, titleSource: "auto" })
    .where(eq(chatThread.id, id));
}

/** Hides the thread from the main list; nothing is lost and it can be restored. */
export async function archiveChatThread(threadId: number): Promise<void> {
  markSearchIndexStale();
  const now = new Date().toISOString();
  await db
    .update(chatThread)
    .set({ status: "archived", archivedAt: now })
    .where(eq(chatThread.id, threadId));
}

export async function restoreChatThread(threadId: number): Promise<void> {
  markSearchIndexStale();
  await db
    .update(chatThread)
    .set({ status: "active", archivedAt: null, updatedAt: new Date().toISOString() })
    .where(eq(chatThread.id, threadId));
}

/**
 * Permanently removes a thread with its messages, tool events, change sets and
 * record footprint, in one transaction. The schema declares cascades and the
 * plugin enforces foreign keys, so a bare `DELETE FROM chat_thread` would work
 * on a quiet machine — but each drizzle statement runs as its own implicit
 * transaction on a pooled connection, and the change-set → message link is
 * `NO ACTION`, so anything more than one statement could leave a half-deleted
 * thread behind after a crash. Spelling the deletes out child-first inside
 * `execute_transaction` makes the whole removal atomic.
 *
 * Health records created from the thread are NOT touched — they belong to the
 * record, not the conversation, and keep their provenance rows (which store
 * the source message text, so the audit trail survives the deletion).
 */
export async function deleteChatThread(threadId: number): Promise<void> {
  markSearchIndexStale();
  await executeTransaction([
    {
      sql: "DELETE FROM chat_change_item WHERE change_set_id IN (SELECT id FROM chat_change_set WHERE thread_id = ?)",
      params: [threadId],
    },
    { sql: "DELETE FROM chat_change_set WHERE thread_id = ?", params: [threadId] },
    {
      sql: "DELETE FROM chat_tool_event WHERE message_id IN (SELECT id FROM chat_message WHERE thread_id = ?)",
      params: [threadId],
    },
    { sql: "DELETE FROM chat_message WHERE thread_id = ?", params: [threadId] },
    { sql: "DELETE FROM chat_thread_record WHERE thread_id = ?", params: [threadId] },
    { sql: "DELETE FROM chat_thread WHERE id = ?", params: [threadId], minRowsAffected: 1 },
  ]);
}

// ── thread metadata ────────────────────────────────────────────────────────

export type ThreadModelUsage = {
  providerId: string | null;
  modelId: string | null;
  replies: number;
};

export type ChatThreadMeta = {
  summary: ChatThreadSummary;
  firstMessageAt: string | null;
  /** Every provider/model that answered in this thread, most used first. */
  models: ThreadModelUsage[];
  toolCalls: number;
  changeSets: { committed: number; pending: number; discarded: number; failed: number };
  records: ChatThreadRecord[];
};

/** Everything the thread-details panel shows about one conversation. */
export async function getChatThreadMeta(threadId: number): Promise<ChatThreadMeta | null> {
  const summary = await getChatThreadSummary(threadId);
  if (!summary) return null;
  const [first, models, tools, sets, records] = await Promise.all([
    db
      .select({ createdAt: chatMessage.createdAt })
      .from(chatMessage)
      .where(eq(chatMessage.threadId, threadId))
      .orderBy(asc(chatMessage.id))
      .limit(1),
    db
      .select({
        providerId: chatMessage.providerId,
        modelId: chatMessage.modelId,
        replies: sql<number>`count(*)`,
      })
      .from(chatMessage)
      .where(and(eq(chatMessage.threadId, threadId), eq(chatMessage.role, "assistant")))
      .groupBy(chatMessage.providerId, chatMessage.modelId),
    db
      .select({ count: sql<number>`count(*)` })
      .from(chatToolEvent)
      .innerJoin(chatMessage, eq(chatToolEvent.messageId, chatMessage.id))
      .where(eq(chatMessage.threadId, threadId)),
    db
      .select({ status: chatChangeSet.status, count: sql<number>`count(*)` })
      .from(chatChangeSet)
      .where(eq(chatChangeSet.threadId, threadId))
      .groupBy(chatChangeSet.status),
    listThreadRecords(threadId),
  ]);
  const changeSets = { committed: 0, pending: 0, discarded: 0, failed: 0 };
  for (const row of sets) {
    const n = Number(row.count);
    if (row.status === "committed") changeSets.committed += n;
    else if (row.status === "ready" || row.status === "draft") changeSets.pending += n;
    else if (row.status === "discarded" || row.status === "superseded") changeSets.discarded += n;
    else if (row.status === "failed") changeSets.failed += n;
  }
  return {
    summary,
    firstMessageAt: first[0]?.createdAt ?? null,
    models: models
      .map((row) => ({ ...row, replies: Number(row.replies) }))
      .sort((a, b) => b.replies - a.replies),
    toolCalls: Number(tools[0]?.count ?? 0),
    changeSets,
    records,
  };
}

/**
 * Records that a thread touched the given health records. Upserts, so a
 * record cited across many turns keeps one row with a growing hit count.
 */
export async function recordThreadRecords(
  threadId: number,
  refs: RecordRef[],
  relation: "cited" | "changed",
): Promise<void> {
  if (!refs.length) return;
  const now = new Date().toISOString();
  for (const ref of refs) {
    await db
      .insert(chatThreadRecord)
      .values({
        threadId,
        entityType: ref.entityType,
        entityId: ref.entityId,
        relation,
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: [
          chatThreadRecord.threadId,
          chatThreadRecord.entityType,
          chatThreadRecord.entityId,
          chatThreadRecord.relation,
        ],
        set: { hits: sql`${chatThreadRecord.hits} + 1`, lastSeenAt: now },
      });
  }
}

export async function listThreadRecords(threadId: number): Promise<ChatThreadRecord[]> {
  return db
    .select()
    .from(chatThreadRecord)
    .where(eq(chatThreadRecord.threadId, threadId))
    .orderBy(desc(chatThreadRecord.lastSeenAt), desc(chatThreadRecord.id));
}

/** Threads of the profile that cited or changed one health record — "which
 *  chats discussed my ferritin", newest first. */
export async function findThreadsByRecord(
  profileId: number,
  ref: RecordRef,
): Promise<ChatThreadSummary[]> {
  const threads = await db
    .select({ thread: chatThread })
    .from(chatThreadRecord)
    .innerJoin(chatThread, eq(chatThreadRecord.threadId, chatThread.id))
    .where(
      and(
        eq(chatThread.profileId, profileId),
        eq(chatThreadRecord.entityType, ref.entityType),
        eq(chatThreadRecord.entityId, ref.entityId),
      ),
    )
    .orderBy(desc(chatThread.updatedAt));
  const unique = new Map<number, ChatThread>();
  for (const row of threads) unique.set(row.thread.id, row.thread);
  return summarizeThreads([...unique.values()]);
}

// ── messages ───────────────────────────────────────────────────────────────

/**
 * The newest `limit` messages of a thread in chronological order. Pass
 * `beforeId` to page further back ("show earlier messages").
 */
export async function listChatMessages(
  threadId: number,
  limit = 80,
  beforeId?: number,
): Promise<ChatMessageRecord[]> {
  const conditions = [eq(chatMessage.threadId, threadId)];
  if (beforeId != null) conditions.push(sql`${chatMessage.id} < ${beforeId}`);
  const rows = await db
    .select()
    .from(chatMessage)
    .where(and(...conditions))
    .orderBy(desc(chatMessage.id))
    .limit(limit);
  return rows.reverse();
}

export async function countChatMessages(threadId: number): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(chatMessage)
    .where(eq(chatMessage.threadId, threadId));
  return Number(rows[0]?.count ?? 0);
}

export async function addChatMessage(data: {
  threadId: number;
  role: "user" | "assistant";
  content: string;
  turnStatus?: "completed" | "running" | "failed" | "cancelled";
  providerId?: string | null;
  modelId?: string | null;
}): Promise<ChatMessageRecord> {
  markSearchIndexStale();
  const [created] = await db.insert(chatMessage).values(data).returning();
  const now = new Date().toISOString();
  await db.update(chatThread).set({ updatedAt: now }).where(eq(chatThread.id, data.threadId));
  // First user message titles the thread. The WHERE keeps it a no-op once a
  // title exists, so neither later questions nor a user rename are disturbed.
  if (data.role === "user") {
    const title = deriveThreadTitle(data.content);
    if (title) {
      await db
        .update(chatThread)
        .set({ title })
        .where(
          and(
            eq(chatThread.id, data.threadId),
            sql`${chatThread.title} IS NULL`,
            eq(chatThread.titleSource, "auto"),
          ),
        );
    }
  }
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

/**
 * Removes one message from the thread — used when an answer is regenerated, so
 * the transcript keeps a single reply per question instead of stacking retries.
 * Its tool events go with it in the same transaction (the same atomicity rule
 * as `deleteChatThread`); change sets are anchored to the user message and stay.
 */
export async function deleteChatMessage(id: number): Promise<void> {
  markSearchIndexStale();
  await executeTransaction([
    { sql: "DELETE FROM chat_tool_event WHERE message_id = ?", params: [id] },
    { sql: "DELETE FROM chat_message WHERE id = ?", params: [id] },
  ]);
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

// ── change sets ────────────────────────────────────────────────────────────

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
