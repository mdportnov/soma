import { Link } from "react-router-dom";
import { FileText } from "lucide-react";

const RECORD_REF = /\[record:([a-z_]+):(\d+)\]/g;

export function AssistantContent({ content }: { content: string }) {
  const parts: Array<string | { entityType: string; entityId: number }> = [];
  let cursor = 0;
  for (const match of content.matchAll(RECORD_REF)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push(content.slice(cursor, index));
    parts.push({ entityType: match[1], entityId: Number(match[2]) });
    cursor = index + match[0].length;
  }
  if (cursor < content.length) parts.push(content.slice(cursor));
  return (
    <>
      {parts.map((part, index) =>
        typeof part === "string" ? (
          part
        ) : (
          <Link
            key={`${part.entityType}:${part.entityId}:${index}`}
            to={recordHref(part.entityType, part.entityId)}
            className="mx-0.5 inline-flex items-center gap-1 rounded border bg-muted px-1.5 py-0.5 align-baseline text-xs font-medium text-primary hover:bg-muted/70"
          >
            <FileText className="size-3" />
            {recordLabel(part.entityType)} #{part.entityId}
          </Link>
        ),
      )}
    </>
  );
}

function recordLabel(entityType: string): string {
  return entityType.replaceAll("_", " ");
}

function recordHref(entityType: string, entityId: number): string {
  if (entityType === "medication") return `/medications/${entityId}`;
  if (entityType === "diagnosis") return `/diagnoses/${entityId}`;
  if (entityType === "visit") return `/visits/${entityId}`;
  if (entityType === "imaging") return `/imaging/${entityId}`;
  if (entityType === "lab_panel") return `/labs/${entityId}`;
  if (entityType === "biomarker") return `/biomarkers/${entityId}`;
  if (entityType === "allergy") return "/allergies";
  if (entityType === "vaccine") return "/vaccines";
  return "/timeline";
}
