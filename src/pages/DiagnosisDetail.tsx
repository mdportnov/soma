import { Link, useParams } from "react-router-dom";
import { ArrowLeft, FlaskConical, Pill, Stethoscope } from "lucide-react";
import { useQuery } from "@/hooks/useQuery";
import { getDiagnosis, getDiagnosisRelations } from "@/db/repos";
import { RelatedLinks, type RelatedItem } from "@/components/app/RelatedLinks";
import { PageHeader } from "@/components/app/PageHeader";
import { Loading } from "@/components/app/Loading";
import { EmptyState } from "@/components/app/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export function DiagnosisDetail() {
  const { id } = useParams();
  const diagnosisId = Number(id);
  const { t } = useI18n();

  const { data, loading } = useQuery(async () => {
    const diagnosis = await getDiagnosis(diagnosisId);
    if (!diagnosis) return { diagnosis: null, relations: null };
    const relations = await getDiagnosisRelations(diagnosis);
    return { diagnosis, relations };
  }, [diagnosisId]);

  if (loading || !data) return <Loading />;
  if (!data.diagnosis)
    return <EmptyState icon={FlaskConical} title={t("diagnosisDetail.notFound")} />;
  const { diagnosis, relations } = data;

  const relatedItems: RelatedItem[] = [];
  if (relations?.visit) {
    const v = relations.visit;
    relatedItems.push({
      id: `visit-${v.id}`,
      icon: Stethoscope,
      label: t("related.fromVisit"),
      sublabel: [v.doctorName || v.specialty, formatDate(v.date)].filter(Boolean).join(" · "),
      to: `/visits/${v.id}`,
    });
  }
  for (const m of relations?.medications ?? []) {
    relatedItems.push({
      id: `med-${m.id}`,
      icon: Pill,
      label: m.name,
      sublabel: t("related.treatedBy"),
      to: `/medications/${m.id}`,
    });
  }

  return (
    <>
      <Link
        to="/diagnoses"
        className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> {t("nav.diagnoses")}
      </Link>
      <PageHeader
        title={diagnosis.name}
        description={diagnosis.icdCode ? `ICD ${diagnosis.icdCode}` : undefined}
        actions={
          <Badge
            variant={
              diagnosis.status === "active"
                ? "warning"
                : diagnosis.status === "resolved"
                  ? "success"
                  : "secondary"
            }
          >
            {t(`status.${diagnosis.status}`)}
          </Badge>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>{t("diagnosisDetail.detailsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <DetailRow label={t("diagnoses.fields.diagnosis")} value={formatDate(diagnosis.date)} />
            {diagnosis.icdCode && (
              <DetailRow label={t("diagnoses.fields.icd")} value={diagnosis.icdCode} />
            )}
            <DetailRow
              label={t("diagnoses.fields.status")}
              value={t(`status.${diagnosis.status}`)}
            />
            {diagnosis.resolvedDate && (
              <DetailRow
                label={t("diagnoses.fields.resolvedDate")}
                value={formatDate(diagnosis.resolvedDate)}
              />
            )}
          </dl>
          {diagnosis.notes && (
            <div className="mt-4 border-t pt-3">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("fields.notes")}
              </p>
              <p className="whitespace-pre-wrap text-sm selectable">{diagnosis.notes}</p>
            </div>
          )}
          <RelatedLinks title={t("related.title")} items={relatedItems} />
        </CardContent>
      </Card>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm selectable">{value}</dd>
    </div>
  );
}
