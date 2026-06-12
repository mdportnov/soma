import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import {
  createImagingRecord,
  deleteImagingRecord,
  getImagingRecord,
  listVisits,
  updateImagingRecord,
} from "@/db/repos";
import type { ImagingRecord, Visit } from "@/db/schema";
import { PageHeader } from "@/components/app/PageHeader";
import { Loading } from "@/components/app/Loading";
import { Field } from "@/components/app/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { SelectMenu } from "@/components/ui/select-menu";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import type { ComboboxOption } from "@/components/ui/combobox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, todayISO } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const MODALITIES = ["xray", "ct", "mri", "ultrasound", "pet", "other"] as const;
type Modality = (typeof MODALITIES)[number];

export function ImagingNew() {
  const { profileId } = useApp();
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = id != null;
  const recordId = id ? Number(id) : null;

  const { data, loading } = useQuery(async () => {
    const [record, visits] = await Promise.all([
      recordId != null ? getImagingRecord(recordId) : Promise.resolve(null),
      listVisits(profileId),
    ]);
    return { record, visits };
  }, [profileId, recordId]);

  if (loading || !data) return <Loading />;

  return (
    <ImagingForm
      key={recordId ?? "new"}
      profileId={profileId}
      record={data.record}
      visits={data.visits}
      editing={editing}
      onSaved={() => navigate("/imaging")}
      onCancel={() => navigate("/imaging")}
      onDeleted={async () => {
        if (recordId != null) await deleteImagingRecord(recordId);
        navigate("/imaging");
      }}
    />
  );
}

function ImagingForm({
  profileId,
  record,
  visits,
  editing,
  onSaved,
  onCancel,
  onDeleted,
}: {
  profileId: number;
  record: ImagingRecord | null;
  visits: Visit[];
  editing: boolean;
  onSaved: () => void;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const { t } = useI18n();
  const [date, setDate] = React.useState(record?.date ?? todayISO());
  const [modality, setModality] = React.useState<Modality>(
    (record?.modalityType as Modality) ?? "xray",
  );
  const [bodyArea, setBodyArea] = React.useState(record?.bodyArea ?? "");
  const [clinic, setClinic] = React.useState(record?.clinic ?? "");
  const [city, setCity] = React.useState(record?.city ?? "");
  const [country, setCountry] = React.useState(record?.country ?? "");
  const [visitId, setVisitId] = React.useState<number | null>(record?.visitId ?? null);
  const [findings, setFindings] = React.useState(record?.findings ?? "");
  const [radiologist, setRadiologist] = React.useState(record?.radiologistName ?? "");
  const [saving, setSaving] = React.useState(false);

  const visitOptions: ComboboxOption[] = visits.map((v) => ({
    value: String(v.id),
    label: v.doctorName
      ? t("imaging.visitLabel", { date: formatDate(v.date), doctor: v.doctorName })
      : t("imaging.visitLabelNoDoctor", { date: formatDate(v.date) }),
    group: v.date.slice(0, 4),
  }));

  const save = async () => {
    if (!date || !bodyArea.trim()) return;
    setSaving(true);
    try {
      const data = {
        profileId,
        date,
        modalityType: modality,
        bodyArea: bodyArea.trim(),
        findings: findings.trim() || null,
        radiologistName: radiologist.trim() || null,
        clinic: clinic.trim() || null,
        city: city.trim() || null,
        country: country.trim() || null,
        visitId,
      };
      if (record) await updateImagingRecord(record.id, data);
      else await createImagingRecord(data);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Link
        to="/imaging"
        className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> {t("imaging.back")}
      </Link>
      <PageHeader
        title={editing ? t("imaging.editTitle") : t("imaging.newTitle")}
        description={t("imaging.newDescription")}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t("imaging.studyDetailsTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t("imaging.fields.date")}>
            <DateInput value={date} onChange={setDate} />
          </Field>
          <Field label={t("imaging.fields.modality")}>
            <SelectMenu
              value={modality}
              onChange={(v) => setModality(v as Modality)}
              options={MODALITIES.map((m) => ({ value: m, label: t(`imagingModality.${m}`) }))}
            />
          </Field>
          <Field label={t("imaging.fields.bodyArea")}>
            <Input
              value={bodyArea}
              onChange={(e) => setBodyArea(e.target.value)}
              placeholder={t("imaging.bodyAreaPlaceholder")}
            />
          </Field>
          <Field label={t("imaging.fields.facility")}>
            <Input value={clinic} onChange={(e) => setClinic(e.target.value)} />
          </Field>
          <Field label={t("imaging.fields.city")}>
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
          <Field label={t("imaging.fields.country")}>
            <Input value={country} onChange={(e) => setCountry(e.target.value)} />
          </Field>
          <Field label={t("imaging.fields.visit")} className="lg:col-span-3">
            <Combobox
              value={visitId != null ? String(visitId) : null}
              onChange={(v) => setVisitId(v ? Number(v) : null)}
              options={visitOptions}
              placeholder={t("imaging.noVisit")}
            />
          </Field>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>{t("imaging.findingsTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Field label={t("imaging.fields.findings")}>
            <Textarea rows={4} value={findings} onChange={(e) => setFindings(e.target.value)} />
          </Field>
          <Field label={t("imaging.fields.radiologist")}>
            <Input value={radiologist} onChange={(e) => setRadiologist(e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      <div className="mt-5 flex items-center justify-end gap-2">
        {editing && (
          <Button variant="ghost" className="mr-auto text-destructive" onClick={onDeleted}>
            <Trash2 /> {t("imaging.delete")}
          </Button>
        )}
        <Button variant="outline" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button onClick={save} disabled={saving || !date || !bodyArea.trim()}>
          {editing ? t("common.saveChanges") : t("common.add")}
        </Button>
      </div>
    </>
  );
}
