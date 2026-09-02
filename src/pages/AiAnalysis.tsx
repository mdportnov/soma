import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDown,
  Check,
  ChevronDown,
  Copy,
  FileUp,
  Info,
  Loader2,
  PanelLeft,
  Plus,
  RefreshCw,
  Send,
  Settings as SettingsIcon,
  Sparkles,
  Square,
} from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import { effectiveModelId, getConfiguredProvider, loadAiSettings } from "@/ai";
import { buildHealthContext } from "@/ai/context";
import { runHealthAgentTurn } from "@/ai/agent/engine";
import { commitHealthChangeSet } from "@/ai/agent/commit";
import { AIProviderError } from "@/ai/types";
import {
  addChatMessage,
  countChatMessages,
  createChatThread,
  deleteChatMessage,
  discardChatChangeSet,
  getChatThread,
  getOrCreateChatThread,
  listChatMessages,
  listChatThreads,
  listThreadChangeSets,
  setChangeItemSelected,
  type ChangeSetWithItems,
} from "@/db/chat-repos";
import type { ChatMessageRecord, ChatThread } from "@/db/schema";
import { PageHeader } from "@/components/app/PageHeader";
import { Loading } from "@/components/app/Loading";
import { useToast } from "@/components/app/Toast";
import { AiDisclaimer } from "@/components/app/AiDisclaimer";
import { aiErrorMessage } from "@/components/app/AiInterpretation";
import { ChangeSetPanel } from "@/components/chat/ChangeSetPanel";
import { AssistantContent } from "@/components/chat/AssistantContent";
import { ThreadList } from "@/components/chat/ThreadList";
import { ThreadDetails } from "@/components/chat/ThreadDetails";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip } from "@/components/ui/tooltip";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { formatTime } from "@/lib/utils";
import { settingsPath } from "@/lib/settings-navigation";
import { deriveThreadTitle } from "@/db/chat-threads";

const MAX_AGENT_MESSAGES = 40;
/** Messages loaded per page of history; older ones arrive via "Show earlier". */
const MESSAGE_PAGE = 80;
const PANEL_PREF_KEY = "soma.assistant.threadPanel";
/** Below this window width the thread panel starts collapsed (nav w-52 + panel w-64 + transcript). */
const PANEL_AUTO_OPEN_WIDTH = 1200;
const THREAD_PARAM = "thread";

function loadPanelPref(): boolean {
  try {
    const raw = localStorage.getItem(PANEL_PREF_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
    // localStorage unavailable → fall through to the width rule.
  }
  return window.innerWidth >= PANEL_AUTO_OPEN_WIDTH;
}

function savePanelPref(open: boolean): void {
  try {
    localStorage.setItem(PANEL_PREF_KEY, open ? "1" : "0");
  } catch {
    // Best-effort preference.
  }
}

type ThreadView = {
  thread: ChatThread;
  messages: ChatMessageRecord[];
  changeSets: ChangeSetWithItems[];
  total: number;
};

export function AiAnalysis() {
  const { profileId } = useApp();
  const { t, lang } = useI18n();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const requestedThreadId = (() => {
    const raw = params.get(THREAD_PARAM);
    return raw && /^\d+$/.test(raw) ? Number(raw) : null;
  })();

  // Provider + safety capsule are per profile; the thread is loaded separately
  // so switching chats never re-reads the whole record.
  const { data: boot, loading } = useQuery(async () => {
    const [provider, context] = await Promise.all([
      getConfiguredProvider(),
      buildHealthContext(profileId),
    ]);
    return { provider, context };
  }, [profileId]);

  const [threadId, setThreadId] = React.useState<number | null>(null);
  const [threadTitle, setThreadTitle] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<ChatMessageRecord[]>([]);
  const [totalMessages, setTotalMessages] = React.useState(0);
  const [changeSets, setChangeSets] = React.useState<ChangeSetWithItems[]>([]);
  const [context, setContext] = React.useState("");
  const [input, setInput] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [savingSetId, setSavingSetId] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showContext, setShowContext] = React.useState(false);
  const [panelOpen, setPanelOpen] = React.useState(loadPanelPref);
  const [switcherOpen, setSwitcherOpen] = React.useState(false);
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [listVersion, setListVersion] = React.useState(0);
  const [copiedId, setCopiedId] = React.useState<number | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const switcherRef = React.useRef<HTMLDivElement>(null);
  // Auto-scroll follows the transcript only while the reader is already at the
  // bottom: yanking the view down while they are re-reading an earlier answer is
  // the classic chat annoyance. When they are up in the history, a button
  // offers the jump instead of forcing it.
  const atBottomRef = React.useRef(true);
  const [showJump, setShowJump] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);
  const loadRun = React.useRef(0);
  // Mirror of `pending` for the keyboard/URL handlers, which are memoized and
  // must not go stale between renders.
  const pendingRef = React.useRef(false);
  React.useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  React.useEffect(() => {
    if (boot) setContext(boot.context);
  }, [boot]);

  const refreshList = () => setListVersion((n) => n + 1);

  /** Loads one thread's newest page and makes it current. */
  const loadThread = React.useCallback(
    async (id: number | null): Promise<void> => {
      const run = ++loadRun.current;
      let thread = id != null ? await getChatThread(id) : null;
      // A stale or foreign id in the URL falls back to the usual default thread.
      if (!thread || thread.profileId !== profileId)
        thread = await getOrCreateChatThread(profileId);
      const [page, sets, total] = await Promise.all([
        listChatMessages(thread.id, MESSAGE_PAGE),
        listThreadChangeSets(thread.id),
        countChatMessages(thread.id),
      ]);
      if (run !== loadRun.current) return;
      const view: ThreadView = { thread, messages: page, changeSets: sets, total };
      setThreadId(view.thread.id);
      setThreadTitle(
        view.thread.title ??
          (view.messages.find((m) => m.role === "user")?.content
            ? deriveThreadTitle(view.messages.find((m) => m.role === "user")!.content)
            : null),
      );
      setMessages(view.messages);
      setTotalMessages(view.total);
      setChangeSets(view.changeSets);
      setError(null);
      atBottomRef.current = true;
      setShowJump(false);
      if (view.thread.id !== id) {
        setParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.set(THREAD_PARAM, String(view.thread.id));
            return next;
          },
          { replace: true },
        );
      }
    },
    [profileId, setParams],
  );

  React.useEffect(() => {
    void loadThread(requestedThreadId);
  }, [loadThread, requestedThreadId]);

  React.useEffect(() => {
    if (!atBottomRef.current) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, changeSets, pending]);

  // The composer grows with the draft up to the CSS max height, then scrolls —
  // a fixed two-row box hides everything a longer question says.
  React.useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  React.useEffect(() => () => abortRef.current?.abort(), []);

  // Header popover: any click outside or Escape closes it.
  React.useEffect(() => {
    if (!switcherOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!switcherRef.current?.contains(e.target as Node)) setSwitcherOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSwitcherOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [switcherOpen]);

  const openThread = React.useCallback(
    (id: number) => {
      if (pendingRef.current) return;
      setSwitcherOpen(false);
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set(THREAD_PARAM, String(id));
          return next;
        },
        { replace: false },
      );
      window.setTimeout(() => inputRef.current?.focus(), 0);
    },
    [setParams],
  );

  // A new chat reuses an empty thread rather than stacking blank ones: the
  // current one if it has no messages, else any other empty active thread.
  const newThread = React.useCallback(async () => {
    if (pendingRef.current) return;
    setSwitcherOpen(false);
    if (threadId != null && messages.length === 0) {
      inputRef.current?.focus();
      return;
    }
    const existing = (await listChatThreads(profileId, { status: "active" })).find(
      (thread) => thread.messageCount === 0,
    );
    const target = existing ?? (await createChatThread(profileId));
    refreshList();
    openThread(target.id);
  }, [profileId, threadId, messages.length, openThread]);

  const togglePanel = React.useCallback(() => {
    setPanelOpen((open) => {
      savePanelPref(!open);
      return !open;
    });
  }, []);

  // ⌘⇧O new chat, ⌘⇧H toggle the list — page-scoped, so they never leak into
  // other screens and need nothing in the shell.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return;
      const key = e.key.toLowerCase();
      if (key === "o") {
        e.preventDefault();
        void newThread();
      } else if (key === "h") {
        e.preventDefault();
        togglePanel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newThread, togglePanel]);

  if (loading || !boot || threadId == null) return <Loading />;

  if (!boot.provider) {
    return (
      <>
        <PageHeader title={t("aiAnalysis.title")} description={t("aiAnalysis.description")} />
        <Card className="mx-auto max-w-lg">
          <CardContent className="flex flex-col items-center py-10 text-center">
            <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-secondary">
              <Sparkles className="size-5 text-secondary-foreground" />
            </div>
            <p className="text-sm font-medium">{t("aiAnalysis.stubTitle")}</p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              {t("aiAnalysis.stubDescription")}
            </p>
            <Link to={settingsPath("ai")} className="mt-4">
              <Button>
                <SettingsIcon /> {t("aiAnalysis.openSettings")}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </>
    );
  }

  const provider = boot.provider;

  const complete = async (history: ChatMessageRecord[], sourceMessage: ChatMessageRecord) => {
    setPending(true);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await runHealthAgentTurn({
        provider,
        profileId,
        threadId,
        sourceMessageId: sourceMessage.id,
        messages: history.slice(-MAX_AGENT_MESSAGES),
        language: lang,
        signal: controller.signal,
      });
      const settings = loadAiSettings();
      const assistant = await addChatMessage({
        threadId,
        role: "assistant",
        content: result.content,
        providerId: provider.id,
        modelId: effectiveModelId(settings),
      });
      setMessages([...history, assistant]);
      setTotalMessages((n) => n + 1);
      if (result.changeSet) setChangeSets((current) => [...current, result.changeSet!]);
    } catch (caught) {
      if (caught instanceof AIProviderError && caught.kind === "cancelled") return;
      setError(aiErrorMessage(caught, t));
    } finally {
      abortRef.current = null;
      setPending(false);
      refreshList();
    }
  };

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    // Sending is an explicit "I want to see what happens next".
    atBottomRef.current = true;
    setShowJump(false);
    const user = await addChatMessage({ threadId, role: "user", content: trimmed });
    const history = [...messages, user];
    setMessages(history);
    setTotalMessages((n) => n + 1);
    if (!threadTitle) setThreadTitle(deriveThreadTitle(trimmed));
    setInput("");
    refreshList();
    await complete(history, user);
  };

  const stop = () => abortRef.current?.abort();

  const retry = () => {
    if (pending) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "user") return;
    void complete(messages, last);
  };

  // Re-ask the question that produced this answer. The old answer is dropped
  // from the view first, so the thread never shows two replies to one question.
  const regenerate = (assistantId: number) => {
    if (pending) return;
    const index = messages.findIndex((message) => message.id === assistantId);
    if (index < 1) return;
    const question = messages[index - 1];
    if (question.role !== "user") return;
    const history = messages.slice(0, index);
    setMessages(history);
    setTotalMessages((n) => Math.max(0, n - 1));
    atBottomRef.current = true;
    void (async () => {
      await deleteChatMessage(assistantId);
      await complete(history, question);
    })();
  };

  const copyMessage = async (message: ChatMessageRecord) => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedId(message.id);
      window.setTimeout(() => setCopiedId((id) => (id === message.id ? null : id)), 1500);
      toast.show(t("aiAnalysis.copied"));
    } catch {
      toast.error(t("errors.actionFailed"));
    }
  };

  // Older history is prepended while keeping the reader's place: the scroll
  // offset is shifted by exactly the height the new rows added above.
  const showEarlier = async () => {
    const first = messages[0];
    if (!first) return;
    const el = scrollRef.current;
    const before = el ? el.scrollHeight - el.scrollTop : 0;
    const older = await listChatMessages(threadId, MESSAGE_PAGE, first.id);
    atBottomRef.current = false;
    setMessages((current) => [...older, ...current]);
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - before;
    });
  };

  const selectChange = async (setId: number, itemId: number, selected: boolean) => {
    await setChangeItemSelected(itemId, selected);
    setChangeSets((current) =>
      current.map((set) =>
        set.id === setId
          ? {
              ...set,
              items: set.items.map((item) => (item.id === itemId ? { ...item, selected } : item)),
            }
          : set,
      ),
    );
  };

  const saveChangeSet = async (setId: number) => {
    setSavingSetId(setId);
    setError(null);
    try {
      await commitHealthChangeSet(profileId, setId);
      const [sets, freshContext] = await Promise.all([
        listThreadChangeSets(threadId),
        buildHealthContext(profileId),
      ]);
      setChangeSets(sets);
      setContext(freshContext);
      refreshList();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setChangeSets(await listThreadChangeSets(threadId));
    } finally {
      setSavingSetId(null);
    }
  };

  const discardChangeSet = async (setId: number) => {
    await discardChatChangeSet(setId);
    setChangeSets((current) =>
      current.map((set) => (set.id === setId ? { ...set, status: "discarded" } : set)),
    );
    refreshList();
  };

  const starters = [t("aiAnalysis.starter1"), t("aiAnalysis.starter2"), t("aiAnalysis.starter3")];

  // A change set belongs to the turn that produced it, not to the end of the
  // transcript: anchor it to that turn's assistant reply (its own user message
  // when the reply is still missing) so it scrolls away with its own history
  // instead of hanging under every later answer.
  const setsByAnchor = new Map<number, ChangeSetWithItems[]>();
  const orphanSets: ChangeSetWithItems[] = [];
  for (const set of changeSets) {
    const sourceIndex = messages.findIndex((message) => message.id === set.sourceMessageId);
    if (sourceIndex === -1) {
      orphanSets.push(set);
      continue;
    }
    const reply = messages.slice(sourceIndex + 1).find((message) => message.role === "assistant");
    const anchorId = reply?.id ?? messages[sourceIndex].id;
    setsByAnchor.set(anchorId, [...(setsByAnchor.get(anchorId) ?? []), set]);
  }

  const renderChangeSet = (set: ChangeSetWithItems) => (
    <ChangeSetPanel
      key={set.id}
      changeSet={set}
      saving={savingSetId === set.id}
      onSelect={(itemId, selected) => void selectChange(set.id, itemId, selected)}
      onSave={() => void saveChangeSet(set.id)}
      onDiscard={() => void discardChangeSet(set.id)}
    />
  );

  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;
  const currentTitle = threadTitle ?? t("aiAnalysis.threads.newUntitled");

  const threadListProps = {
    profileId,
    currentId: threadId,
    busy: pending,
    refreshKey: listVersion,
    onOpen: openThread,
    onNew: () => void newThread(),
    onCurrentGone: () => void loadThread(null),
    onChanged: () => {
      refreshList();
      void getChatThread(threadId).then((thread) => {
        if (!thread) return;
        setThreadTitle(
          thread.title ??
            (messages.find((m) => m.role === "user")
              ? deriveThreadTitle(messages.find((m) => m.role === "user")!.content)
              : null),
        );
      });
    },
  };

  return (
    <>
      <PageHeader title={t("aiAnalysis.title")} description={t("aiAnalysis.description")} />
      <div className="flex min-h-0 flex-1 gap-4">
        {panelOpen && (
          <aside className="hidden w-64 shrink-0 flex-col border-r pr-3 md:flex">
            <ThreadList {...threadListProps} className="min-h-0 flex-1" />
          </aside>
        )}
        <div className="mx-auto flex w-full max-w-3xl min-w-0 min-h-0 flex-1 flex-col">
          <div className="mb-2 flex items-center gap-1.5">
            <Tooltip
              content={`${t(panelOpen ? "aiAnalysis.threads.hidePanel" : "aiAnalysis.threads.showPanel")} (⌘⇧H)`}
            >
              <Button
                variant="ghost"
                size="iconSm"
                onClick={togglePanel}
                aria-label={t(
                  panelOpen ? "aiAnalysis.threads.hidePanel" : "aiAnalysis.threads.showPanel",
                )}
                aria-pressed={panelOpen}
                className="hidden text-muted-foreground md:inline-flex"
              >
                <PanelLeft />
              </Button>
            </Tooltip>
            <div ref={switcherRef} className="relative min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setSwitcherOpen((open) => !open)}
                aria-haspopup="dialog"
                aria-expanded={switcherOpen}
                className="flex max-w-full items-center gap-1 rounded-md px-2 py-1 text-left text-sm font-medium hover:bg-muted"
              >
                <span className={cn("truncate", !threadTitle && "text-muted-foreground")}>
                  {currentTitle}
                </span>
                <ChevronDown
                  className={cn(
                    "size-3.5 shrink-0 text-muted-foreground transition-transform",
                    switcherOpen && "rotate-180",
                  )}
                />
              </button>
              {switcherOpen && (
                <div
                  role="dialog"
                  aria-label={t("aiAnalysis.threads.title")}
                  className="absolute top-full left-0 z-30 mt-1 flex max-h-[70vh] w-80 flex-col rounded-lg border bg-popover p-2 shadow-lg"
                >
                  <ThreadList {...threadListProps} autoFocusSearch className="min-h-0 flex-1" />
                </div>
              )}
            </div>
            <Tooltip content={t("aiAnalysis.threads.details")}>
              <Button
                variant="ghost"
                size="iconSm"
                onClick={() => setDetailsOpen(true)}
                aria-label={t("aiAnalysis.threads.details")}
                className="text-muted-foreground"
              >
                <Info />
              </Button>
            </Tooltip>
            <Tooltip content={`${t("aiAnalysis.threads.new")} (⌘⇧O)`}>
              <Button
                variant="ghost"
                size="iconSm"
                onClick={() => void newThread()}
                disabled={pending}
                aria-label={t("aiAnalysis.threads.new")}
                className="text-muted-foreground"
              >
                <Plus />
              </Button>
            </Tooltip>
          </div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setShowContext((value) => !value)}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <ChevronDown
                className={cn("size-3 transition-transform", showContext && "rotate-180")}
              />
              {t("aiAnalysis.viewContext")}
            </button>
          </div>
          {showContext && (
            <div className="mb-2 rounded-lg border bg-muted/40 p-3">
              <p className="mb-1 text-[11px] font-medium text-muted-foreground">
                {t("aiAnalysis.contextExplainer")}
              </p>
              <pre className="max-h-40 overflow-auto text-[11px] leading-snug whitespace-pre-wrap text-muted-foreground">
                {context}
              </pre>
            </div>
          )}
          <div
            ref={scrollRef}
            onScroll={(event) => {
              const el = event.currentTarget;
              const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
              atBottomRef.current = atBottom;
              setShowJump((current) => (current === !atBottom ? current : !atBottom));
            }}
            className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1"
          >
            {messages.length < totalMessages && (
              <div className="flex justify-center">
                <Button variant="outline" size="sm" onClick={() => void showEarlier()}>
                  {t("aiAnalysis.showEarlier")}
                </Button>
              </div>
            )}
            {messages.length === 0 && !pending && (
              <div className="flex flex-col items-center gap-4 py-10 text-center">
                <div className="flex size-11 items-center justify-center rounded-full bg-secondary">
                  <Sparkles className="size-5 text-secondary-foreground" />
                </div>
                <p className="max-w-sm text-sm text-muted-foreground">{t("aiAnalysis.empty")}</p>
                <div className="flex flex-col gap-2">
                  {starters.map((starter) => (
                    <button
                      key={starter}
                      type="button"
                      onClick={() => void send(starter)}
                      className="rounded-lg border px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      {starter}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((message) => (
              <React.Fragment key={message.id}>
                <div
                  className={cn(
                    "group flex",
                    message.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "border bg-card text-foreground",
                    )}
                  >
                    {message.role === "assistant" ? (
                      <AssistantContent content={message.content} />
                    ) : (
                      message.content
                    )}
                    {message.role === "assistant" && <AiDisclaimer />}
                    <div
                      className={cn(
                        "mt-1.5 flex items-center gap-1 text-[10px]",
                        message.role === "user"
                          ? "justify-end text-primary-foreground/70"
                          : "text-muted-foreground",
                      )}
                    >
                      <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
                      {message.role === "assistant" && (
                        // Icon-only actions: the tooltip carries the meaning, the
                        // aria-label carries it for screen readers. Shown on
                        // hover/focus, and always on the latest answer.
                        <span
                          className={cn(
                            "ml-1 flex items-center gap-0.5 transition-opacity",
                            message.id === lastAssistantId
                              ? "opacity-100"
                              : "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
                          )}
                        >
                          <Tooltip content={t("aiAnalysis.copyAnswer")}>
                            <button
                              type="button"
                              onClick={() => void copyMessage(message)}
                              aria-label={t("aiAnalysis.copyAnswer")}
                              className="inline-flex size-7 items-center justify-center rounded-md hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 outline-none"
                            >
                              {copiedId === message.id ? (
                                <Check className="size-3.5 text-success-strong" />
                              ) : (
                                <Copy className="size-3.5" />
                              )}
                            </button>
                          </Tooltip>
                          <Tooltip
                            content={t(
                              pending
                                ? "aiAnalysis.regenerateBlocked"
                                : "aiAnalysis.regenerateAnswer",
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => regenerate(message.id)}
                              disabled={pending}
                              aria-label={t("aiAnalysis.regenerateAnswer")}
                              className="inline-flex size-7 items-center justify-center rounded-md hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 outline-none disabled:opacity-50"
                            >
                              <RefreshCw className="size-3.5" />
                            </button>
                          </Tooltip>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {setsByAnchor.get(message.id)?.map(renderChangeSet)}
              </React.Fragment>
            ))}
            {orphanSets.map(renderChangeSet)}
            {pending && (
              <div className="flex justify-start" role="status" aria-live="polite">
                <div className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-2.5 text-sm text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" /> {t("aiAnalysis.thinking")}
                  </span>
                  <button
                    type="button"
                    onClick={stop}
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs hover:bg-muted"
                  >
                    <Square className="size-3" /> {t("aiAnalysis.stop")}
                  </button>
                </div>
              </div>
            )}
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p>{error}</p>
                  {messages[messages.length - 1]?.role === "user" && (
                    <Button size="sm" variant="outline" className="mt-2" onClick={retry}>
                      {t("aiAnalysis.retry")}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="relative mt-3 border-t pt-3">
            {showJump && (
              <button
                type="button"
                onClick={() => {
                  const el = scrollRef.current;
                  if (!el) return;
                  el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
                  atBottomRef.current = true;
                  setShowJump(false);
                }}
                className="absolute -top-11 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full border bg-card px-3 py-1.5 text-xs shadow-sm transition-colors hover:bg-muted"
              >
                <ArrowDown className="size-3" />
                {t("aiAnalysis.jumpToLatest")}
              </button>
            )}
            <div className="flex items-end gap-2">
              {/* Not a message attachment: it opens the document importer, so the
                  icon and label both say "import", not "paperclip". */}
              <Tooltip content={t("aiAnalysis.attachDocument")}>
                <Link
                  to="/labs/import"
                  aria-label={t("aiAnalysis.attachDocument")}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <FileUp className="size-4" />
                  <span className="hidden sm:inline">{t("aiAnalysis.importDocument")}</span>
                </Link>
              </Tooltip>
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  // isComposing: an IME candidate window is open, so Enter is
                  // picking a character, not sending the message.
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void send(input);
                  }
                }}
                placeholder={t("aiAnalysis.placeholder")}
                rows={2}
                className="max-h-40 min-h-[2.5rem] flex-1 resize-none overflow-y-auto"
              />
              {pending ? (
                <Button onClick={stop} size="icon" variant="outline" title={t("aiAnalysis.stop")}>
                  <Square className="size-4" />
                </Button>
              ) : (
                <Button onClick={() => void send(input)} disabled={!input.trim()} size="icon">
                  <Send className="size-4" />
                </Button>
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">{t("aiAnalysis.inputHint")}</p>
          </div>
        </div>
      </div>
      <ThreadDetails threadId={threadId} open={detailsOpen} onClose={() => setDetailsOpen(false)} />
    </>
  );
}
