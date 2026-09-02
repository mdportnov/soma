import * as React from "react";
import { useNavigate } from "react-router-dom";
import {
  CircleCheck,
  CirclePause,
  FlaskConical,
  Pencil,
  Pill,
  Plus,
  Stethoscope,
  Trash2,
} from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import {
  createDiagnosis,
  deleteDiagnosis,
  getDiagnosisRelations,
  listDiagnoses,
  updateDiagnosis,
  type DiagnosisRelations,
} from "@/db/repos";
import type { Diagnosis } from "@/db/schema";
import { RelatedLinks, type RelatedItem } from "@/components/app/RelatedLinks";
import { useToast } from "@/components/app/Toast";
import { useConfirm } from "@/components/app/Confirm";
import { PageHeader } from "@/components/app/PageHeader";
import { IconAction } from "@/components/app/IconAction";
import { StatusCard } from "@/components/app/StatusCard";
import { Loading } from "@/components/app/Loading";
import { EmptyState } from "@/components/app/EmptyState";
import { Field } from "@/components/app/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { SelectMenu } from "@/components/ui/select-menu";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { DurationTimeline, type DurationItem } from "@/components/charts/DurationTimeline";
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

/** Bar fill per diagnosis status, aligned with the status badge semantics. */
const STATUS_COLOR: Record<Diagnosis["status"], string> = {
  active: "#d97706",
  remission: "#0ea5e9",
  resolved: "#64748b",
};

export function Diagnoses() {
  const { profileId } = useApp();
  const { t } = useI18n();
  const toast = useToast();
  const { confirmDelete } = useConfirm();
  const {
    data: diagnoses,
    loading,
    reload,
  } = useQuery(() => listDiagnoses(profileId), [profileId]);
  const { data: relations } = useQuery(async () => {
    const list = await listDiagnoses(profileId);
    const active = list.filter((d) => d.status === "active");
    const resolved = await Promise.all(active.map((d) => getDiagnosisRelations(d)));
    return new Map(active.map((d, i) => [d.id, resolved[i]]));
  }, [profileId]);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Diagnosis | null>(null);
  const [resolvingId, setResolvingId] = React.useState<number | null>(null);
  const [resolveDate, setResolveDate] = React.useState(todayISO());

  // One removal path for all three lists (active cards, remission and resolved
  // tables) so the confirmation and the Undo toast can never drift apart.
  const removeDiagnosis = async (d: Diagnosis) => {
    const { id: _id, ...data } = d;
    const ok = await confirmDelete({
      entity: "diagnosis",
      name: d.name,
      dateLabel: formatDate(d.date),
      undoable: true,
    });
    if (!ok) return;
    await deleteDiagnosis(d.id);
    void reload();
    toast.showUndo(t("toasts.deleted", { name: d.name }), async () => {
      await createDiagnosis(data);
      void reload();
    });
  };

  if (loading || !diagnoses) return <Loading />;

  const active = diagnoses.filter((d) => d.status === "active");
  const remission = diagnoses.filter((d) => d.status === "remission");
  const resolved = diagnoses.filter((d) => d.status === "resolved");

  const timelineItems: DurationItem[] = diagnoses.map((d) => ({
    id: d.id,
    label: d.name,
    start: d.date,
    // Active conditions run to "now"; closed ones end at their resolved date
    // (falling back to the onset date when none was recorded).
    end: d.status === "active" ? null : (d.resolvedDate ?? d.date),
    color: STATUS_COLOR[d.status],
    tooltip: (
      <div className="space-y-0.5">
        <div className="font-semibold text-pretty">{d.name}</div>
        {d.icdCode && <div className="text-muted-foreground">{d.icdCode}</div>}
        <div className="text-muted-foreground tabular-nums">
          {t(`status.${d.status}`)} · {formatDate(d.date)}
          {d.status !== "active" && d.resolvedDate ? ` → ${formatDate(d.resolvedDate)}` : ""}
        </div>
        {d.notes && <div className="text-muted-foreground">{d.notes}</div>}
      </div>
    ),
  }));

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  return (
    <>
      <PageHeader
        title={t("diagnoses.title")}
        description={t("diagnoses.description")}
        actions={
          <Button onClick={openNew}>
            <Plus /> {t("common.add")}
          </Button>
        }
      />

      {diagnoses.length === 0 ? (
        <EmptyState
          icon={FlaskConical}
          title={t("diagnoses.emptyTitle")}
          description={t("diagnoses.emptyDescription")}
          action={
            <Button size="sm" onClick={openNew}>
              {t("diagnoses.addFirst")}
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          <DurationTimeline
            title={t("diagnoses.timeline.title")}
            storageKey="soma.timeline.diagnoses"
            items={timelineItems}
            legend={[
              { color: STATUS_COLOR.active, label: t("status.active") },
              { color: STATUS_COLOR.remission, label: t("status.remission") },
              { color: STATUS_COLOR.resolved, label: t("status.resolved") },
            ]}
            onSelect={(id) => {
              const d = diagnoses.find((x) => x.id === id);
              if (d) {
                setEditing(d);
                setFormOpen(true);
              }
            }}
          />
          {active.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("diagnoses.sections.active")}
              </h2>
              <div className="grid auto-rows-fr gap-2 sm:grid-cols-2">
                {active.map((d) => (
                  <StatusCard
                    key={d.id}
                    to={`/diagnoses/${d.id}`}
                    title={d.name}
                    status={<Badge variant="warning">{t("status.active")}</Badge>}
                    value={
                      d.icdCode ? (
                        <p className="text-sm font-medium tabular-nums selectable">{d.icdCode}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground">—</p>
                      )
                    }
                    meta={`${t("diagnoses.fields.diagnosis")}: ${formatDate(d.date)}`}
                    actions={
                      <>
                        <IconAction
                          label={t("common.edit")}
                          icon={<Pencil />}
                          onClick={() => {
                            setEditing(d);
                            setFormOpen(true);
                          }}
                        />
                        <IconAction
                          label={t("diagnoses.actions.moveToRemission")}
                          icon={<CirclePause />}
                          onClick={async () => {
                            await updateDiagnosis(d.id, { status: "remission" });
                            void reload();
                            toast.showAction(
                              t("toasts.dxRemission", { name: d.name }),
                              t("common.undo"),
                              async () => {
                                await updateDiagnosis(d.id, { status: "active" });
                                void reload();
                              },
                            );
                          }}
                        />
                        {resolvingId === d.id ? (
                          <div className="flex w-full flex-wrap items-center gap-1.5">
                            <DateInput value={resolveDate} onChange={setResolveDate} />
                            <Button
                              size="sm"
                              onClick={async () => {
                                await updateDiagnosis(d.id, {
                                  status: "resolved",
                                  resolvedDate: resolveDate,
                                });
                                setResolvingId(null);
                                void reload();
                                toast.showAction(
                                  t("toasts.dxResolved", { name: d.name }),
                                  t("common.undo"),
                                  async () => {
                                    await updateDiagnosis(d.id, {
                                      status: "active",
                                      resolvedDate: null,
                                    });
                                    void reload();
                                  },
                                );
                              }}
                            >
                              {t("diagnoses.actions.confirmResolve")}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setResolvingId(null)}>
                              {t("common.cancel")}
                            </Button>
                          </div>
                        ) : (
                          <IconAction
                            label={t("diagnoses.actions.resolve")}
                            icon={<CircleCheck />}
                            onClick={() => {
                              setResolveDate(todayISO());
                              setResolvingId(d.id);
                            }}
                          />
                        )}
                        <IconAction
                          label={t("common.delete")}
                          icon={<Trash2 />}
                          destructive
                          onClick={() => void removeDiagnosis(d)}
                        />
                      </>
                    }
                  >
                    {d.notes && (
                      <p className="truncate text-xs text-muted-foreground" title={d.notes}>
                        {d.notes}
                      </p>
                    )}
                    <DiagnosisRelated relations={relations?.get(d.id)} />
                  </StatusCard>
                ))}
              </div>
            </section>
          )}

          {remission.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("diagnoses.sections.remission")}
              </h2>
              <DiagnosisTable
                diagnoses={remission}
                onEdit={(d) => {
                  setEditing(d);
                  setFormOpen(true);
                }}
                onDelete={removeDiagnosis}
              />
            </section>
          )}

          {resolved.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("diagnoses.sections.resolved")}
              </h2>
              <DiagnosisTable
                diagnoses={resolved}
                onEdit={(d) => {
                  setEditing(d);
                  setFormOpen(true);
                }}
                onDelete={removeDiagnosis}
              />
            </section>
          )}
        </div>
      )}

      <DiagnosisForm
        open={formOpen}
        editing={editing}
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

function DiagnosisRelated({ relations }: { relations?: DiagnosisRelations }) {
  const { t } = useI18n();
  if (!relations) return null;
  const items: RelatedItem[] = [];
  if (relations.visit) {
    const v = relations.visit;
    items.push({
      id: `visit-${v.id}`,
      icon: Stethoscope,
      label: t("related.fromVisit"),
      sublabel: [v.doctorName || v.specialty, formatDate(v.date)].filter(Boolean).join(" · "),
      to: `/visits/${v.id}`,
    });
  }
  for (const m of relations.medications) {
    items.push({
      id: `med-${m.id}`,
      icon: Pill,
      label: m.name,
      sublabel: t("related.treatedBy"),
      to: `/medications/${m.id}`,
    });
  }
  return <RelatedLinks title={t("related.title")} items={items} className="mt-0 border-t-0 pt-0" />;
}

function DiagnosisTable({
  diagnoses,
  onEdit,
  onDelete,
}: {
  diagnoses: Diagnosis[];
  onEdit: (d: Diagnosis) => void;
  onDelete: (d: Diagnosis) => Promise<void>;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();

  return (
    <div className="rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("diagnoses.fields.diagnosis")}</TableHead>
            <TableHead>{t("diagnoses.fields.icd")}</TableHead>
            <TableHead>{t("fields.date")}</TableHead>
            <TableHead>{t("diagnoses.fields.status")}</TableHead>
            <TableHead actions />
          </TableRow>
        </TableHeader>
        <TableBody>
          {diagnoses.map((d) => (
            <TableRow
              key={d.id}
              className="cursor-pointer"
              onClick={() => navigate(`/diagnoses/${d.id}`)}
            >
              <TableCell className="font-medium">{d.name}</TableCell>
              <TableCell className="text-muted-foreground">{d.icdCode ?? "—"}</TableCell>
              <TableCell>{formatDate(d.date)}</TableCell>
              <TableCell>
                <Badge variant={d.status === "resolved" ? "success" : "secondary"}>
                  {t(`status.${d.status}`)}
                </Badge>
              </TableCell>
              <TableCell actions>
                <div className="flex justify-end gap-0.5">
                  <Button
                    variant="ghost"
                    size="iconSm"
                    aria-label={t("common.edit")}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(d);
                    }}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="iconSm"
                    aria-label={t("common.delete")}
                    className="text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      void onDelete(d);
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function DiagnosisForm({
  open,
  editing,
  profileId,
  defaultVisitId,
  defaultDate,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: Diagnosis | null;
  profileId: number;
  defaultVisitId?: number;
  defaultDate?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [name, setName] = React.useState("");
  const [icdCode, setIcdCode] = React.useState("");
  const [date, setDate] = React.useState(todayISO());
  const [status, setStatus] = React.useState<"active" | "remission" | "resolved">("active");
  const [notes, setNotes] = React.useState("");
  const [resolvedDate, setResolvedDate] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setIcdCode(editing?.icdCode ?? "");
    setDate(editing?.date ?? defaultDate ?? todayISO());
    setStatus(editing?.status ?? "active");
    setNotes(editing?.notes ?? "");
    setResolvedDate(editing?.resolvedDate ?? "");
  }, [open, editing, defaultDate]);

  const changeStatus = (next: typeof status) => {
    setStatus(next);
    if (next === "resolved" && !resolvedDate) setResolvedDate(todayISO());
  };

  // A resolved/remission diagnosis can't resolve before it began; ISO strings
  // compare lexicographically.
  const resolvedBeforeStart =
    status !== "active" && !!resolvedDate && !!date && resolvedDate < date;
  const canSave = !!name.trim() && !!date && !resolvedBeforeStart;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const data = {
        profileId,
        name: name.trim(),
        icdCode: icdCode.trim() || null,
        date,
        status,
        notes: notes.trim() || null,
        // Non-active needs an end anchor for the timeline; fall back to the
        // onset date rather than leaving a resolved condition with no span.
        resolvedDate: status === "active" ? null : resolvedDate || date,
        visitId: editing ? editing.visitId : (defaultVisitId ?? null),
      };
      if (editing) await updateDiagnosis(editing.id, data);
      else await createDiagnosis(data);
      toast.show(t(editing ? "toasts.updated" : "toasts.added", { name: data.name }));
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? t("diagnoses.addDialog.titleEdit") : t("diagnoses.addDialog.titleAdd")}
      onSubmit={save}
      submitDisabled={saving || !canSave}
      guardUnsaved
    >
      <div className="grid gap-3">
        <Field label={t("fields.name")}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("placeholders.diagnosisName")}
          />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label={t("diagnoses.fields.icdCodeOptional")}>
            <Input
              value={icdCode}
              onChange={(e) => setIcdCode(e.target.value)}
              placeholder="E03.9"
            />
          </Field>
          <Field label={t("fields.date")}>
            <DateInput value={date} onChange={setDate} />
          </Field>
          <Field label={t("diagnoses.fields.status")}>
            <SelectMenu
              value={status}
              onChange={(v) => changeStatus(v as typeof status)}
              options={[
                { value: "active", label: t("status.active") },
                { value: "remission", label: t("status.remission") },
                { value: "resolved", label: t("status.resolved") },
              ]}
            />
          </Field>
        </div>
        {status !== "active" && (
          <Field label={t("diagnoses.fields.resolvedDate")}>
            <DateInput value={resolvedDate} onChange={setResolvedDate} />
          </Field>
        )}
        {resolvedBeforeStart && (
          <p className="text-[11px] text-amber-600 dark:text-amber-500">
            {t("common.validation.resolvedBeforeStart")}
          </p>
        )}
        <Field label={t("diagnoses.fields.notesOptional")}>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
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
