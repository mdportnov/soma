import * as React from "react";
import { CircleStop, Pencil, Pill, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import { createMedication, deleteMedication, listMedications, updateMedication } from "@/db/repos";
import type { Medication } from "@/db/schema";
import { useToast } from "@/components/app/Toast";
import { PageHeader } from "@/components/app/PageHeader";
import { Loading } from "@/components/app/Loading";
import { EmptyState } from "@/components/app/EmptyState";
import { Field } from "@/components/app/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { SelectMenu } from "@/components/ui/select-menu";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { DurationTimeline, type DurationItem } from "@/components/charts/DurationTimeline";
import { formatDate, formatValue, todayISO } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

/** Bar fill per medication type — distinct, both legible under white text. */
const MED_TYPE_COLOR: Record<Medication["type"], string> = {
  drug: "#0ea5e9",
  supplement: "#0d9488",
};

export function Medications() {
  const { profileId } = useApp();
  const { t } = useI18n();
  const toast = useToast();
  const { data: meds, loading, reload } = useQuery(() => listMedications(profileId), [profileId]);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Medication | null>(null);

  if (loading || !meds) return <Loading />;

  const active = meds.filter((m) => !m.endDate);
  const past = meds.filter((m) => m.endDate);

  const timelineItems: DurationItem[] = meds.map((m) => {
    const dose = [
      m.doseAmount != null ? `${formatValue(m.doseAmount)} ${m.doseUnit ?? ""}`.trim() : null,
      m.schedule?.frequency?.replaceAll("_", " "),
      m.schedule?.notes,
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      id: m.id,
      label: m.name,
      start: m.startDate,
      end: m.endDate,
      color: MED_TYPE_COLOR[m.type],
      tooltip: (
        <>
          <span className="font-medium">{m.name}</span>
          <div className="text-muted-foreground">{dose || t(`types.${m.type}`)}</div>
          <div className="text-muted-foreground">
            {formatDate(m.startDate)} → {m.endDate ? formatDate(m.endDate) : t("timeline.now")}
          </div>
          {m.purpose && <div className="text-muted-foreground">{m.purpose}</div>}
        </>
      ),
    };
  });

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
          <DurationTimeline
            title={t("medications.timeline.title")}
            storageKey="soma.timeline.medications"
            items={timelineItems}
            legend={[
              { color: MED_TYPE_COLOR.drug, label: t("types.drug") },
              { color: MED_TYPE_COLOR.supplement, label: t("types.supplement") },
            ]}
            onSelect={(id) => {
              const m = meds.find((x) => x.id === id);
              if (m) {
                setEditing(m);
                setFormOpen(true);
              }
            }}
          />
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
                          {formatDate(m.startDate)} →{" "}
                          {m.endDate ? formatDate(m.endDate) : t("timeline.now")}
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
                          {!m.endDate ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                // Stop is reversible: an Undo (and the permanent
                                // Resume below) restores the open-ended period —
                                // resuming the same day leaves no gap recorded.
                                await updateMedication(m.id, { endDate: todayISO() });
                                void reload();
                                toast.showAction(
                                  t("toasts.medStopped", { name: m.name }),
                                  t("common.resume"),
                                  async () => {
                                    await updateMedication(m.id, { endDate: null });
                                    void reload();
                                  },
                                );
                              }}
                            >
                              <CircleStop /> {t("medications.actions.stopToday")}
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                await updateMedication(m.id, { endDate: null });
                                void reload();
                                toast.show(t("toasts.medResumed", { name: m.name }));
                              }}
                            >
                              <RotateCcw /> {t("medications.actions.resume")}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="ml-auto text-destructive"
                            onClick={async () => {
                              const { id: _id, ...data } = m;
                              await deleteMedication(m.id);
                              void reload();
                              toast.showAction(
                                t("toasts.deleted", { name: m.name }),
                                t("common.undo"),
                                async () => {
                                  await createMedication(data);
                                  void reload();
                                },
                              );
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
        onSaved={(name, wasEdit) => {
          setFormOpen(false);
          void reload();
          toast.show(t(wasEdit ? "toasts.updated" : "toasts.added", { name }));
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
  onSaved: (name: string, wasEdit: boolean) => void;
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

  // ISO yyyy-mm-dd strings compare lexicographically, so a plain < is correct.
  const endBeforeStart = !!endDate && !!startDate && endDate < startDate;
  const canSave = !!name.trim() && !!startDate && !endBeforeStart;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const data = {
        profileId,
        name: name.trim(),
        type,
        doseAmount: doseAmount ? Number(doseAmount) : null,
        doseUnit: doseUnit.trim() || null,
        schedule: { frequency, ...(scheduleNotes.trim() ? { notes: scheduleNotes.trim() } : {}) },
        asNeeded: frequency === "as_needed",
        startDate,
        endDate: endDate || null,
        purpose: purpose.trim() || null,
      };
      if (editing) await updateMedication(editing.id, data);
      else await createMedication(data);
      onSaved(data.name, !!editing);
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
      submitDisabled={saving || !canSave}
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
            <SelectMenu
              value={type}
              onChange={(v) => setType(v as typeof type)}
              options={[
                { value: "supplement", label: t("types.supplement") },
                { value: "drug", label: t("types.drug") },
              ]}
            />
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
            <SelectMenu
              value={frequency}
              onChange={setFrequency}
              options={[
                { value: "daily", label: t("frequency.daily") },
                { value: "2x_daily", label: t("frequency.twiceDaily") },
                { value: "3x_daily", label: t("frequency.thriceDaily") },
                { value: "weekly", label: t("frequency.weekly") },
                { value: "as_needed", label: t("frequency.asNeeded") },
                { value: "custom", label: t("frequency.custom") },
              ]}
            />
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
        {endBeforeStart && (
          <p className="text-[11px] text-amber-600 dark:text-amber-500">
            {t("common.validation.endBeforeStart")}
          </p>
        )}
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
          <Button onClick={save} disabled={saving || !canSave}>
            {editing ? t("common.saveChanges") : t("common.add")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
