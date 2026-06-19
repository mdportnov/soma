import { Link, useNavigate } from "react-router-dom";
import { Plus, Sparkles, TestTubes } from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import { listPanels } from "@/db/repos";
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
  const { data: panels, loading } = useQuery(() => listPanels(profileId), [profileId]);

  if (loading || !panels) return <Loading />;

  return (
    <>
      <PageHeader
        title={t("labs.title")}
        description={t("labs.description")}
        actions={
          <>
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
                <TableHead>{t("labs.tableColumns.results")}</TableHead>
                <TableHead>{t("labs.tableColumns.outOfRange")}</TableHead>
                <TableHead>{t("labs.tableColumns.source")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {panels.map((p) => (
                <TableRow
                  key={p.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/labs/${p.id}`)}
                >
                  <TableCell className="font-medium">{formatDate(p.date)}</TableCell>
                  <TableCell>{p.labName ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {[p.city, p.country].filter(Boolean).join(", ") || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{t(`types.${p.panelType}`)}</Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">{p.resultCount}</TableCell>
                  <TableCell>
                    {p.outOfRangeCount > 0 ? (
                      <Badge variant="warning">{p.outOfRangeCount}</Badge>
                    ) : (
                      <Badge variant="success">0</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {p.importMethod === "ai" ? (
                      <Badge>
                        <Sparkles className="size-3" /> {t("labs.importSource.ai")}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">{t("labs.importSource.manual")}</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
