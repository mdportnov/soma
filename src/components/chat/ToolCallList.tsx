import * as React from "react";
import { Check, ChevronDown, Loader2, Wrench, X } from "lucide-react";
import type { ChatToolEvent } from "@/db/schema";
import type { AgentToolActivity } from "@/ai/agent/engine";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { pluralForm } from "@/lib/plural";

export type ToolCallView = AgentToolActivity;

export function toolCallFromEvent(event: ChatToolEvent): ToolCallView {
  return {
    id: String(event.id),
    name: event.toolName,
    arguments: event.argumentsJson,
    status: event.status,
    resultSummary: event.resultSummaryJson,
    durationMs: event.durationMs ?? undefined,
  };
}

/**
 * The tools the assistant called for one turn. While the turn runs every call
 * is listed as it starts; afterwards the list folds into one line that opens
 * on click, and each call opens to its arguments and result.
 */
export function ToolCallList({ calls, live = false }: { calls: ToolCallView[]; live?: boolean }) {
  const { t, lang } = useI18n();
  const [open, setOpen] = React.useState(false);
  if (!calls.length) return null;
  const failed = calls.filter((call) => call.status === "failed").length;
  const shown = live || open;
  return (
    <div className="w-full max-w-2xl text-xs">
      {!live && (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="inline-flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Wrench className="size-3.5 shrink-0" />
          <span className="truncate">
            {t(`aiAnalysis.tools.used.${pluralForm(lang, calls.length)}`, {
              n: String(calls.length),
            })}
            {failed > 0 && ` · ${t("aiAnalysis.tools.failedCount", { n: String(failed) })}`}
          </span>
          <ChevronDown
            className={cn("size-3 shrink-0 transition-transform", open && "rotate-180")}
          />
        </button>
      )}
      {shown && (
        <ul className={cn("space-y-1", !live && "mt-1")}>
          {calls.map((call) => (
            <ToolCallRow key={call.id} call={call} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ToolCallRow({ call }: { call: ToolCallView }) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const labelKey = `aiAnalysis.tools.name.${call.name}`;
  const label = t(labelKey) === labelKey ? call.name : t(labelKey);
  const detail = argumentsHint(call);
  const result = resultHint(call, t);
  return (
    <li className="animate-reveal rounded-lg border bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full min-w-0 items-center gap-2 px-2.5 py-1.5 text-left"
      >
        {call.status === "running" ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : call.status === "failed" ? (
          <X className="size-3.5 shrink-0 text-destructive" />
        ) : (
          <Check className="size-3.5 shrink-0 text-success-strong" />
        )}
        <span className="shrink-0 font-medium">{label}</span>
        {detail && <span className="min-w-0 truncate text-muted-foreground">{detail}</span>}
        <span className="ml-auto flex shrink-0 items-center gap-2 text-muted-foreground">
          {result && (
            <span
              className={cn("max-w-56 truncate", call.status === "failed" && "text-destructive")}
            >
              {result}
            </span>
          )}
          {call.durationMs != null && <span className="tabular-nums">{call.durationMs} ms</span>}
          <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t px-2.5 py-2">
          <p className="font-mono text-[11px] text-muted-foreground">{call.name}</p>
          <ToolJson title={t("aiAnalysis.tools.arguments")} value={call.arguments} />
          {call.resultSummary !== undefined && (
            <ToolJson title={t("aiAnalysis.tools.result")} value={call.resultSummary} />
          )}
        </div>
      )}
    </li>
  );
}

function ToolJson({ title, value }: { title: string; value: unknown }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium text-muted-foreground">{title}</p>
      <pre className="max-h-60 overflow-auto rounded-md bg-background p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all">
        {JSON.stringify(value ?? null, null, 2)}
      </pre>
    </div>
  );
}

/** The one or two arguments that say what a call was about. */
function argumentsHint(call: ToolCallView): string {
  const args = call.arguments;
  if (call.name === "draft_health_changes") {
    return typeof args.summary === "string" ? args.summary : "";
  }
  return Object.entries(args)
    .filter(([key, value]) => key !== "limit" && value != null && typeof value !== "object")
    .map(([, value]) => String(value))
    .join(" · ");
}

function resultHint(call: ToolCallView, t: (key: string, vars?: Record<string, string>) => string) {
  const summary = call.resultSummary;
  if (!summary || typeof summary !== "object") return "";
  const record = summary as Record<string, unknown>;
  if (call.status === "failed" && typeof record.error === "string") return record.error;
  if (typeof record.items === "number") {
    return t("aiAnalysis.tools.drafted", { n: String(record.items) });
  }
  for (const value of Object.values(record)) {
    if (
      value &&
      typeof value === "object" &&
      typeof (value as { count?: unknown }).count === "number"
    ) {
      return t("aiAnalysis.tools.found", { n: String((value as { count: number }).count) });
    }
  }
  return "";
}
