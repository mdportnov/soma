import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Pencil, Plus, Stethoscope, Trash2 } from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import {
  createPrescription,
  createVisit,
  deleteVisit,
  getLinkedAttachment,
  getVisit,
  listDiagnosesForVisit,
  listMedicationsForVisit,
  listPrescriptionsForVisit,
} from "@/db/repos";
import { SourceFileButton } from "@/components/app/SourceFile";
import { IconAction } from "@/components/app/IconAction";
import { PageHeader } from "@/components/app/PageHeader";
import { crumbs } from "@/app/nav";
import { Loading } from "@/components/app/Loading";
import { EmptyState } from "@/components/app/EmptyState";
import { Field } from "@/components/app/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VisitForm } from "./Visits";
import { DiagnosisForm } from "./Diagnoses";
import { formatDate, formatValue } from "@/lib/utils";
import { useToast } from "@/components/app/Toast";
import { useI18n } from "@/lib/i18n";

export function VisitDetail() {
  const { id } = useParams();
  const visitId = Number(id);
  const { profileId } = useApp();
  const { t } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = React.useState(false);
  const [diagnosisOpen, setDiagnosisOpen] = React.useState(false);
  const [rxOpen, setRxOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const { data, loading, reload } = useQuery(async () => {
    const [visit, diagnoses, prescriptions, medications, source] = await Promise.all([
      getVisit(visitId),
      listDiagnosesForVisit(visitId),
      listPrescriptionsForVisit(visitId),
      listMedicationsForVisit(visitId),
      getLinkedAttachment("visit", visitId),
    ]);
    return { visit, diagnoses, prescriptions, medications, source };
  }, [visitId]);

  if (loading || !data) return <Loading />;
  if (!data.visit) return <EmptyState icon={Stethoscope} title={t("visitDetail.visitNotFound")} />;
  const { visit, diagnoses, prescriptions, medications, source } = data;

  const visitLabel = `${formatDate(visit.date)}${visit.doctorName ? ` — ${visit.doctorName}` : ""}`;

  return (
    <>
      <PageHeader
        back="/visits"
        breadcrumbs={crumbs(
          { label: t("nav.visits"), to: "/visits" },
          { label: visitLabel, selectable: true },
        )}
        title={visitLabel}
        description={[
          visit.specialty,
          visit.clinic,
          [visit.city, visit.country].filter(Boolean).join(", "),
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            <SourceFileButton attachment={source} />
            <IconAction
              label={t("common.edit")}
              icon={<Pencil />}
              onClick={() => setEditOpen(true)}
            />
            <IconAction
              label={t("visitDetail.deleteVisit")}
              icon={<Trash2 />}
              destructive
              onClick={() => setConfirmDelete(true)}
            />
          </>
        }
      />

      {visit.notes && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>{t("fields.notes")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{visit.notes}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t("visitDetail.diagnosesTitle")}</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setDiagnosisOpen(true)}>
              <Plus /> Add
            </Button>
          </CardHeader>
          <CardContent>
            {diagnoses.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                No diagnoses linked to this visit.
              </p>
            ) : (
              <ul className="divide-y">
                {diagnoses.map((d) => (
                  <li key={d.id}>
                    <Link
                      to="/diagnoses"
                      className="-mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-2.5 hover:bg-muted"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{d.name}</p>
                        {d.icdCode && (
                          <p className="text-[11px] text-muted-foreground">ICD {d.icdCode}</p>
                        )}
                      </div>
                      <Badge
                        variant={
                          d.status === "active"
                            ? "warning"
                            : d.status === "resolved"
                              ? "success"
                              : "secondary"
                        }
                        className="shrink-0"
                      >
                        {t(`status.${d.status}`)}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t("visitDetail.prescriptionsTitle")}</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setRxOpen(true)}>
              <Plus /> Add
            </Button>
          </CardHeader>
          <CardContent>
            {prescriptions.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                No prescriptions recorded.
              </p>
            ) : (
              <ul className="divide-y">
                {prescriptions.map((p) => (
                  <li key={p.id} className="py-2.5">
                    {p.drugName && (
                      <p className="text-sm font-medium">
                        {p.drugName}
                        {p.doseAmount != null && ` — ${p.doseAmount} ${p.doseUnit ?? ""}`.trimEnd()}
                        {p.frequency && `, ${p.frequency}`}
                        {p.durationDays != null &&
                          `, ${p.durationDays} ${t("visitDetail.fields.days")}`}
                      </p>
                    )}
                    {p.notes && (
                      <p
                        className={`whitespace-pre-wrap text-sm ${p.drugName ? "mt-0.5 text-xs text-muted-foreground" : ""}`}
                      >
                        {p.notes}
                      </p>
                    )}
                    {!p.drugName && !p.notes && <p className="text-sm">—</p>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("visitDetail.medicationsTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {medications.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                {t("visitDetail.noMedications")}
              </p>
            ) : (
              <ul className="divide-y">
                {medications.map((m) => (
                  <li key={m.id}>
                    <Link
                      to="/medications"
                      className="-mx-2 flex items-center justify-between gap-2 rounded-md px-2 py-2.5 hover:bg-muted"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{m.name}</p>
                        {(m.doseAmount != null || m.purpose) && (
                          <p className="truncate text-[11px] text-muted-foreground">
                            {[
                              m.doseAmount != null
                                ? `${formatValue(m.doseAmount)} ${m.doseUnit ?? ""}`.trim()
                                : null,
                              m.purpose,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                      </div>
                      <Badge
                        variant={m.type === "drug" ? "default" : "success"}
                        className="shrink-0"
                      >
                        {t(`types.${m.type}`)}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <VisitForm
        open={editOpen}
        editing={visit}
        profileId={profileId}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false);
          void reload();
        }}
      />

      <DiagnosisForm
        open={diagnosisOpen}
        editing={null}
        profileId={profileId}
        defaultVisitId={visitId}
        defaultDate={visit.date}
        onClose={() => setDiagnosisOpen(false)}
        onSaved={() => {
          setDiagnosisOpen(false);
          void reload();
        }}
      />

      <PrescriptionDialog
        open={rxOpen}
        visitId={visitId}
        onClose={() => setRxOpen(false)}
        onSaved={() => {
          setRxOpen(false);
          void reload();
        }}
      />

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t("visitDetail.deleteVisitTitle")}
        description={t("visitDetail.deleteVisitDescription")}
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={async () => {
              const { id: _id, ...visitData } = visit;
              const label = visit.doctorName || visit.clinic || visit.specialty || t("nav.visits");
              await deleteVisit(visitId);
              navigate("/visits");
              toast.showAction(t("toasts.deleted", { name: label }), t("common.undo"), async () => {
                await createVisit(visitData);
              });
            }}
          >
            {t("visitDetail.deleteVisit")}
          </Button>
        </div>
      </Dialog>
    </>
  );
}

function PrescriptionDialog({
  open,
  visitId,
  onClose,
  onSaved,
}: {
  open: boolean;
  visitId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [drugName, setDrugName] = React.useState("");
  const [doseAmount, setDoseAmount] = React.useState("");
  const [doseUnit, setDoseUnit] = React.useState("");
  const [frequency, setFrequency] = React.useState("");
  const [durationDays, setDurationDays] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setDrugName("");
    setDoseAmount("");
    setDoseUnit("");
    setFrequency("");
    setDurationDays("");
    setNotes("");
  }, [open]);

  const valid = drugName.trim() !== "" || notes.trim() !== "";

  const addPrescription = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await createPrescription({
        visitId,
        drugName: drugName.trim() || null,
        doseAmount: doseAmount ? Number(doseAmount) : null,
        doseUnit: doseUnit.trim() || null,
        frequency: frequency.trim() || null,
        durationDays: durationDays ? Number(durationDays) : null,
        notes: notes.trim() || null,
      });
      onSaved();
      toast.show(
        t("toasts.added", { name: drugName.trim() || t("visitDetail.fields.prescription") }),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("visitDetail.addPrescription")}
      onSubmit={addPrescription}
      submitDisabled={saving || !valid}
    >
      <div className="grid gap-3">
        <Field label={t("visitDetail.fields.drugName")}>
          <Input
            value={drugName}
            onChange={(e) => setDrugName(e.target.value)}
            placeholder="e.g. Vitamin D3"
          />
        </Field>
        <div className="grid grid-cols-4 gap-3">
          <Field label={t("medications.fields.dose")}>
            <Input
              type="number"
              step="any"
              value={doseAmount}
              onChange={(e) => setDoseAmount(e.target.value)}
            />
          </Field>
          <Field label={t("fields.unit")}>
            <Input
              value={doseUnit}
              onChange={(e) => setDoseUnit(e.target.value)}
              placeholder="IU"
            />
          </Field>
          <Field label={t("medications.fields.frequency")}>
            <Input
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              placeholder="daily"
            />
          </Field>
          <Field label={t("visitDetail.fields.durationDays")}>
            <Input
              type="number"
              value={durationDays}
              onChange={(e) => setDurationDays(e.target.value)}
            />
          </Field>
        </div>
        <Field label={t("visitDetail.fields.prescription")}>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. for 3 months, retest 25-OH after"
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button disabled={saving || !valid} onClick={addPrescription}>
            {t("common.add")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
