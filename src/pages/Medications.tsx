import * as React from "react";
import {
  AlertTriangle,
  CircleStop,
  FlaskConical,
  Pencil,
  Pill,
  Plus,
  RotateCcw,
  Stethoscope,
  Trash2,
} from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import {
  countMedicationLogEntries,
  createMedication,
  deleteMedication,
  getMedicationRelations,
  listAllergies,
  listMedications,
  updateMedication,
  getLinkedAttachment,
  type MedicationRelations,
} from "@/db/repos";
import type { Allergy, Medication } from "@/db/schema";
import { matchDrugAllergies } from "@/lib/drug-allergy";
import { RelatedLinks, type RelatedItem } from "@/components/app/RelatedLinks";
import { useToast } from "@/components/app/Toast";
import { useConfirm } from "@/components/app/Confirm";
import { undoToastCaveat, type UndoCaveat } from "@/lib/undo-scope";
import { PageHeader } from "@/components/app/PageHeader";
import { Loading } from "@/components/app/Loading";
import { EmptyState } from "@/components/app/EmptyState";
import { IconAction } from "@/components/app/IconAction";
import { StatusCard } from "@/components/app/StatusCard";
import { Field } from "@/components/app/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { SelectMenu } from "@/components/ui/select-menu";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogActions } from "@/components/ui/dialog";
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
  const { confirmDelete } = useConfirm();
  const { data: meds, loading, reload } = useQuery(() => listMedications(profileId), [profileId]);
  const { data: allergies } = useQuery(() => listAllergies(profileId), [profileId]);
  const { data: relations } = useQuery(async () => {
    const list = await listMedications(profileId);
    const resolved = await Promise.all(list.map((m) => getMedicationRelations(m)));
    return new Map(list.map((m, i) => [m.id, resolved[i]]));
  }, [profileId]);
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
        <div className="space-y-0.5">
          <div className="font-semibold text-pretty">{m.name}</div>
          <div className="text-muted-foreground">{dose || t(`types.${m.type}`)}</div>
          <div className="text-muted-foreground tabular-nums">
            {formatDate(m.startDate)} → {m.endDate ? formatDate(m.endDate) : t("timeline.now")}
          </div>
          {m.purpose && <div className="text-muted-foreground">{m.purpose}</div>}
        </div>
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
                <div className="grid auto-rows-fr gap-2 sm:grid-cols-2">
                  {section.items.map((m) => {
                    const dose = [
                      m.doseAmount != null
                        ? `${formatValue(m.doseAmount)} ${m.doseUnit ?? ""}`.trim()
                        : null,
                      m.schedule?.frequency?.replaceAll("_", " "),
                      m.schedule?.notes,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <StatusCard
                        key={m.id}
                        to={`/medications/${m.id}`}
                        title={m.name}
                        status={
                          <Badge variant={m.type === "drug" ? "default" : "success"}>
                            {t(`types.${m.type}`)}
                          </Badge>
                        }
                        value={
                          dose ? (
                            <p className="truncate text-sm font-medium selectable">{dose}</p>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              {t("recordCard.noDose")}
                            </p>
                          )
                        }
                        meta={
                          <>
                            {formatDate(m.startDate)} →{" "}
                            {m.endDate ? formatDate(m.endDate) : t("timeline.now")}
                            {m.purpose && <span> · {m.purpose}</span>}
                          </>
                        }
                        muted={!!m.endDate}
                        actions={
                          <>
                            <IconAction
                              label={t("common.edit")}
                              icon={<Pencil />}
                              onClick={() => {
                                setEditing(m);
                                setFormOpen(true);
                              }}
                            />
                            {!m.endDate ? (
                              <IconAction
                                label={t("medications.actions.stopToday")}
                                icon={<CircleStop />}
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
                              />
                            ) : (
                              <IconAction
                                label={t("medications.actions.resume")}
                                icon={<RotateCcw />}
                                onClick={async () => {
                                  await updateMedication(m.id, { endDate: null });
                                  void reload();
                                  toast.show(t("toasts.medResumed", { name: m.name }));
                                }}
                              />
                            )}
                            <IconAction
                              label={t("common.delete")}
                              icon={<Trash2 />}
                              destructive
                              onClick={async () => {
                                const { id: _id, ...data } = m;
                                // The medication_log FK cascades, so the prompt
                                // has to say how much history goes with the drug.
                                // Undo re-creates the medication only: the log
                                // and an imported prescription file stay gone.
                                const [logCount, attached] = await Promise.all([
                                  countMedicationLogEntries(m.id),
                                  getLinkedAttachment("medication", m.id),
                                ]);
                                const caveats: UndoCaveat[] = [
                                  ...(logCount > 0 ? (["log"] as const) : []),
                                  ...(attached ? (["file"] as const) : []),
                                ];
                                const ok = await confirmDelete({
                                  entity: "medication",
                                  name: m.name,
                                  cascade: [{ key: "medicationLog", count: logCount }],
                                  undoable: true,
                                  undoCaveats: caveats,
                                });
                                if (!ok) return;
                                await deleteMedication(m.id);
                                void reload();
                                toast.showUndo(
                                  t("toasts.deleted", { name: m.name }),
                                  async () => {
                                    await createMedication(data);
                                    void reload();
                                  },
                                  { caveat: undoToastCaveat(t, caveats) },
                                );
                              }}
                            />
                          </>
                        }
                      >
                        <MedicationRelated relations={relations?.get(m.id)} />
                      </StatusCard>
                    );
                  })}
                </div>
              </section>
            ))}
        </div>
      )}

      <MedicationForm
        open={formOpen}
        editing={editing}
        allergies={allergies ?? []}
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

function MedicationRelated({ relations }: { relations?: MedicationRelations }) {
  const { t } = useI18n();
  if (!relations) return null;
  const items: RelatedItem[] = [];
  if (relations.visit) {
    const v = relations.visit;
    items.push({
      id: `visit-${v.id}`,
      icon: Stethoscope,
      label: t("related.prescribedAt"),
      sublabel: [v.doctorName || v.specialty, formatDate(v.date)].filter(Boolean).join(" · "),
      to: `/visits/${v.id}`,
    });
  }
  for (const d of relations.diagnoses) {
    items.push({
      id: `dx-${d.id}`,
      icon: FlaskConical,
      label: d.name,
      sublabel: t("related.treats"),
      to: `/diagnoses/${d.id}`,
    });
  }
  return <RelatedLinks title={t("related.title")} items={items} className="mt-0 border-t-0 pt-0" />;
}

function MedicationForm({
  open,
  editing,
  allergies,
  onClose,
  onSaved,
  profileId,
}: {
  open: boolean;
  editing: Medication | null;
  allergies: Allergy[];
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

  // Drug-allergy guard: surface (never block) any active drug allergy the typed
  // name hits, so a contraindicated drug can't be added unknowingly.
  const allergyMatches = React.useMemo(
    () => matchDrugAllergies(name, allergies),
    [name, allergies],
  );

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
      guardUnsaved
    >
      <div className="grid gap-3">
        <div className="grid grid-cols-[1fr_9rem] gap-3">
          <Field label={t("fields.name")}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("placeholders.medicationName")}
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
        {allergyMatches.length > 0 && <AllergyWarning matches={allergyMatches} />}
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
              placeholder={t("placeholders.medicationDoseUnit")}
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
            placeholder={t("placeholders.schedule")}
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
            placeholder={t("placeholders.purpose")}
          />
        </Field>
        <DialogActions
          onClose={onClose}
          onSubmit={save}
          submitLabel={editing ? t("common.saveChanges") : t("common.add")}
          disabled={saving || !canSave}
        />
      </div>
    </Dialog>
  );
}

/**
 * Inline drug-allergy warning. Severe/anaphylactic matches render in the
 * destructive tint, milder ones in the warning tint — but every match is shown,
 * loud and above the fold, so saving a contraindicated drug is a conscious act.
 */
function AllergyWarning({ matches }: { matches: Allergy[] }) {
  const { t } = useI18n();
  const critical = matches.some((a) => a.severity === "severe" || a.severity === "anaphylactic");
  return (
    <div
      role="alert"
      className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${
        critical
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-warning/40 bg-warning/10 text-warning-strong"
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
