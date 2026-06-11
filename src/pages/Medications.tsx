import * as React from "react";
import { CircleStop, Pencil, Pill, Plus, Trash2 } from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import { createMedication, deleteMedication, listMedications, updateMedication } from "@/db/repos";
import type { Medication } from "@/db/schema";
import { PageHeader } from "@/components/app/PageHeader";
import { Loading } from "@/components/app/Loading";
import { EmptyState } from "@/components/app/EmptyState";
import { Field } from "@/components/app/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatValue, todayISO } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export function Medications() {
  const { profileId } = useApp();
  const { t } = useI18n();
  const { data: meds, loading, reload } = useQuery(() => listMedications(profileId), [profileId]);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Medication | null>(null);

  if (loading || !meds) return <Loading />;

  const active = meds.filter((m) => !m.endDate);
  const past = meds.filter((m) => m.endDate);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  return (
    <>
      <PageHeader
        title={t("medications.title")}
        description={t("medications.description")}
        actions={
          <Button onClick={openNew}>
            <Plus /> {t("common.add")}
          </Button>
        }
      />

      {meds.length === 0 ? (
        <EmptyState
          icon={Pill}
          title={t("medications.emptyTitle")}
          description={t("medications.emptyDescription")}
          action={
            <Button size="sm" onClick={openNew}>
              {t("medications.addFirst")}
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {[
            { label: t("medications.currentlyTaking"), items: active },
            { label: t("medications.past"), items: past },
          ]
            .filter((s) => s.items.length)
            .map((section) => (
              <section key={section.label}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {section.label}
                </h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  {section.items.map((m) => (
                    <Card key={m.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{m.name}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {[
                                m.doseAmount != null
                                  ? `${formatValue(m.doseAmount)} ${m.doseUnit ?? ""}`.trim()
                                  : null,
                                m.schedule?.frequency?.replaceAll("_", " "),
                                m.schedule?.notes,
                              ]
                                .filter(Boolean)
                                .join(" · ") || "no dose set"}
                            </p>
                          </div>
                          <Badge variant={m.type === "drug" ? "default" : "success"}>
                            {t(`types.${m.type}`)}
                          </Badge>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {formatDate(m.startDate)} → {m.endDate ? formatDate(m.endDate) : "now"}
                          {m.purpose && <span> · {m.purpose}</span>}
                        </p>
                        <div className="mt-3 flex gap-1.5 border-t pt-3">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditing(m);
                              setFormOpen(true);
                            }}
                          >
                            <Pencil /> {t("common.edit")}
                          </Button>
                          {!m.endDate && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                await updateMedication(m.id, { endDate: todayISO() });
                                void reload();
                              }}
                            >
                              <CircleStop /> {t("medications.actions.stopToday")}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="ml-auto text-destructive"
                            onClick={async () => {
                              await deleteMedication(m.id);
                              void reload();
                            }}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            ))}
        </div>
      )}

      <MedicationForm
        open={formOpen}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          void reload();
        }}
        profileId={profileId}
      />
    </>
  );
}

function MedicationForm({
  open,
  editing,
  onClose,
  onSaved,
  profileId,
}: {
  open: boolean;
  editing: Medication | null;
  onClose: () => void;
  onSaved: () => void;
  profileId: number;
}) {
  const { t } = useI18n();
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<"drug" | "supplement">("supplement");
  const [doseAmount, setDoseAmount] = React.useState("");
  const [doseUnit, setDoseUnit] = React.useState("mg");
  const [frequency, setFrequency] = React.useState("daily");
  const [scheduleNotes, setScheduleNotes] = React.useState("");
  const [startDate, setStartDate] = React.useState(todayISO());
  const [endDate, setEndDate] = React.useState("");
  const [purpose, setPurpose] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setType(editing?.type ?? "supplement");
    setDoseAmount(editing?.doseAmount != null ? String(editing.doseAmount) : "");
    setDoseUnit(editing?.doseUnit ?? "mg");
    setFrequency(editing?.schedule?.frequency ?? "daily");
    setScheduleNotes(editing?.schedule?.notes ?? "");
    setStartDate(editing?.startDate ?? todayISO());
    setEndDate(editing?.endDate ?? "");
    setPurpose(editing?.purpose ?? "");
  }, [open, editing]);

  const save = async () => {
    if (!name.trim() || !startDate) return;
    setSaving(true);
    try {
      const data = {
        profileId,
        name: name.trim(),
        type,
        doseAmount: doseAmount ? Number(doseAmount) : null,
        doseUnit: doseUnit.trim() || null,
        schedule: { frequency, ...(scheduleNotes.trim() ? { notes: scheduleNotes.trim() } : {}) },
        startDate,
        endDate: endDate || null,
        purpose: purpose.trim() || null,
      };
      if (editing) await updateMedication(editing.id, data);
      else await createMedication(data);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? t("medications.addDialog.titleEdit") : t("medications.addDialog.titleAdd")}
      onSubmit={save}
      submitDisabled={saving || !name.trim() || !startDate}
    >
      <div className="grid gap-3">
        <div className="grid grid-cols-[1fr_9rem] gap-3">
          <Field label={t("fields.name")}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Magnesium glycinate"
            />
          </Field>
          <Field label={t("fields.type")}>
            <Select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              <option value="supplement">{t("types.supplement")}</option>
              <option value="drug">{t("types.drug")}</option>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label={t("medications.fields.dose")}>
            <Input
              type="number"
              step="any"
              value={doseAmount}
              onChange={(e) => setDoseAmount(e.target.value)}
            />
          </Field>
          <Field label={t("fields.unit")}>
            <Combobox
              value={doseUnit || null}
              onChange={setDoseUnit}
              options={[
                "mg",
                "µg",
                "g",
                "mg/mL",
                "IU",
                "mL",
                "%",
                t("medications.doseUnits.drops"),
                t("medications.doseUnits.tablets"),
                t("medications.doseUnits.capsules"),
                t("medications.doseUnits.sprays"),
              ].map((u) => ({ value: u, label: u }))}
              placeholder="mg / IU / g"
              allowCustom
            />
          </Field>
          <Field label={t("medications.fields.frequency")}>
            <Select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
              <option value="daily">{t("frequency.daily")}</option>
              <option value="2x_daily">{t("frequency.twiceDaily")}</option>
              <option value="3x_daily">{t("frequency.thriceDaily")}</option>
              <option value="weekly">{t("frequency.weekly")}</option>
              <option value="as_needed">{t("frequency.asNeeded")}</option>
              <option value="custom">{t("frequency.custom")}</option>
            </Select>
          </Field>
        </div>
        <Field label={t("medications.fields.scheduleNotesOptional")}>
          <Input
            value={scheduleNotes}
            onChange={(e) => setScheduleNotes(e.target.value)}
            placeholder="with food, before sleep, 5 on / 2 off…"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("medications.fields.startDate")}>
            <DateInput value={startDate} onChange={setStartDate} />
          </Field>
          <Field label={t("medications.fields.endDateOptional")}>
            <DateInput value={endDate} onChange={setEndDate} clearable />
          </Field>
        </div>
        <Field label={t("medications.fields.purposeOptional")}>
          <Input
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="sleep quality, ferritin…"
          />
        </Field>
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={save} disabled={saving || !name.trim() || !startDate}>
            {editing ? t("common.saveChanges") : t("common.add")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
