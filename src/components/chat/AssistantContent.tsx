import * as React from "react";
import { Link } from "react-router-dom";
import { FileText } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Markdown } from "./Markdown";
import { recordLinkHref, recordLinkType } from "./record-link";
import { recordKey, type RecordRef } from "./record-title";

const RECORD_REF = /\[record:([a-z_]+):(\d+)\]/g;

/** Resolved record names keyed by `recordKey`; null = deleted, undefined = unknown. */
export type RecordTitles = Map<string, string | null | undefined>;

export function parseContentRefs(content: string): RecordRef[] {
  return [...content.matchAll(RECORD_REF)].map((match) => ({
    entityType: match[1],
    entityId: Number(match[2]),
  }));
}

/** The answer as plain text, with each reference spelled out by its record name. */
export function contentAsText(
  content: string,
  titles: RecordTitles,
  t: (key: string) => string,
): string {
  return content.replace(RECORD_REF, (_, entityType: string, id: string) =>
    refLabel({ entityType, entityId: Number(id) }, titles, t),
  );
}

export function AssistantContent({ content, titles }: { content: string; titles: RecordTitles }) {
  const { t } = useI18n();
  const renderText = React.useCallback(
    (text: string, key: string) => {
      const parts: React.ReactNode[] = [];
      let cursor = 0;
      for (const match of text.matchAll(RECORD_REF)) {
        const index = match.index ?? 0;
        if (index > cursor) parts.push(text.slice(cursor, index));
        const ref = { entityType: match[1], entityId: Number(match[2]) };
        parts.push(<RecordChip key={`${key}-${index}`} recordRef={ref} titles={titles} t={t} />);
        cursor = index + match[0].length;
      }
      if (cursor < text.length) parts.push(text.slice(cursor));
      return <React.Fragment key={key}>{parts}</React.Fragment>;
    },
    [titles, t],
  );
  return <Markdown content={content} renderText={renderText} />;
}

function RecordChip({
  recordRef,
  titles,
  t,
}: {
  recordRef: RecordRef;
  titles: RecordTitles;
  t: (key: string) => string;
}) {
  const title = titles.get(recordKey(recordRef));
  const type = t(`search.types.${recordLinkType(recordRef.entityType)}`);
  const gone = title === null;
  return (
    <Link
      to={recordLinkHref(recordRef.entityType, recordRef.entityId)}
      title={gone ? `${type} · ${t("aiAnalysis.threads.recordGone")}` : type}
      className={cn(
        "mx-0.5 inline-flex max-w-full items-center gap-1 rounded border bg-muted px-1.5 py-0.5 align-baseline text-xs font-medium text-primary hover:bg-muted/70",
        gone && "text-muted-foreground line-through",
      )}
    >
      <FileText className="size-3 shrink-0" />
      <span className="truncate">{refLabel(recordRef, titles, t)}</span>
    </Link>
  );
}

function refLabel(ref: RecordRef, titles: RecordTitles, t: (key: string) => string): string {
  const title = titles.get(recordKey(ref));
  if (title) return title;
  const typeKey = `search.types.${recordLinkType(ref.entityType)}`;
  const type = t(typeKey) === typeKey ? ref.entityType.replaceAll("_", " ") : t(typeKey);
  return `${type} #${ref.entityId}`;
}
