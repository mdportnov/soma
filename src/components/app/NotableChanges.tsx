import { Link } from "react-router-dom";
import { Sparkles, TrendingUp } from "lucide-react";
import type { PanelChange } from "@/db/repos";
import type { ChangeReason, ChangeSeverity } from "@/lib/insights";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DeltaBadge } from "@/components/app/DeltaBadge";
import { formatDate, formatValue } from "@/lib/utils";

const SEVERITY_RANK: Record<ChangeSeverity, number> = { info: 0, watch: 1, alert: 2 };

/** Most significant reason first — drives the row's headline. */
const REASON_RANK: ChangeReason[] = [
  "worsened_critical",
  "became_out_of_range",
  "back_in_range",
  "large_move",
  "moved_within_range",
];

function primaryReason(reasons: ChangeReason[]): ChangeReason | null {
  for (const r of REASON_RANK) if (reasons.includes(r)) return r;
  return reasons[0] ?? null;
}

function severityVariant(s: ChangeSeverity): "destructive" | "warning" | "secondary" {
  return s === "alert" ? "destructive" : s === "watch" ? "warning" : "secondary";
}

/**
 * "What changed since last time" — the per-panel correlation view. Ranks the
 * notable moves (boundary crossings first, then large shifts) and explains each
 * in plain language. Renders nothing when there is no comparable history.
 */
export function NotableChanges({
  changes,
  title,
  description,
  limit,
}: {
  changes: PanelChange[];
  title?: string;
  description?: string;
  limit?: number;
}) {
  const { t } = useI18n();

  const comparable = changes.filter((c) => c.change != null);
  const notable = comparable
    .filter((c) => c.change!.notable)
    .sort((a, b) => {
      const bySeverity = SEVERITY_RANK[b.change!.severity] - SEVERITY_RANK[a.change!.severity];
      if (bySeverity !== 0) return bySeverity;
      const am = a.change!.rangeFraction ?? Math.abs(a.change!.pctChange ?? 0);
      const bm = b.change!.rangeFraction ?? Math.abs(b.change!.pctChange ?? 0);
      return bm - am;
    });

  // No earlier reading to compare against: this is the user's first data point.
  if (comparable.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> {title ?? t("insights.title")}
          </CardTitle>
          <CardDescription>{t("insights.baseline")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const shown = limit != null ? notable.slice(0, limit) : notable;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" /> {title ?? t("insights.title")}
        </CardTitle>
        <CardDescription>{description ?? t("insights.sinceLast")}</CardDescription>
      </CardHeader>
      <CardContent>
        {shown.length === 0 ? (
          <p className="flex items-center gap-2 py-2 text-sm text-success">
            <TrendingUp className="size-4" /> {t("insights.allStable")}
          </p>
        ) : (
          <ul className="divide-y">
            {shown.map(({ result, previous, change }) => {
              const reason = primaryReason(change!.reasons);
              const unit = result.unitNormalized ?? result.unit;
              const curValue = result.valueNormalized ?? result.value;
              return (
                <li key={result.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/biomarkers/${result.biomarkerId}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {result.biomarker.canonicalName}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      <span className="tabular-nums">
                        {formatValue(previous!.value)} → {formatValue(curValue)} {unit}
                      </span>
                      {previous!.date && (
                        <span className="ml-1.5">
                          · {t("insights.since", { date: formatDate(previous!.date) })}
                        </span>
                      )}
                    </p>
                  </div>
                  {reason && (
                    <Badge variant={severityVariant(change!.severity)}>
                      {t(`insights.reason.${reason}`)}
                    </Badge>
                  )}
                  <DeltaBadge change={change!} unit={unit} className="w-16 justify-end" />
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
