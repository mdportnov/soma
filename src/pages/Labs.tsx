import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeftRight, Paperclip, Plus, Sparkles, TestTubes } from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import { getAllFindings, listPanels } from "@/db/repos";
import { seedState, type LabPanelSeed } from "@/app/seed";
import { PageHeader } from "@/components/app/PageHeader";
import { Loading } from "@/components/app/Loading";
import { EmptyState } from "@/components/app/EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export function Labs() {
  const { profileId } = useApp();
  const navigate = useNavigate();
  const { t } = useI18n();
  const { data, loading } = useQuery(async () => {
    const [panels, findings] = await Promise.all([
      listPanels(profileId),
      getAllFindings(profileId),
    ]);
    return { panels, findings };
  }, [profileId]);

  // Aggregated cross-panel view: group findings by their (English) name so
  // e.g. every "Anti-HCV" reading lines up together, newest first within a
  // group (the query already returns rows date-desc).
  const findingGroups = React.useMemo(() => {
    if (!data) return [];
    const byName = new Map<string, typeof data.findings>();
    for (const f of data.findings) {
      const key = (f.nameEn ?? f.rawLabel).toLowerCase();
      (byName.get(key) ?? byName.set(key, []).get(key)!).push(f);
    }
    return [...byName.values()]
      .map((items) => ({ name: items[0].nameEn ?? items[0].rawLabel, items }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  if (loading || !data) return <Loading />;
  const { panels, findings } = data;

  return (
    <>
      <PageHeader
        title={t("labs.title")}
        description={t("labs.description")}
        actions={
          <>
            {panels.length >= 2 && (
              <Link to="/labs/compare">
                <Button variant="outline">
                  <ArrowLeftRight /> {t("labCompare.button")}
                </Button>
              </Link>
            )}
            <Link to="/labs/import">
              <Button variant="outline">
                <Sparkles /> {t("labs.aiImport")}
              </Button>
            </Link>
            <Link to="/labs/new">
              <Button>
                <Plus /> {t("labs.newPanel")}
              </Button>
            </Link>
          </>
        }
      />

      {panels.length === 0 ? (
        <EmptyState
          icon={TestTubes}
          title={t("labs.emptyTitle")}
          description={t("labs.emptyDescription")}
          action={
            <Link to="/labs/new">
              <Button size="sm">{t("labs.addFirstPanel")}</Button>
            </Link>
          }
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("labs.tableColumns.date")}</TableHead>
                <TableHead>{t("labs.tableColumns.lab")}</TableHead>
                <TableHead>{t("labs.tableColumns.location")}</TableHead>
                <TableHead>{t("labs.tableColumns.type")}</TableHead>
                <TableHead numeric>{t("labs.tableColumns.results")}</TableHead>
                <TableHead>{t("labs.tableColumns.outOfRange")}</TableHead>
                <TableHead>{t("labs.tableColumns.source")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {panels.map((p) => (
                <TableRow
                  key={p.id}
                  className="cursor-pointer"
                  // The row's panel and counts ride along so the detail header
                  // is on screen before the panel's results are queried.
                  onClick={() =>
                    navigate(`/labs/${p.id}`, {
                      state: seedState<LabPanelSeed>({
                        kind: "labPanel",
                        panel: p,
                        resultCount: p.resultCount,
                        outOfRangeCount: p.outOfRangeCount,
                      }),
                    })
                  }
                >
                  <TableCell className="font-medium">{formatDate(p.date)}</TableCell>
                  <TableCell>{p.labName ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {[p.city, p.country].filter(Boolean).join(", ") || "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(p.sampleTypes ?? []).map((s) => (
                        <Badge key={s} variant="secondary">
                          {t(`types.${s}`)}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell numeric>{p.resultCount}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      {p.resultCount === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : p.outOfRangeCount > 0 ? (
                        <Badge variant="warning">{p.outOfRangeCount}</Badge>
                      ) : (
                        <Badge variant="success">0</Badge>
                      )}
                      {p.needsReviewCount > 0 && (
                        <Badge variant="warning">
                          {t("needsReview.badge", { count: String(p.needsReviewCount) })}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {p.importMethod === "ai" ? (
                        <Badge>
                          <Sparkles className="size-3" /> {t("labs.importSource.ai")}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">{t("labs.importSource.manual")}</Badge>
                      )}
                      {p.sourceFileId != null && (
                        <Paperclip className="size-3 text-muted-foreground" />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {findings.length > 0 && (
        <>
          <h2 className="mb-1 mt-8 text-lg font-semibold">{t("labs.findingsTitle")}</h2>
          <p className="mb-3 text-sm text-muted-foreground">{t("labs.findingsDescription")}</p>
          <div className="rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("labs.tableColumns.finding")}</TableHead>
                  <TableHead numeric>{t("labPanelDetail.tableColumns.value")}</TableHead>
                  <TableHead numeric>{t("labPanelDetail.tableColumns.reference")}</TableHead>
                  <TableHead>{t("labs.tableColumns.date")}</TableHead>
                  <TableHead>{t("labs.tableColumns.lab")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {findingGroups.map((g) => (
                  <React.Fragment key={g.name}>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell colSpan={5} className="py-1.5 font-medium">
                        {g.name}
                        <Badge variant="secondary" className="ml-2">
                          {g.items.length}
                        </Badge>
                      </TableCell>
                    </TableRow>
                    {g.items.map((f) => (
                      <TableRow
                        key={f.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/labs/${f.panelId}`)}
                      >
                        <TableCell className="max-w-56 text-xs text-muted-foreground">
                          <span className="block truncate" title={f.rawLabel}>
                            {f.rawLabel.toLowerCase() !== g.name.toLowerCase() ? f.rawLabel : "—"}
                          </span>
                        </TableCell>
                        <TableCell numeric className="max-w-48">
                          <span
                            className="block truncate"
                            title={`${f.valueText}${f.unit ? ` ${f.unit}` : ""}`}
                          >
                            {f.valueText}
                            {f.unit ? ` ${f.unit}` : ""}
                          </span>
                        </TableCell>
                        <TableCell numeric className="max-w-56 text-muted-foreground">
                          <span className="block truncate" title={f.refRangeText ?? undefined}>
                            {f.refRangeText ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-medium">
                          {formatDate(f.date)}
                        </TableCell>
                        <TableCell className="max-w-48">
                          <span className="block truncate" title={f.labName ?? undefined}>
                            {f.labName ?? "—"}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </>
  );
}
