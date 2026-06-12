import { Link, useNavigate } from "react-router-dom";
import { Pencil, Plus, ScanLine } from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import { listImagingRecords, listVisits } from "@/db/repos";
import { PageHeader } from "@/components/app/PageHeader";
import { Loading } from "@/components/app/Loading";
import { EmptyState } from "@/components/app/EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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

export function Imaging() {
  const { profileId } = useApp();
  const { t } = useI18n();
  const navigate = useNavigate();
  const { data, loading } = useQuery(async () => {
    const [records, visits] = await Promise.all([
      listImagingRecords(profileId),
      listVisits(profileId),
    ]);
    return { records, visits };
  }, [profileId]);

  if (loading || !data) return <Loading />;

  const { records, visits } = data;
  const visitById = new Map(visits.map((v) => [v.id, v]));

  return (
    <>
      <PageHeader
        title={t("imaging.title")}
        description={t("imaging.description")}
        actions={
          <Button onClick={() => navigate("/imaging/new")}>
            <Plus /> {t("imaging.newRecord")}
          </Button>
        }
      />

      {records.length === 0 ? (
        <EmptyState
          icon={ScanLine}
          title={t("imaging.emptyTitle")}
          description={t("imaging.emptyDescription")}
          action={
            <Button size="sm" onClick={() => navigate("/imaging/new")}>
              {t("imaging.addFirst")}
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("imaging.table.date")}</TableHead>
                  <TableHead>{t("imaging.table.modality")}</TableHead>
                  <TableHead>{t("imaging.table.bodyArea")}</TableHead>
                  <TableHead>{t("imaging.table.facility")}</TableHead>
                  <TableHead>{t("imaging.table.visit")}</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((r) => {
                  const visit = r.visitId != null ? visitById.get(r.visitId) : undefined;
                  return (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/imaging/${r.id}`)}
                    >
                      <TableCell>{formatDate(r.date)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{t(`imagingModality.${r.modalityType}`)}</Badge>
                      </TableCell>
                      <TableCell>{r.bodyArea}</TableCell>
                      <TableCell className="text-muted-foreground">{r.clinic ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {visit ? (
                          <Link
                            to={`/visits/${visit.id}`}
                            className="text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {formatDate(visit.date)}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="iconSm"
                          aria-label={t("common.edit")}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/imaging/${r.id}`);
                          }}
                        >
                          <Pencil />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
