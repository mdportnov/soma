import * as React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Info } from "lucide-react";
import type { DuplicateConfidence, PanelDuplicate, RecordDuplicate } from "@/lib/import-duplicates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n, type Lang } from "@/lib/i18n";
import { pluralForm } from "@/lib/plural";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * One row of a multi-row import (a vaccine dose, an imaging study) that looks
 * like something already stored, with what it was matched against.
 */
export type DuplicateRow = {
  /** 1-based position in the review table, so the user can find the row. */
  row: number;
  name: string;
  date: string | null;
  duplicates: RecordDuplicate[];
  /** Where the existing record opens. */
  href: (existing: RecordDuplicate) => string;
};

type Translate = (key: string, vars?: Record<string, string>) => string;

/** "Panel from 12 Mar 2024, Invitro — 14 biomarkers match" */
export function panelDuplicateLabel(t: Translate, lang: Lang, d: PanelDuplicate): string {
  return t("importWizard.duplicates.panelMatch", {
    date: formatDate(d.date),
    lab: d.labName?.trim() || t("importWizard.duplicates.unknownLab"),
    shared: t(`importWizard.duplicates.sharedCount.${pluralForm(lang, d.sharedBiomarkers)}`, {
      n: String(d.sharedBiomarkers),
    }),
  });
}

function strongest(confidences: DuplicateConfidence[]): DuplicateConfidence | null {
  if (!confidences.length) return null;
  return confidences.includes("likely") ? "likely" : "possible";
}

export function ConfidenceBadge({ confidence }: { confidence: DuplicateConfidence }) {
  const { t } = useI18n();
  return (
    <Badge variant={confidence === "likely" ? "warning" : "secondary"} className="shrink-0">
      {t(`importWizard.duplicates.${confidence}`)}
    </Badge>
  );
}

/**
 * "This looks already imported" notice above an import review. It never blocks
 * the save button below it: two draws on one day are legitimate, so the user
 * decides. What it does is make the decision an informed one — which existing
 * record, from which day and lab, how much overlaps — and keep a one-line
 * reminder in place after the user waves it through.
 *
 * A "likely" match is styled as a warning; a merely "possible" one stays
 * neutral, so the two degrees of confidence never read the same.
 */
export function ImportDuplicateNotice(props: {
  panels?: PanelDuplicate[];
  rows?: DuplicateRow[];
  className?: string;
}) {
  const { t, lang } = useI18n();
  const [acknowledged, setAcknowledged] = React.useState(false);
  const panels = props.panels ?? [];
  const rows = (props.rows ?? []).filter((r) => r.duplicates.length > 0);
  const confidence = strongest([
    ...panels.map((p) => p.confidence),
    ...rows.flatMap((r) => r.duplicates.map((d) => d.confidence)),
  ]);
  if (!confidence) return null;

  const likely = confidence === "likely";
  const Icon = likely ? AlertTriangle : Info;
  const tone = likely ? "border-warning/40 bg-warning/5" : "border-border bg-muted/40";
  const iconTone = likely ? "text-warning-strong" : "text-muted-foreground";

  if (acknowledged) {
    return (
      <div
        role="status"
        className={cn("mb-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs", tone)}
      >
        <Icon className={cn("size-3.5 shrink-0", iconTone)} aria-hidden />
        <span className="min-w-0 flex-1">{t("importWizard.duplicates.acknowledged")}</span>
        <ConfidenceBadge confidence={confidence} />
      </div>
    );
  }

  return (
    <div
      role="status"
      className={cn(
        "mb-4 flex items-start gap-2 rounded-lg border p-3 text-sm",
        tone,
        props.className,
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", iconTone)} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">
            {t(likely ? "importWizard.duplicates.title" : "importWizard.duplicates.titlePossible")}
          </p>
          <ConfidenceBadge confidence={confidence} />
        </div>
        <ul className="mt-1.5 space-y-1 text-xs">
          {panels.map((d) => (
            <li
              key={`panel-${d.panelId}`}
              className="flex flex-wrap items-center gap-x-2 gap-y-0.5"
            >
              <span>{panelDuplicateLabel(t, lang, d)}</span>
              {panels.length > 1 && <ConfidenceBadge confidence={d.confidence} />}
              <Link to={`/labs/${d.panelId}`} className="text-primary hover:underline">
                {t("importWizard.duplicates.openExisting")}
              </Link>
            </li>
          ))}
          {rows.map((r) =>
            r.duplicates.map((d) => (
              <li
                key={`row-${r.row}-${d.id}`}
                className="flex flex-wrap items-center gap-x-2 gap-y-0.5"
              >
                <span>
                  {t("importWizard.duplicates.rowMatch", {
                    row: String(r.row),
                    name: r.name,
                    date: r.date ? formatDate(r.date) : "—",
                    existing: d.name,
                  })}
                </span>
                {d.confidence !== confidence && <ConfidenceBadge confidence={d.confidence} />}
                <Link to={r.href(d)} className="text-primary hover:underline">
                  {t("importWizard.duplicates.openExisting")}
                </Link>
              </li>
            )),
          )}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">{t("importWizard.duplicates.explain")}</p>
        <Button size="sm" variant="outline" className="mt-2" onClick={() => setAcknowledged(true)}>
          {t("importWizard.duplicates.importAnyway")}
        </Button>
      </div>
    </div>
  );
}
