import * as React from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ChevronDown,
  Loader2,
  Paperclip,
  Send,
  Settings as SettingsIcon,
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
import { AiDisclaimer } from "@/components/app/AiDisclaimer";
import { aiErrorMessage } from "@/components/app/AiInterpretation";
import { ChangeSetPanel } from "@/components/chat/ChangeSetPanel";
import { AssistantContent } from "@/components/chat/AssistantContent";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { settingsPath } from "@/lib/settings-navigation";
import { clearChat as clearLegacyChat, loadChat as loadLegacyChat } from "@/lib/chat-store";

const MAX_AGENT_MESSAGES = 40;

export function AiAnalysis() {
  const { profileId } = useApp();
  const { t, lang } = useI18n();
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
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    if (!boot) return;
    setThreadId(boot.thread.id);
    setMessages(boot.messages);
    setChangeSets(boot.changeSets);
    setContext(boot.context);
  }, [boot]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, changeSets, pending]);

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

  return (
    <>
      <PageHeader title={t("aiAnalysis.title")} description={t("aiAnalysis.description")} />
      <div className="mx-auto flex max-w-3xl flex-col" style={{ height: "calc(100vh - 12rem)" }}>
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
              onClick={() => void clear()}
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
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto pr-1">
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
            <div
              key={message.id}
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
              </div>
            </div>
          ))}
          {changeSets.map((set) => (
            <ChangeSetPanel
              key={set.id}
              changeSet={set}
              saving={savingSetId === set.id}
              onSelect={(itemId, selected) => void selectChange(set.id, itemId, selected)}
              onSave={() => void saveChangeSet(set.id)}
              onDiscard={() => void discardChangeSet(set.id)}
            />
          ))}
          {pending && (
            <div className="flex justify-start">
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
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
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
        <div className="mt-3 border-t pt-3">
          <div className="flex items-end gap-2">
            <Link to="/labs/import" title={t("aiAnalysis.attachDocument")}>
              <Button size="icon" variant="outline">
                <Paperclip className="size-4" />
              </Button>
            </Link>
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(input);
                }
              }}
              placeholder={t("aiAnalysis.placeholder")}
              rows={2}
              className="max-h-40 min-h-[2.5rem] flex-1 resize-none"
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
    </>
  );
}
