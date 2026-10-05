import { Link, useNavigate } from "react-router-dom";
import { ArrowLeftRight, Paperclip, Plus, Sparkles, TestTubes } from "lucide-react";
import { AdditionalFindings } from "@/components/app/AdditionalFindings";
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

      {findings.length > 0 && <AdditionalFindings findings={findings} />}
    </>
  );
}
