import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Stethoscope } from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import { createVisit, listVisits, updateVisit } from "@/db/repos";
import type { Visit } from "@/db/schema";
import { PageHeader } from "@/components/app/PageHeader";
import { Loading } from "@/components/app/Loading";
import { EmptyState } from "@/components/app/EmptyState";
import { Field } from "@/components/app/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, todayISO } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export function Visits() {
  const { profileId } = useApp();
  const { t } = useI18n();
  const navigate = useNavigate();
  const { data: visits, loading, reload } = useQuery(() => listVisits(profileId), [profileId]);
  const [formOpen, setFormOpen] = React.useState(false);

  if (loading || !visits) return <Loading />;

  return (
    <>
      <PageHeader
        title={t("visits.title")}
        description={t("visits.description")}
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus /> {t("common.add")}
          </Button>
        }
      />

      {visits.length === 0 ? (
        <EmptyState
          icon={Stethoscope}
          title={t("visits.emptyTitle")}
          description={t("visits.emptyDescription")}
          action={
            <Button size="sm" onClick={() => setFormOpen(true)}>
              {t("visits.addFirst")}
            </Button>
          }
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("fields.date")}</TableHead>
                <TableHead>{t("visits.fields.doctor")}</TableHead>
                <TableHead>{t("visits.fields.specialty")}</TableHead>
                <TableHead>{t("visits.fields.clinic")}</TableHead>
                <TableHead>{t("visits.fields.location")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visits.map((v) => (
                <TableRow
                  key={v.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/visits/${v.id}`)}
                >
                  <TableCell className="font-medium">{formatDate(v.date)}</TableCell>
                  <TableCell>{v.doctorName ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{v.specialty ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{v.clinic ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {[v.city, v.country].filter(Boolean).join(", ") || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <VisitForm
        open={formOpen}
        editing={null}
        profileId={profileId}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          void reload();
        }}
      />
    </>
  );
}

export function VisitForm({
  open,
  editing,
  profileId,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: Visit | null;
  profileId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [date, setDate] = React.useState(todayISO());
  const [doctorName, setDoctorName] = React.useState("");
  const [specialty, setSpecialty] = React.useState("");
  const [clinic, setClinic] = React.useState("");
  const [city, setCity] = React.useState("");
  const [country, setCountry] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setDate(editing?.date ?? todayISO());
    setDoctorName(editing?.doctorName ?? "");
    setSpecialty(editing?.specialty ?? "");
    setClinic(editing?.clinic ?? "");
    setCity(editing?.city ?? "");
    setCountry(editing?.country ?? "");
    setNotes(editing?.notes ?? "");
  }, [open, editing]);

  const save = async () => {
    if (!date) return;
    setSaving(true);
    try {
      const data = {
        profileId,
        date,
        doctorName: doctorName.trim() || null,
        specialty: specialty.trim() || null,
        clinic: clinic.trim() || null,
        city: city.trim() || null,
        country: country.trim() || null,
        notes: notes.trim() || null,
      };
      if (editing) await updateVisit(editing.id, data);
      else await createVisit(data);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? t("visits.addDialog.titleEdit") : t("visits.addDialog.titleAdd")}
      onSubmit={save}
      submitDisabled={saving || !date}
    >
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("fields.date")}>
            <DateInput value={date} onChange={setDate} />
          </Field>
          <Field label={t("visits.fields.specialty")}>
            <Input
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              placeholder="endocrinologist…"
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("visits.fields.doctor")}>
            <Input value={doctorName} onChange={(e) => setDoctorName(e.target.value)} />
          </Field>
          <Field label={t("visits.fields.clinic")}>
            <Input value={clinic} onChange={(e) => setClinic(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("fields.city")}>
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
          <Field label={t("fields.country")}>
            <Input value={country} onChange={(e) => setCountry(e.target.value)} />
          </Field>
        </div>
        <Field label={t("fields.notes")}>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={save} disabled={saving || !date}>
            {editing ? t("common.saveChanges") : t("common.addVisit")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
