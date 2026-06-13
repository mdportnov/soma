import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Sparkles, TestTubes, Trash2 } from "lucide-react";
import { useQuery } from "@/hooks/useQuery";
import { deletePanel, getPanel, getPanelResults } from "@/db/repos";
import { PageHeader } from "@/components/app/PageHeader";
import { Loading } from "@/components/app/Loading";
import { EmptyState } from "@/components/app/EmptyState";
import { FlagBadge } from "@/components/app/FlagBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatValue } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export function LabPanelDetail() {
  const { id } = useParams();
  const panelId = Number(id);
  const navigate = useNavigate();
  const { t } = useI18n();
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const { data, loading } = useQuery(async () => {
    const [panel, results] = await Promise.all([getPanel(panelId), getPanelResults(panelId)]);
    return { panel, results };
  }, [panelId]);

  if (loading || !data) return <Loading />;
  if (!data.panel) return <EmptyState icon={TestTubes} title={t("labPanelDetail.panelNotFound")} />;

  const { panel, results } = data;
  const outOfRange = results.filter((r) => r.outOfRange).length;

  return (
    <>
      <Link
        to="/labs"
        className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> {t("labPanelDetail.backToLabs")}
      </Link>
      <PageHeader
        title={`${formatDate(panel.date)}${panel.labName ? ` — ${panel.labName}` : ""}`}
        description={[
          [panel.city, panel.country].filter(Boolean).join(", "),
          `${results.length} ${t("labs.tableColumns.results").toLowerCase()}`,
          outOfRange ? `${outOfRange} ${t("labPanelDetail.outOfRange")}` : t("labPanelDetail.allInRange"),
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            {panel.importMethod === "ai" && (
              <Badge>
                <Sparkles className="size-3" /> {t("labPanelDetail.aiImported")}
              </Badge>
            )}
            <Badge variant="secondary">{panel.panelType}</Badge>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setConfirmDelete(true)}
              aria-label={t("labPanelDetail.deletePanel")}
            >
              <Trash2 className="text-destructive" />
            </Button>
          </>
        }
      />

      {(panel.collectionTime ||
        panel.fasting != null ||
        panel.menstrualCycleDay != null ||
        panel.notes) && (
        <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {panel.collectionTime && (
            <span>
              {t("labPanelNew.fields.collectionTime")}: {panel.collectionTime}
            </span>
          )}
          {panel.fasting != null && (
            <span>
              {t("labPanelNew.fields.fasting")}:{" "}
              {t(panel.fasting ? "labPanelNew.fasting.yes" : "labPanelNew.fasting.no")}
            </span>
          )}
          {panel.menstrualCycleDay != null && (
            <span>
              {t("labPanelNew.fields.cycleDay")}: {panel.menstrualCycleDay}
            </span>
          )}
          {panel.notes && <span className="basis-full text-foreground/80">{panel.notes}</span>}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("labPanelDetail.tableColumns.biomarker")}</TableHead>
                <TableHead>{t("labPanelDetail.tableColumns.value")}</TableHead>
                <TableHead>{t("labPanelDetail.tableColumns.normalized")}</TableHead>
                <TableHead>{t("labPanelDetail.tableColumns.reference")}</TableHead>
                <TableHead>{t("labPanelDetail.tableColumns.status")}</TableHead>
                <TableHead>{t("labPanelDetail.tableColumns.sourceLabel")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link
                      to={`/biomarkers/${r.biomarkerId}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {r.biomarker.canonicalName}
                    </Link>
                    <p className="text-[11px] text-muted-foreground">{r.biomarker.category}</p>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatValue(r.value)} {r.unit}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {r.valueNormalized != null && r.unitNormalized !== r.unit
                      ? `${formatValue(r.valueNormalized)} ${r.unitNormalized}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.biomarker.refLow != null || r.biomarker.refHigh != null
                      ? `${formatValue(r.biomarker.refLow) ?? ""}–${formatValue(r.biomarker.refHigh) ?? ""} ${r.biomarker.defaultUnit}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <FlagBadge flag={r.outOfRange ? r.flag : null} evaluated={r.valueNormalized != null} />
                  </TableCell>
                  <TableCell
                    className="max-w-44 truncate text-xs text-muted-foreground"
                    title={r.rawLabel ?? undefined}
                  >
                    {r.rawLabel ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t("labPanelDetail.deletePanelTitle")}
        description={t("labPanelDetail.deletePanelDescription")}
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmDelete(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={async () => {
              await deletePanel(panelId);
              navigate("/labs");
            }}
          >
            {t("labPanelDetail.deletePanel")}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
