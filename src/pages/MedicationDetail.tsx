import { useParams } from "react-router-dom";
import { AlertTriangle, FlaskConical, Pill, Stethoscope } from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import { getMedication, getMedicationRelations, listAllergies } from "@/db/repos";
import type { Allergy } from "@/db/schema";
import { matchDrugAllergies } from "@/lib/drug-allergy";
import { RelatedLinks, type RelatedItem } from "@/components/app/RelatedLinks";
import { PageHeader } from "@/components/app/PageHeader";
import { crumbs } from "@/app/nav";
import { Loading } from "@/components/app/Loading";
import { EmptyState } from "@/components/app/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatValue } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export function MedicationDetail() {
  const { id } = useParams();
  const medicationId = Number(id);
  const { profileId } = useApp();
  const { t } = useI18n();

  const { data, loading } = useQuery(async () => {
    const medication = await getMedication(medicationId);
    if (!medication) return { medication: null, relations: null, allergies: [] };
    const [relations, allergies] = await Promise.all([
      getMedicationRelations(medication),
      listAllergies(profileId),
    ]);
    return { medication, relations, allergies };
  }, [profileId, medicationId]);

  if (loading || !data) return <Loading />;
  if (!data.medication) return <EmptyState icon={Pill} title={t("medicationDetail.notFound")} />;
  const { medication, relations, allergies } = data;

  const allergyMatches = matchDrugAllergies(medication.name, allergies);
  const dose =
    medication.doseAmount != null
      ? `${formatValue(medication.doseAmount)} ${medication.doseUnit ?? ""}`.trim()
      : null;
  const frequency = medication.schedule?.frequency?.replaceAll("_", " ");

  const relatedItems: RelatedItem[] = [];
  if (relations?.visit) {
    const v = relations.visit;
    relatedItems.push({
      id: `visit-${v.id}`,
      icon: Stethoscope,
      label: t("related.prescribedAt"),
      sublabel: [v.doctorName || v.specialty, formatDate(v.date)].filter(Boolean).join(" · "),
      to: `/visits/${v.id}`,
    });
  }
  for (const d of relations?.diagnoses ?? []) {
    relatedItems.push({
      id: `dx-${d.id}`,
      icon: FlaskConical,
      label: d.name,
      sublabel: t("related.treats"),
      to: `/diagnoses/${d.id}`,
    });
  }

  return (
    <>
      <PageHeader
        back="/medications"
        breadcrumbs={crumbs(
          { label: t("nav.medications"), to: "/medications" },
          { label: medication.name, selectable: true },
        )}
        title={medication.name}
        description={medication.purpose ?? undefined}
        actions={
          <Badge variant={medication.type === "drug" ? "default" : "success"}>
            {t(`types.${medication.type}`)}
          </Badge>
        }
      />

      {allergyMatches.length > 0 && <AllergyCaution matches={allergyMatches} />}

      <Card>
        <CardHeader>
          <CardTitle>{t("medicationDetail.detailsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <DetailRow label={t("fields.type")} value={t(`types.${medication.type}`)} />
            {dose && <DetailRow label={t("medications.fields.dose")} value={dose} />}
            {frequency && <DetailRow label={t("medications.fields.frequency")} value={frequency} />}
            {medication.schedule?.notes && (
              <DetailRow
                label={t("medications.fields.scheduleNotesOptional")}
                value={medication.schedule.notes}
              />
            )}
            <DetailRow
              label={t("medications.fields.startDate")}
              value={formatDate(medication.startDate)}
            />
            <DetailRow
              label={t("medicationDetail.endDate")}
              value={medication.endDate ? formatDate(medication.endDate) : t("timeline.now")}
            />
            {medication.purpose && (
              <DetailRow
                label={t("medications.fields.purposeOptional")}
                value={medication.purpose}
              />
            )}
          </dl>
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

/**
 * Drug-allergy caution: surfaces (never blocks) any active drug allergy this
 * medication's name hits, so a contraindicated drug is flagged on its own page.
 */
function AllergyCaution({ matches }: { matches: Allergy[] }) {
  const { t } = useI18n();
  const critical = matches.some((a) => a.severity === "severe" || a.severity === "anaphylactic");
  return (
    <div
      role="alert"
      className={`mb-4 flex items-start gap-2 rounded-lg border p-3 text-xs ${
        critical
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-warning/40 bg-warning/10 text-warning"
      }`}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="space-y-0.5">
        {matches.map((a) => (
          <p key={a.id} className="font-medium">
            {t("allergies.drugGuardWarning", {
              allergen: a.allergen,
              severity: t(`allergySeverity.${a.severity}`).toLowerCase(),
            })}
          </p>
        ))}
      </div>
    </div>
  );
}
