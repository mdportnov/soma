import * as React from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ChevronDown,
  Loader2,
  Send,
  Settings as SettingsIcon,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import { getConfiguredProvider } from "@/ai";
import { buildHealthContext } from "@/ai/context";
import { buildHealthChatSystem } from "@/ai/prompts";
import { AIProviderError, type ChatMessage } from "@/ai/types";
import { clearChat, loadChat, MAX_CHAT_MESSAGES, saveChat } from "@/lib/chat-store";
import { PageHeader } from "@/components/app/PageHeader";
import { Loading } from "@/components/app/Loading";
import { AiDisclaimer } from "@/components/app/AiDisclaimer";
import { aiErrorMessage } from "@/components/app/AiInterpretation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export function AiAnalysis() {
  const { profileId } = useApp();
  const { t } = useI18n();

  const { data: boot, loading } = useQuery(
    async () => ({
      provider: await getConfiguredProvider(),
      context: await buildHealthContext(profileId),
    }),
    [profileId],
  );

  const [messages, setMessages] = React.useState<ChatMessage[]>(() => loadChat(profileId));
  const [input, setInput] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showContext, setShowContext] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  // Reload the persisted thread when the active profile changes.
  React.useEffect(() => {
    setMessages(loadChat(profileId));
  }, [profileId]);

  // Persist on every change so navigation away never loses the conversation.
  React.useEffect(() => {
    saveChat(profileId, messages);
  }, [profileId, messages]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, pending]);

  // Abort any in-flight request if the page unmounts.
  React.useEffect(() => () => abortRef.current?.abort(), []);

  if (loading || !boot) return <Loading />;

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
            <Link to="/settings" state={{ openAi: true }} className="mt-4">
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
  const system = buildHealthChatSystem(boot.context);

  const complete = async (history: ChatMessage[]) => {
    setPending(true);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      // Cap the turns sent so a long thread can't overflow the context window
      // (the full thread is still shown and stored).
      const reply = await provider.chat(
        history.slice(-MAX_CHAT_MESSAGES),
        system,
        controller.signal,
      );
      setMessages([...history, { role: "assistant", content: reply }]);
    } catch (e) {
      // A user-initiated Stop is not an error — leave the unanswered user turn
      // in place so they can retry or edit.
      if (e instanceof AIProviderError && e.kind === "cancelled") return;
      setError(aiErrorMessage(e, t));
    } finally {
      abortRef.current = null;
      setPending(false);
    }
  };

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    void complete(next);
  };

  const stop = () => abortRef.current?.abort();

  const clear = () => {
    if (pending) return;
    setMessages([]);
    setError(null);
    clearChat(profileId);
  };

  // Retry re-runs the model on the existing history (which ends in the
  // unanswered user turn) — no duplicate user message.
  const retry = () => {
    if (pending || messages[messages.length - 1]?.role !== "user") return;
    void complete(messages);
  };

  const starters = [t("aiAnalysis.starter1"), t("aiAnalysis.starter2"), t("aiAnalysis.starter3")];

  return (
    <>
      <PageHeader title={t("aiAnalysis.title")} description={t("aiAnalysis.description")} />

      <div className="mx-auto flex max-w-3xl flex-col" style={{ height: "calc(100vh - 12rem)" }}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setShowContext((v) => !v)}
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
              onClick={clear}
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
              {boot.context}
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
                {starters.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-lg border px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "border bg-card text-foreground",
                )}
              >
                {m.content}
                {m.role === "assistant" && <AiDisclaimer />}
              </div>
            </div>
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
                <Button size="sm" variant="outline" className="mt-2" onClick={retry}>
                  {t("aiAnalysis.retry")}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-3 border-t pt-3">
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
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
              <Button onClick={() => send(input)} disabled={!input.trim()} size="icon">
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
