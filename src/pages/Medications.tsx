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
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatValue, todayISO } from "@/lib/utils";

export function Medications() {
  const { profileId } = useApp();
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
        title="Medications & supplements"
        description="What you take, in what dose, and since when — overlayable on any biomarker trend."
        actions={
          <Button onClick={openNew}>
            <Plus /> Add
          </Button>
        }
      />

      {meds.length === 0 ? (
        <EmptyState
          icon={Pill}
          title="Nothing tracked yet"
          description="Add drugs and supplements with doses and periods to correlate them with your labs."
          action={
            <Button size="sm" onClick={openNew}>
              Add first item
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {[
            { label: "Currently taking", items: active },
            { label: "Past", items: past },
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
                            {m.type}
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
                            <Pencil /> Edit
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
                              <CircleStop /> Stop today
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
      title={editing ? "Edit medication" : "Add medication or supplement"}
    >
      <div className="grid gap-3">
        <div className="grid grid-cols-[1fr_9rem] gap-3">
          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Magnesium glycinate"
            />
          </Field>
          <Field label="Type">
            <Select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              <option value="supplement">Supplement</option>
              <option value="drug">Drug</option>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Dose">
            <Input
              type="number"
              step="any"
              value={doseAmount}
              onChange={(e) => setDoseAmount(e.target.value)}
            />
          </Field>
          <Field label="Unit">
            <Input
              value={doseUnit}
              onChange={(e) => setDoseUnit(e.target.value)}
              placeholder="mg / IU / g"
            />
          </Field>
          <Field label="Frequency">
            <Select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
              <option value="daily">Daily</option>
              <option value="2x_daily">2× daily</option>
              <option value="3x_daily">3× daily</option>
              <option value="weekly">Weekly</option>
              <option value="as_needed">As needed</option>
              <option value="custom">Custom</option>
            </Select>
          </Field>
        </div>
        <Field label="Schedule notes (optional)">
          <Input
            value={scheduleNotes}
            onChange={(e) => setScheduleNotes(e.target.value)}
            placeholder="with food, before sleep, 5 on / 2 off…"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="End date (empty = ongoing)">
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Purpose (optional)">
          <Input
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="sleep quality, ferritin…"
          />
        </Field>
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !name.trim() || !startDate}>
            {editing ? "Save changes" : "Add"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
