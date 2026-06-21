import * as React from "react";
import { useParams } from "react-router-dom";
import { AlertTriangle, Check, Flame, FlaskConical, Pill, Stethoscope, Trash2 } from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import {
  deleteMedicationLogEntry,
  getMedication,
  getMedicationRelations,
  listAllergies,
  listMedicationLog,
  logMedicationIntake,
} from "@/db/repos";
import type { Allergy, MedicationLog } from "@/db/schema";
import { matchDrugAllergies } from "@/lib/drug-allergy";
import { adherenceStats } from "@/lib/adherence";
import { RelatedLinks, type RelatedItem } from "@/components/app/RelatedLinks";
import { PageHeader } from "@/components/app/PageHeader";
import { crumbs } from "@/app/nav";
import { Loading } from "@/components/app/Loading";
import { EmptyState } from "@/components/app/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatValue } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export function MedicationDetail() {
  const { id } = useParams();
  const medicationId = Number(id);
  const { profileId } = useApp();
  const { t } = useI18n();

  const { data, loading, reload } = useQuery(async () => {
    const medication = await getMedication(medicationId);
    if (!medication) return { medication: null, relations: null, allergies: [], logs: [] };
    const [relations, allergies, logs] = await Promise.all([
      getMedicationRelations(medication),
      listAllergies(profileId),
      listMedicationLog(medicationId),
    ]);
    return { medication, relations, allergies, logs };
  }, [profileId, medicationId]);

  if (loading || !data) return <Loading />;
  if (!data.medication) return <EmptyState icon={Pill} title={t("medicationDetail.notFound")} />;
  const { medication, relations, allergies, logs } = data;

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

      <AdherenceCard
        medicationId={medication.id}
        active={medication.endDate == null}
        logs={logs}
        onChange={reload}
      />
    </>
  );
}

/**
 * Adherence log: a per-day "taken / skipped" record for a medication, with a
 * trailing-window adherence percentage and a current streak. One entry per day —
 * the action disables once today is logged.
 */
function AdherenceCard({
  medicationId,
  active,
  logs,
  onChange,
}: {
  medicationId: number;
  active: boolean;
  logs: MedicationLog[];
  onChange: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = React.useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const loggedToday = logs.some((l) => l.takenAt.slice(0, 10) === today);
  const stats = adherenceStats(logs.map((l) => ({ takenAt: l.takenAt, taken: l.taken })));

  const act = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await onChange();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>{t("adherence.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {logs.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">
              {t("adherence.windowSummary", {
                pct: String(stats.adherencePct),
                days: String(stats.windowDays),
              })}
            </Badge>
            {stats.streak > 0 && (
              <Badge variant="success" className="gap-1">
                <Flame className="size-3" />
                {t("adherence.streak", { count: String(stats.streak) })}
              </Badge>
            )}
          </div>
        )}

        {active &&
          (loggedToday ? (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Check className="size-4 text-success" />
              {t("adherence.loggedToday")}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={busy}
                onClick={() => act(() => logMedicationIntake(medicationId, true))}
              >
                <Check /> {t("adherence.markTaken")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => act(() => logMedicationIntake(medicationId, false))}
              >
                {t("adherence.markSkipped")}
              </Button>
            </div>
          ))}

        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("adherence.noLogs")}</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {logs.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <span
                    className={`inline-block size-2 rounded-full ${l.taken ? "bg-success" : "bg-muted-foreground/40"}`}
                  />
                  <span className="selectable tabular-nums">{formatDate(l.takenAt)}</span>
                  <span className="text-muted-foreground">
                    {l.taken ? t("adherence.taken") : t("adherence.skipped")}
                  </span>
                </span>
                <Button
                  size="iconSm"
                  variant="ghost"
                  disabled={busy}
                  title={t("adherence.delete")}
                  aria-label={t("adherence.delete")}
                  onClick={() => act(() => deleteMedicationLogEntry(l.id))}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
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
