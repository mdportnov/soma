import * as React from "react";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { useApp } from "@/app/AppContext";
import { getChatThreadMeta, type ChatThreadMeta } from "@/db/chat-repos";
import type { ChatThreadRecord } from "@/db/schema";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import { pluralForm } from "@/lib/plural";
import { formatDate, formatTime } from "@/lib/utils";
import { recordLinkHref, recordLinkType } from "./record-link";
import { recordKey, resolveRecordTitles } from "./record-title";

/**
 * Everything the app knows about one conversation: when it ran, which models
 * answered, how many records were read, and — the part that makes a chat
 * findable later — the records it cited and the ones it changed, each a link
 * to the record itself.
 */
export function ThreadDetails(props: {
  threadId: number | null;
  open: boolean;
  onClose: () => void;
}) {
  const { t, lang } = useI18n();
  const { profileId } = useApp();
  const [meta, setMeta] = React.useState<ChatThreadMeta | null>(null);
  // Record names load after the meta so the card appears at once; until they
  // arrive a row shows its type badge only, never a bare id.
  const [titles, setTitles] = React.useState<Map<string, string | null | undefined>>(new Map());

  React.useEffect(() => {
    if (!props.open || props.threadId == null) return;
    let cancelled = false;
    setMeta(null);
    setTitles(new Map());
    void getChatThreadMeta(props.threadId).then(async (value) => {
      if (cancelled) return;
      setMeta(value);
      if (!value?.records.length) return;
      const resolved = await resolveRecordTitles(value.records, profileId, t);
      if (!cancelled) setTitles(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [props.open, props.threadId, profileId, t]);

  const plural = (key: string, n: number) =>
    t(`aiAnalysis.threads.${key}.${pluralForm(lang, n)}`, { n: String(n) });
  const when = (iso: string | null) => (iso ? `${formatDate(iso)}, ${formatTime(iso)}` : "—");

  const cited = meta?.records.filter((r) => r.relation === "cited") ?? [];
  const changed = meta?.records.filter((r) => r.relation === "changed") ?? [];

  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title={meta?.summary.displayTitle ?? t("aiAnalysis.threads.details")}
      className="max-w-lg"
    >
      {!meta ? (
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-5 animate-pulse rounded bg-muted/70" />
          ))}
        </div>
      ) : (
        <div className="space-y-4 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
            <dt className="text-muted-foreground">{t("aiAnalysis.threads.created")}</dt>
            <dd>{when(meta.firstMessageAt ?? meta.summary.createdAt)}</dd>
            <dt className="text-muted-foreground">{t("aiAnalysis.threads.lastActivity")}</dt>
            <dd>{when(meta.summary.updatedAt)}</dd>
            <dt className="text-muted-foreground">{t("aiAnalysis.threads.modelsUsed")}</dt>
            <dd>
              {meta.models.length === 0 ? (
                "—"
              ) : (
                <ul className="space-y-0.5">
                  {meta.models.map((m) => (
                    <li key={`${m.providerId}:${m.modelId}`} className="flex flex-wrap gap-1.5">
                      <span className="font-medium">{m.modelId ?? "—"}</span>
                      {m.providerId && (
                        <span className="text-muted-foreground">{m.providerId}</span>
                      )}
                      <span className="text-muted-foreground">
                        · {plural("replies", m.replies)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </dl>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary">{plural("messages", meta.summary.messageCount)}</Badge>
            <Badge variant="secondary">{plural("toolCalls", meta.toolCalls)}</Badge>
            {meta.changeSets.committed > 0 && (
              <Badge variant="success">{plural("changesSaved", meta.changeSets.committed)}</Badge>
            )}
            {meta.changeSets.pending > 0 && (
              <Badge variant="warning">{plural("pending", meta.changeSets.pending)}</Badge>
            )}
          </div>
          {cited.length === 0 && changed.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("aiAnalysis.threads.noRecords")}</p>
          ) : (
            <>
              <RecordList
                title={t("aiAnalysis.threads.recordsCited")}
                records={cited}
                titles={titles}
                onNavigate={props.onClose}
              />
              <RecordList
                title={t("aiAnalysis.threads.recordsChanged")}
                records={changed}
                titles={titles}
                onNavigate={props.onClose}
              />
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}

function RecordList(props: {
  title: string;
  records: ChatThreadRecord[];
  /**
   * Resolved names by `recordKey`: a name, null for a record that no longer
   * exists, undefined for a kind that has no name lookup (falls back to id).
   */
  titles: Map<string, string | null | undefined>;
  onNavigate: () => void;
}) {
  const { t, lang } = useI18n();
  if (!props.records.length) return null;
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">{props.title}</h3>
      <ul className="max-h-48 space-y-1 overflow-y-auto">
        {props.records.map((record) => {
          const key = recordKey(record);
          const loading = !props.titles.has(key);
          const title = props.titles.get(key);
          return (
            <li key={record.id}>
              <Link
                to={recordLinkHref(record.entityType, record.entityId)}
                onClick={props.onNavigate}
                className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted"
              >
                <Badge variant="outline">
                  {t(`search.types.${recordLinkType(record.entityType)}`)}
                </Badge>
                <span className="min-w-0 flex-1 truncate" title={title ?? undefined}>
                  {loading ? (
                    <span className="inline-block h-3 w-24 animate-pulse rounded bg-muted/70 align-middle" />
                  ) : title ? (
                    title
                  ) : title === null ? (
                    <span className="italic text-muted-foreground">
                      {t("aiAnalysis.threads.recordGone")}
                    </span>
                  ) : (
                    `#${record.entityId}`
                  )}
                  <span className="ml-2 text-muted-foreground">
                    {t(`aiAnalysis.threads.hits.${pluralForm(lang, record.hits)}`, {
                      n: String(record.hits),
                    })}
                    {" · "}
                    {formatDate(record.lastSeenAt)}
                  </span>
                </span>
                <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
