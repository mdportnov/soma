import * as React from "react";
import { Pencil, Plus, Syringe } from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import { createVaccine, getAttachment, getProfile, listVaccines, updateVaccine } from "@/db/repos";
import type { Attachment, Vaccine } from "@/db/schema";
import { SourceFileButton } from "@/components/app/SourceFile";
import { PageHeader } from "@/components/app/PageHeader";
import { VaccineCalendar } from "@/components/app/VaccineCalendar";
import { VaccineTimeline } from "@/components/charts/VaccineTimeline";
import { Loading } from "@/components/app/Loading";
import { EmptyState } from "@/components/app/EmptyState";
import { Field } from "@/components/app/Field";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { suggestVaccineExpiry } from "@/lib/vaccine-schedule";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, todayISO } from "@/lib/utils";
import { useToast } from "@/components/app/Toast";
import { useI18n } from "@/lib/i18n";

export function Vaccines() {
  const { profileId } = useApp();
  const { t } = useI18n();
  const { data: vaccines, loading, reload } = useQuery(() => listVaccines(profileId), [profileId]);
  const { data: profile } = useQuery(() => getProfile(profileId), [profileId]);
  const { data: attachmentMap } = useQuery(async () => {
    if (!vaccines) return new Map<number, Attachment>();
    const ids = [
      ...new Set(vaccines.map((v) => v.attachmentId).filter((id): id is number => id != null)),
    ];
    const pairs = await Promise.all(ids.map(async (id) => [id, await getAttachment(id)] as const));
    return new Map(pairs.filter((p): p is [number, Attachment] => p[1] != null));
  }, [vaccines]);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Vaccine | null>(null);

  if (loading || !vaccines) return <Loading />;

  const grouped = vaccines.reduce<Map<string, Vaccine[]>>((acc, v) => {
    const list = acc.get(v.vaccineName) ?? [];
    list.push(v);
    acc.set(v.vaccineName, list);
    return acc;
  }, new Map());

  const vaccineNames = Array.from(new Set(vaccines.map((v) => v.vaccineName)));

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const today = todayISO();

  return (
    <>
      <PageHeader
        title={t("vaccines.title")}
        description={t("vaccines.description")}
        actions={
          <Button onClick={openNew}>
            <Plus /> {t("common.add")}
          </Button>
        }
      />

      <div className="space-y-6">
        <VaccineCalendar birthDate={profile?.birthDate ?? null} records={vaccines} />

        {vaccines.length === 0 ? (
          <EmptyState
            icon={Syringe}
            title={t("vaccines.emptyTitle")}
            description={t("vaccines.emptyDescription")}
            action={
              <Button size="sm" onClick={openNew}>
                {t("vaccines.addFirst")}
              </Button>
            }
          />
        ) : (
          <section className="space-y-4">
            <VaccineTimeline
              vaccines={vaccines}
              storageKey="soma.timeline.vaccines"
              onSelect={(v) => {
                setEditing(v);
                setFormOpen(true);
              }}
            />
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("vaccines.recordsTitle")}
            </h2>
            {Array.from(grouped.entries()).map(([name, rows]) => (
              <section key={name}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {name}
                </h2>
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("vaccines.table.date")}</TableHead>
                          <TableHead>{t("vaccines.table.dose")}</TableHead>
                          <TableHead>{t("vaccines.table.manufacturerBatch")}</TableHead>
                          <TableHead>{t("vaccines.table.country")}</TableHead>
                          <TableHead>{t("vaccines.table.administeredBy")}</TableHead>
                          <TableHead>{t("vaccines.table.expires")}</TableHead>
                          <TableHead className="w-10" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((v) => {
                          const isExpired = v.expiresAt != null && v.expiresAt < today;
                          return (
                            <TableRow key={v.id}>
                              <TableCell>{formatDate(v.date)}</TableCell>
                              <TableCell>{v.dose ?? "—"}</TableCell>
                              <TableCell className="text-muted-foreground">
                                {[v.manufacturer, v.batchNumber].filter(Boolean).join(" / ") || "—"}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {v.country ?? "—"}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {v.administeredBy ?? "—"}
                              </TableCell>
                              <TableCell>
                                {v.expiresAt ? (
                                  <span className="flex items-center gap-1.5">
                                    {formatDate(v.expiresAt)}
                                    {isExpired && (
                                      <Badge variant="warning">{t("vaccines.expired")}</Badge>
                                    )}
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  {v.attachmentId != null && attachmentMap?.has(v.attachmentId) && (
                                    <SourceFileButton
                                      size="iconSm"
                                      variant="ghost"
                                      attachment={attachmentMap.get(v.attachmentId) ?? null}
                                    />
                                  )}
                                  <Tooltip content={t("common.edit")}>
                                    <Button
                                      variant="ghost"
                                      size="iconSm"
                                      aria-label={t("common.edit")}
                                      onClick={() => {
                                        setEditing(v);
                                        setFormOpen(true);
                                      }}
                                    >
                                      <Pencil />
                                    </Button>
                                  </Tooltip>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </section>
            ))}
          </section>
        )}
      </div>

      <VaccineForm
        open={formOpen}
        editing={editing}
        profileId={profileId}
        vaccineNames={vaccineNames}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          void reload();
        }}
      />
    </>
  );
}

function VaccineForm({
  open,
  editing,
  profileId,
  vaccineNames,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: Vaccine | null;
  profileId: number;
  vaccineNames: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [vaccineName, setVaccineName] = React.useState("");
  const [date, setDate] = React.useState(todayISO());
  const [dose, setDose] = React.useState("");
  const [manufacturer, setManufacturer] = React.useState("");
  const [batchNumber, setBatchNumber] = React.useState("");
  const [expiresAt, setExpiresAt] = React.useState("");
  const [country, setCountry] = React.useState("");
  const [administeredBy, setAdministeredBy] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setVaccineName(editing?.vaccineName ?? "");
    setDate(editing?.date ?? todayISO());
    setDose(editing?.dose != null ? String(editing.dose) : "");
    setManufacturer(editing?.manufacturer ?? "");
    setBatchNumber(editing?.batchNumber ?? "");
    setExpiresAt(editing?.expiresAt ?? "");
    setCountry(editing?.country ?? "");
    setAdministeredBy(editing?.administeredBy ?? "");
    setNotes(editing?.notes ?? "");
  }, [open, editing]);

  // Validity can't end before the shot was given (ISO strings sort lexically).
  const expiryBeforeDose = !!expiresAt && !!date && expiresAt < date;
  const canSave = !!vaccineName.trim() && !!date && !expiryBeforeDose;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      // Dose is a positive whole number within a series; ignore 0/negative/fractional.
      const doseNum = dose ? Math.trunc(Number(dose)) : NaN;
      const data = {
        profileId,
        vaccineName: vaccineName.trim(),
        date,
        dose: Number.isFinite(doseNum) && doseNum >= 1 ? doseNum : null,
        manufacturer: manufacturer.trim() || null,
        batchNumber: batchNumber.trim() || null,
        expiresAt: expiresAt || null,
        country: country.trim() || null,
        administeredBy: administeredBy.trim() || null,
        notes: notes.trim() || null,
      };
      if (editing) await updateVaccine(editing.id, data);
      else await createVaccine(data);
      onSaved();
      toast.show(t(editing ? "toasts.updated" : "toasts.added", { name: data.vaccineName }));
    } finally {
      setSaving(false);
    }
  };

  const nameOptions = vaccineNames.map((n) => ({ value: n, label: n }));
  const expirySuggestion = suggestVaccineExpiry(vaccineName, manufacturer, date);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? t("vaccines.addDialog.titleEdit") : t("vaccines.addDialog.titleAdd")}
      onSubmit={save}
      submitDisabled={saving || !canSave}
    >
      <div className="grid gap-3">
        <div className="grid grid-cols-[1fr_9rem] gap-3">
          <Field label={t("vaccines.fields.vaccineName")}>
            <Combobox
              value={vaccineName || null}
              onChange={setVaccineName}
              options={nameOptions}
              placeholder="e.g. COVID-19, Influenza"
              allowCustom
            />
          </Field>
          <Field label={t("vaccines.fields.date")}>
            <DateInput value={date} onChange={setDate} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label={t("vaccines.fields.doseNumber")}>
            <Input
              type="number"
              min="1"
              step="1"
              value={dose}
              onChange={(e) => setDose(e.target.value)}
              placeholder="1"
            />
          </Field>
          <Field label={t("vaccines.fields.manufacturer")}>
            <Input
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
              placeholder="e.g. Pfizer"
            />
          </Field>
          <Field label={t("vaccines.fields.batchNumber")}>
            <Input
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
              placeholder="e.g. EK5730"
            />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label={t("vaccines.fields.expiresOptional")}>
            <DateInput value={expiresAt} onChange={setExpiresAt} clearable />
            {expirySuggestion?.lifetime && !expiresAt && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t("vaccines.expiry.lifetime")}
              </p>
            )}
            {expirySuggestion && !expirySuggestion.lifetime && expirySuggestion.expiresAt && (
              <button
                type="button"
                className="mt-1 text-[11px] text-primary hover:underline"
                onClick={() => setExpiresAt(expirySuggestion.expiresAt!)}
              >
                {t("vaccines.expiry.suggest", { date: formatDate(expirySuggestion.expiresAt) })}
              </button>
            )}
          </Field>
          <Field label={t("vaccines.fields.country")}>
            <Input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="e.g. Germany"
            />
          </Field>
          {expiryBeforeDose && (
            <p className="col-span-3 text-[11px] text-amber-600 dark:text-amber-500">
              {t("common.validation.expiryBeforeDose")}
            </p>
          )}
          <Field label={t("vaccines.fields.administeredByOptional")}>
            <Input
              value={administeredBy}
              onChange={(e) => setAdministeredBy(e.target.value)}
              placeholder="e.g. City clinic"
            />
          </Field>
        </div>
        <Field label={t("vaccines.fields.notesOptional")}>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional notes"
          />
        </Field>
      </div>
    </Dialog>
  );
}
