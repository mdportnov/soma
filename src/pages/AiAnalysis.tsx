import * as React from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ChevronDown,
  FileUp,
  Loader2,
  Send,
  Settings as SettingsIcon,
  ArrowDown,
  Copy,
  RefreshCw,
  Sparkles,
  Square,
  Trash2,
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
  archiveChatThread,
  deleteChatMessage,
  discardChatChangeSet,
  getOrCreateChatThread,
  listChatMessages,
  listThreadChangeSets,
  setChangeItemSelected,
  type ChangeSetWithItems,
} from "@/db/chat-repos";
import type { ChatMessageRecord } from "@/db/schema";
import { PageHeader } from "@/components/app/PageHeader";
import { Loading } from "@/components/app/Loading";
import { useToast } from "@/components/app/Toast";
import { AiDisclaimer } from "@/components/app/AiDisclaimer";
import { aiErrorMessage } from "@/components/app/AiInterpretation";
import { ChangeSetPanel } from "@/components/chat/ChangeSetPanel";
import { AssistantContent } from "@/components/chat/AssistantContent";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { formatTime } from "@/lib/utils";
import { settingsPath } from "@/lib/settings-navigation";
import { clearChat as clearLegacyChat, loadChat as loadLegacyChat } from "@/lib/chat-store";

const MAX_AGENT_MESSAGES = 40;

export function AiAnalysis() {
  const { profileId } = useApp();
  const { t, lang } = useI18n();
  const toast = useToast();
  const { data: boot, loading } = useQuery(async () => {
    const provider = await getConfiguredProvider();
    const thread = await getOrCreateChatThread(profileId);
    let messages = await listChatMessages(thread.id);
    if (messages.length === 0) {
      const legacy = loadLegacyChat(profileId);
      for (const message of legacy) {
        await addChatMessage({
          threadId: thread.id,
          role: message.role,
          content: message.content,
        });
      }
      if (legacy.length) {
        clearLegacyChat(profileId);
        messages = await listChatMessages(thread.id);
      }
    }
    const [changeSets, context] = await Promise.all([
      listThreadChangeSets(thread.id),
      buildHealthContext(profileId),
    ]);
    return { provider, thread, messages, changeSets, context };
  }, [profileId]);
  const [threadId, setThreadId] = React.useState<number | null>(null);
  const [messages, setMessages] = React.useState<ChatMessageRecord[]>([]);
  const [changeSets, setChangeSets] = React.useState<ChangeSetWithItems[]>([]);
  const [context, setContext] = React.useState("");
  const [input, setInput] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [savingSetId, setSavingSetId] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showContext, setShowContext] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  // Auto-scroll follows the transcript only while the reader is already at the
  // bottom: yanking the view down while they are re-reading an earlier answer is
  // the classic chat annoyance. When they are up in the history, a button
  // offers the jump instead of forcing it.
  const atBottomRef = React.useRef(true);
  const [showJump, setShowJump] = React.useState(false);
  const [confirmClear, setConfirmClear] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);
  React.useEffect(() => {
    if (!boot) return;
    setThreadId(boot.thread.id);
    setMessages(boot.messages);
    setChangeSets(boot.changeSets);
    setContext(boot.context);
  }, [boot]);

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
      if (result.changeSet) setChangeSets((current) => [...current, result.changeSet!]);
    } catch (caught) {
      if (caught instanceof AIProviderError && caught.kind === "cancelled") return;
      setError(aiErrorMessage(caught, t));
    } finally {
      abortRef.current = null;
      setPending(false);
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
    setInput("");
    await complete(history, user);
  };

  const stop = () => abortRef.current?.abort();

  const clear = async () => {
    if (pending) return;
    await archiveChatThread(threadId);
    const thread = await getOrCreateChatThread(profileId);
    setThreadId(thread.id);
    setMessages([]);
    setChangeSets([]);
    setError(null);
  };

  const retry = () => {
    if (pending) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "user") return;
    void complete(messages, last);
  };

  // Re-ask the question that produced this answer. The old answer is dropped
  // from the view first, so the thread never shows two replies to one question;
  // it stays in the database as the turn's history.
  const regenerate = (assistantId: number) => {
    if (pending) return;
    const index = messages.findIndex((message) => message.id === assistantId);
    if (index < 1) return;
    const question = messages[index - 1];
    if (question.role !== "user") return;
    const history = messages.slice(0, index);
    setMessages(history);
    atBottomRef.current = true;
    void (async () => {
      await deleteChatMessage(assistantId);
      await complete(history, question);
    })();
  };

  const copyMessage = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast.show(t("aiAnalysis.copied"));
    } catch {
      toast.error(t("errors.actionFailed"));
    }
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

  return (
    <>
      <PageHeader title={t("aiAnalysis.title")} description={t("aiAnalysis.description")} />
      <div className="mx-auto flex w-full max-w-3xl min-h-0 flex-1 flex-col">
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
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              disabled={pending}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <Trash2 className="size-3" />
              {t("aiAnalysis.clear")}
            </button>
          )}
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
                className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
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
                      "mt-1.5 flex items-center gap-2 text-[10px]",
                      message.role === "user"
                        ? "justify-end text-primary-foreground/70"
                        : "text-muted-foreground",
                    )}
                  >
                    <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
                    {message.role === "assistant" && (
                      <>
                        <button
                          type="button"
                          onClick={() => void copyMessage(message.content)}
                          className="inline-flex items-center gap-1 hover:text-foreground"
                        >
                          <Copy className="size-3" />
                          {t("common.copy")}
                        </button>
                        <button
                          type="button"
                          onClick={() => regenerate(message.id)}
                          disabled={pending}
                          className="inline-flex items-center gap-1 hover:text-foreground disabled:opacity-50"
                        >
                          <RefreshCw className="size-3" />
                          {t("aiAnalysis.regenerate")}
                        </button>
                      </>
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
      <ConfirmDialog
        open={confirmClear}
        title={t("aiAnalysis.clearConfirmTitle")}
        description={t("aiAnalysis.clearConfirmBody")}
        confirmLabel={t("aiAnalysis.clear")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={() => {
          setConfirmClear(false);
          void clear();
        }}
        onClose={() => setConfirmClear(false)}
      />
    </>
  );
}
