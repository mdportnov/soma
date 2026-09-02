import * as React from "react";
import { Link } from "react-router-dom";
import { Pencil, Plus, Sparkles, Syringe, Trash2 } from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import { useHighlight } from "@/hooks/useHighlight";
import {
  createVaccine,
  deleteVaccine,
  getAttachment,
  getProfile,
  listVaccines,
  updateVaccine,
  getLinkedAttachment,
} from "@/db/repos";
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
import { Dialog, DialogActions } from "@/components/ui/dialog";
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
import { useConfirm } from "@/components/app/Confirm";
import { undoToastCaveat, type UndoCaveat } from "@/lib/undo-scope";
import { useI18n } from "@/lib/i18n";

export function Vaccines() {
  const { profileId } = useApp();
  const { t } = useI18n();
  const toast = useToast();
  const { confirmDelete } = useConfirm();
  // ⌘K lands here as /vaccines?highlight=<id> — flash that dose in the table.
  const highlight = useHighlight();
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
  const [presetName, setPresetName] = React.useState<string | null>(null);

  if (loading || !vaccines) return <Loading />;

  const grouped = vaccines.reduce<Map<string, Vaccine[]>>((acc, v) => {
    const list = acc.get(v.vaccineName) ?? [];
    list.push(v);
    acc.set(v.vaccineName, list);
    return acc;
  }, new Map());

  const vaccineNames = Array.from(new Set(vaccines.map((v) => v.vaccineName)));

  const openNew = (name: string | null = null) => {
    setEditing(null);
    setPresetName(name);
    setFormOpen(true);
  };

  const openEdit = (v: Vaccine) => {
    setEditing(v);
    setPresetName(null);
    setFormOpen(true);
  };

  const today = todayISO();

  return (
    <>
      <PageHeader
        title={t("vaccines.title")}
        description={t("vaccines.description")}
        actions={
          <>
            <Link to="/labs/import?type=vaccine">
              <Button variant="outline">
                <Sparkles /> {t("labs.aiImport")}
              </Button>
            </Link>
            <Button onClick={() => openNew()}>
              <Plus /> {t("common.add")}
            </Button>
          </>
        }
      />

      <div className="space-y-6">
        <VaccineCalendar
          birthDate={profile?.birthDate ?? null}
          records={vaccines}
          onAddVaccine={openNew}
          onEditRecord={openEdit}
        />

        {vaccines.length === 0 ? (
          <EmptyState
            icon={Syringe}
            title={t("vaccines.emptyTitle")}
            description={t("vaccines.emptyDescription")}
            action={
              <div className="flex gap-2">
                <Button size="sm" onClick={() => openNew()}>
                  {t("vaccines.addFirst")}
                </Button>
                <Link to="/labs/import?type=vaccine">
                  <Button size="sm" variant="outline">
                    <Sparkles /> {t("labs.aiImport")}
                  </Button>
                </Link>
              </div>
            }
          />
        ) : (
          <section className="space-y-4">
            <VaccineTimeline
              vaccines={vaccines}
              storageKey="soma.timeline.vaccines"
              onSelect={openEdit}
            />
            <h2 className="pt-2 text-sm font-semibold tracking-tight">
              {t("vaccines.recordsTitle")}
            </h2>
            {Array.from(grouped.entries()).map(([name, rows]) => (
              <section key={name}>
                <Card>
                  <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
                    <h3 className="text-sm font-semibold selectable">{name}</h3>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {rows.length}
                    </span>
                  </div>
                  <CardContent className="overflow-hidden rounded-b-xl p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("vaccines.table.date")}</TableHead>
                          <TableHead>{t("vaccines.table.dose")}</TableHead>
                          <TableHead>{t("vaccines.table.manufacturerBatch")}</TableHead>
                          <TableHead>{t("vaccines.table.country")}</TableHead>
                          <TableHead>{t("vaccines.table.administeredBy")}</TableHead>
                          <TableHead>{t("vaccines.table.expires")}</TableHead>
                          <TableHead actions />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((v) => {
                          const isExpired = v.expiresAt != null && v.expiresAt < today;
                          return (
                            <TableRow
                              key={v.id}
                              ref={highlight.id === v.id ? highlight.ref : undefined}
                              className={highlight.className(v.id)}
                            >
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
                              <TableCell actions>
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
                                      onClick={() => openEdit(v)}
                                    >
                                      <Pencil />
                                    </Button>
                                  </Tooltip>
                                  <Tooltip content={t("common.delete")}>
                                    <Button
                                      variant="ghost"
                                      size="iconSm"
                                      aria-label={t("common.delete")}
                                      className="text-destructive"
                                      onClick={async () => {
                                        const { id: _id, ...data } = v;
                                        // An imported certificate is erased with
                                        // its last dose; Undo brings the dose back
                                        // without it, so the snapshot drops the id.
                                        const attached =
                                          v.attachmentId != null ||
                                          (await getLinkedAttachment("vaccine", v.id)) != null;
                                        const caveats: UndoCaveat[] = attached ? ["file"] : [];
                                        const ok = await confirmDelete({
                                          entity: "vaccine",
                                          name: v.vaccineName,
                                          dateLabel: formatDate(v.date),
                                          undoable: true,
                                          undoCaveats: caveats,
                                        });
                                        if (!ok) return;
                                        await deleteVaccine(v.id);
                                        void reload();
                                        toast.showUndo(
                                          t("toasts.deleted", { name: v.vaccineName }),
                                          async () => {
                                            await createVaccine({ ...data, attachmentId: null });
                                            void reload();
                                          },
                                          { caveat: undoToastCaveat(t, caveats) },
                                        );
                                      }}
                                    >
                                      <Trash2 />
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
        initialName={presetName}
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
  initialName = null,
  profileId,
  vaccineNames,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: Vaccine | null;
  initialName?: string | null;
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
    setVaccineName(editing?.vaccineName ?? initialName ?? "");
    setDate(editing?.date ?? todayISO());
    setDose(editing?.dose != null ? String(editing.dose) : "");
    setManufacturer(editing?.manufacturer ?? "");
    setBatchNumber(editing?.batchNumber ?? "");
    setExpiresAt(editing?.expiresAt ?? "");
    setCountry(editing?.country ?? "");
    setAdministeredBy(editing?.administeredBy ?? "");
    setNotes(editing?.notes ?? "");
  }, [open, editing, initialName]);

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
      guardUnsaved
    >
      <div className="grid gap-3">
        <div className="grid grid-cols-[1fr_9rem] gap-3">
          <Field label={t("vaccines.fields.vaccineName")}>
            <Combobox
              value={vaccineName || null}
              onChange={setVaccineName}
              options={nameOptions}
              placeholder={t("placeholders.vaccineName")}
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
              placeholder={t("placeholders.manufacturer")}
            />
          </Field>
          <Field label={t("vaccines.fields.batchNumber")}>
            <Input
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
              placeholder={t("placeholders.lotNumber")}
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
              placeholder={t("placeholders.country")}
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
              placeholder={t("placeholders.clinic")}
            />
          </Field>
        </div>
        <Field label={t("vaccines.fields.notesOptional")}>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("placeholders.notes")}
          />
        </Field>

        <DialogActions
          onClose={onClose}
          onSubmit={() => void save()}
          submitLabel={editing ? t("common.saveChanges") : t("common.add")}
          disabled={saving || !canSave}
        />
      </div>
    </Dialog>
  );
}
