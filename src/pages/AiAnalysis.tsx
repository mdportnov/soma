import * as React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Loader2, Send, Settings as SettingsIcon, Sparkles } from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import { getConfiguredProvider } from "@/ai";
import { buildHealthContext } from "@/ai/context";
import { buildHealthChatSystem } from "@/ai/prompts";
import type { ChatMessage } from "@/ai/types";
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

  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, pending]);

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
    try {
      const reply = await provider.chat(history, system);
      setMessages([...history, { role: "assistant", content: reply }]);
    } catch (e) {
      setError(aiErrorMessage(e, t));
    } finally {
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
                {m.role === "assistant" && i === messages.length - 1 && <AiDisclaimer />}
              </div>
            </div>
          ))}

          {pending && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl border bg-card px-4 py-2.5 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> {t("aiAnalysis.thinking")}
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
            <Button onClick={() => send(input)} disabled={pending || !input.trim()} size="icon">
              <Send className="size-4" />
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">{t("aiAnalysis.inputHint")}</p>
        </div>
      </div>
    </>
  );
}
