import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { Check, TestTubes } from "lucide-react";
import { useQuery } from "@/hooks/useQuery";
import {
  getPanel,
  getPanelResults,
  getPanelSource,
  markPanelReviewed,
  markResultReviewed,
  type ResultWithBiomarker,
} from "@/db/repos";
import { SourceDocPane } from "@/components/app/SourceFile";
import { PageHeader } from "@/components/app/PageHeader";
import { crumbs } from "@/app/nav";
import { Loading } from "@/components/app/Loading";
import { EmptyState } from "@/components/app/EmptyState";
import { FlagBadge } from "@/components/app/FlagBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatValue } from "@/lib/utils";
import { useToast } from "@/components/app/Toast";
import { useI18n } from "@/lib/i18n";

function ConfidenceBadge({ confidence }: { confidence: ResultWithBiomarker["confidence"] }) {
  if (confidence === "exact" || confidence === "manual") {
    return (
      <Badge variant="success" className="text-[10px]">
        {confidence}
      </Badge>
    );
  }
  if (confidence === "translated" || confidence === "fuzzy") {
    return (
      <Badge variant="warning" className="text-[10px]">
        {confidence}
      </Badge>
    );
  }
  if (confidence === "ai") {
    return <Badge className="text-[10px]">AI</Badge>;
  }
  return null;
}

export function VerifyImport() {
  const { id } = useParams();
  const panelId = Number(id);
  const { t } = useI18n();
  const toast = useToast();
  const [activePage, setActivePage] = React.useState<number | null>(null);
  const [onlyUncertain, setOnlyUncertain] = React.useState(true);

  const { data, loading, reload } = useQuery(async () => {
    const [panel, results, source] = await Promise.all([
      getPanel(panelId),
      getPanelResults(panelId),
      getPanelSource(panelId),
    ]);
    return { panel, results, source };
  }, [panelId]);

  // Open the document on the first unverified value's page.
  React.useEffect(() => {
    if (!data) return;
    const firstPending = data.results.find((r) => r.reviewedAt == null && r.sourcePage != null);
    if (firstPending?.sourcePage != null) setActivePage(firstPending.sourcePage);
  }, [data]);

  if (loading || !data) return <Loading />;
  if (!data.panel) return <EmptyState icon={TestTubes} title={t("labPanelDetail.panelNotFound")} />;

  const { panel, results, source } = data;
  const pending = results.filter((r) => r.reviewedAt == null);
  const shown = onlyUncertain ? pending : results;

  const confirmOne = async (resultId: number) => {
    await markResultReviewed(resultId);
    await reload();
    toast.show(t("needsReview.confirmedToast"));
  };

  const confirmAll = async () => {
    await markPanelReviewed(panelId);
    await reload();
    toast.show(t("needsReview.confirmedToast"));
  };

  const panelLabel = `${formatDate(panel.date)}${panel.labName ? ` — ${panel.labName}` : ""}`;

  return (
    <>
      <PageHeader
        back={`/labs/${panelId}`}
        breadcrumbs={crumbs(
          { label: t("nav.labResults"), to: "/labs" },
          { label: panelLabel, to: `/labs/${panelId}`, selectable: true },
          { label: t("breadcrumb.verify") },
        )}
        title={t("verify.title")}
        description={`${formatDate(panel.date)}${panel.labName ? ` — ${panel.labName}` : ""} · ${t("verify.description")}`}
        actions={
          pending.length > 0 ? (
            <Button size="sm" onClick={confirmAll}>
              <Check /> {t("verify.confirmAll")}
            </Button>
          ) : (
            <Badge variant="success">{t("needsReview.allReviewed")}</Badge>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Left: the original document */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("verify.sourcePane")}
          </p>
          <SourceDocPane attachment={source} page={activePage} className="h-[72vh]" />
        </div>

        {/* Right: extracted values to verify */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("verify.resultsPane")}
            </p>
            <button
              type="button"
              onClick={() => setOnlyUncertain((v) => !v)}
              className="text-xs text-primary hover:underline"
            >
              {onlyUncertain ? t("verify.showAll") : t("verify.onlyUncertain")}
            </button>
          </div>

          {shown.length === 0 ? (
            <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
              {t("verify.empty")}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {shown.map((r) => {
                const reviewed = r.reviewedAt != null;
                return (
                  <div
                    key={r.id}
                    className={
                      "rounded-lg border p-3 " +
                      (reviewed ? "bg-card" : "border-warning/40 bg-warning/5")
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/biomarkers/${r.biomarkerId}`}
                            className="truncate font-medium text-primary hover:underline"
                          >
                            {r.biomarker.canonicalName}
                          </Link>
                          <ConfidenceBadge confidence={r.confidence} />
                          <FlagBadge
                            flag={r.outOfRange ? r.flag : null}
                            evaluated={r.valueNormalized != null}
                          />
                        </div>
                        {r.rawLabel && (
                          <p
                            className="mt-0.5 truncate text-[11px] text-muted-foreground"
                            title={r.rawLabel}
                          >
                            {t("labPanelDetail.tableColumns.sourceLabel")}: {r.rawLabel}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="tabular-nums">
                          {formatValue(r.value)} {r.unit}
                        </p>
                        {r.valueNormalized != null && r.unitNormalized !== r.unit && (
                          <p className="text-[11px] tabular-nums text-muted-foreground">
                            {formatValue(r.valueNormalized)} {r.unitNormalized}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2">
                      {r.sourcePage != null ? (
                        <button
                          type="button"
                          onClick={() => setActivePage(r.sourcePage)}
                          className="text-[11px] text-primary hover:underline"
                        >
                          {t("verify.jumpToPage", { n: String(r.sourcePage) })}
                        </button>
                      ) : (
                        <span />
                      )}
                      {reviewed ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-success">
                          <Check className="size-3" /> {t("needsReview.reviewed")}
                        </span>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => confirmOne(r.id)}>
                          <Check /> {t("verify.confirm")}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
