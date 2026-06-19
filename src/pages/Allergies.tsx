import * as React from "react";
import { Lock, Pencil, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import { createAllergy, deleteAllergy, listAllergies, updateAllergy } from "@/db/repos";
import type { Allergy } from "@/db/schema";
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
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

type SeverityVariant = "secondary" | "warning" | "destructive";

function severityVariant(severity: Allergy["severity"]): SeverityVariant {
  if (severity === "mild") return "secondary";
  if (severity === "moderate") return "warning";
  return "destructive";
}

export function Allergies() {
  const { profileId } = useApp();
  const { t } = useI18n();
  const toast = useToast();
  const {
    data: allergies,
    loading,
    reload,
  } = useQuery(() => listAllergies(profileId), [profileId]);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Allergy | null>(null);

  if (loading || !allergies) return <Loading />;

  const active = allergies.filter((a) => a.status === "active");
  const resolved = allergies.filter((a) => a.status === "resolved");

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  return (
    <>
      <PageHeader
        title={t("allergies.title")}
        description={t("allergies.description")}
        actions={
          <Button onClick={openNew}>
            <Plus /> {t("common.add")}
          </Button>
        }
      />

      {allergies.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title={t("allergies.emptyTitle")}
          description={t("allergies.emptyDescription")}
          action={
            <Button size="sm" onClick={openNew}>
              {t("allergies.addFirst")}
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {[
            { label: t("allergies.sections.active"), items: active, isActive: true },
            { label: t("allergies.sections.resolved"), items: resolved, isActive: false },
          ]
            .filter((s) => s.items.length)
            .map((section) => (
              <section key={section.label}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {section.label}
                </h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  {section.items.map((a) => (
                    <AllergyCard
                      key={a.id}
                      allergy={a}
                      isActive={section.isActive}
                      onEdit={() => {
                        setEditing(a);
                        setFormOpen(true);
                      }}
                      onResolve={async () => {
                        await updateAllergy(a.id, { status: "resolved" });
                        void reload();
                        toast.showAction(
                          t("toasts.allergyResolved", { name: a.allergen }),
                          t("common.undo"),
                          async () => {
                            await updateAllergy(a.id, { status: "active" });
                            void reload();
                          },
                        );
                      }}
                      onDelete={async () => {
                        const { id: _id, createdAt: _c, ...data } = a;
                        await deleteAllergy(a.id);
                        void reload();
                        toast.showAction(
                          t("toasts.deleted", { name: a.allergen }),
                          t("common.undo"),
                          async () => {
                            await createAllergy(data);
                            void reload();
                          },
                        );
                      }}
                    />
                  ))}
                </div>
              </section>
            ))}
        </div>
      )}

      <AllergyForm
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

function AllergyCard({
  allergy: a,
  isActive,
  onEdit,
  onResolve,
  onDelete,
}: {
  allergy: Allergy;
  isActive: boolean;
  onEdit: () => void;
  onResolve: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const isAnaphylactic = a.severity === "anaphylactic";

  return (
    <Card className={isActive ? undefined : "opacity-60"}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{a.allergen}</p>
            <Badge variant="secondary" className="mt-0.5 text-xs">
              {t(`allergyCategory.${a.category}`)}
            </Badge>
          </div>
          {isActive ? (
            <Badge variant={severityVariant(a.severity)} className="shrink-0">
              {isAnaphylactic && <Lock className="mr-1 size-3" />}
              {t(`allergySeverity.${a.severity}`)}
            </Badge>
          ) : (
            <Badge variant="success" className="shrink-0">
              {t("status.resolved")}
            </Badge>
          )}
        </div>
        {(a.reaction || a.onsetDate) && (
          <div className="mt-2 text-xs text-muted-foreground">
            {a.reaction && (
              <p className="truncate" title={a.reaction}>
                {a.reaction}
              </p>
            )}
            {a.onsetDate && <p>Onset: {formatDate(a.onsetDate)}</p>}
          </div>
        )}
        <div className="mt-3 flex gap-1.5 border-t pt-3">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil /> {t("common.edit")}
          </Button>
          {isActive && (
            <Button variant="outline" size="sm" onClick={onResolve}>
              {t("allergies.actions.resolve")}
            </Button>
          )}
          {isAnaphylactic ? (
            <span title={t("allergies.deleteAnaphylacticTooltip")} className="ml-auto">
              <Button
                variant="ghost"
                size="sm"
                className="pointer-events-none text-destructive opacity-40"
                disabled
                aria-disabled
                tabIndex={-1}
              >
                <Trash2 />
              </Button>
            </span>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-destructive"
              onClick={onDelete}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AllergyForm({
  open,
  editing,
  profileId,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: Allergy | null;
  profileId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [allergen, setAllergen] = React.useState("");
  const [category, setCategory] = React.useState<Allergy["category"]>("other");
  const [severity, setSeverity] = React.useState<Allergy["severity"]>("mild");
  const [status, setStatus] = React.useState<Allergy["status"]>("active");
  const [onsetDate, setOnsetDate] = React.useState("");
  const [reaction, setReaction] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setAllergen(editing?.allergen ?? "");
    setCategory(editing?.category ?? "other");
    setSeverity(editing?.severity ?? "mild");
    setStatus(editing?.status ?? "active");
    setOnsetDate(editing?.onsetDate ?? "");
    setReaction(editing?.reaction ?? "");
    setNotes(editing?.notes ?? "");
  }, [open, editing]);

  const save = async () => {
    if (!allergen.trim()) return;
    setSaving(true);
    try {
      const data = {
        profileId,
        allergen: allergen.trim(),
        category,
        severity,
        status,
        onsetDate: onsetDate || null,
        reaction: reaction.trim() || null,
        notes: notes.trim() || null,
      };
      if (editing) await updateAllergy(editing.id, data);
      else await createAllergy(data);
      toast.show(t(editing ? "toasts.updated" : "toasts.added", { name: data.allergen }));
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? t("allergies.addDialog.titleEdit") : t("allergies.addDialog.titleAdd")}
      onSubmit={save}
      submitDisabled={saving || !allergen.trim()}
    >
      <div className="grid gap-3">
        <div className="grid grid-cols-[1fr_9rem] gap-3">
          <Field label={t("allergies.fields.allergen")}>
            <Input
              value={allergen}
              onChange={(e) => setAllergen(e.target.value)}
              placeholder="e.g. Penicillin, Peanuts"
            />
          </Field>
          <Field label={t("allergies.fields.category")}>
            <SelectMenu
              value={category}
              onChange={(v) => setCategory(v as Allergy["category"])}
              options={[
                { value: "drug", label: t("allergyCategory.drug") },
                { value: "food", label: t("allergyCategory.food") },
                { value: "environmental", label: t("allergyCategory.environmental") },
                { value: "other", label: t("allergyCategory.other") },
              ]}
            />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label={t("allergies.fields.severity")}>
            <SelectMenu
              value={severity}
              onChange={(v) => setSeverity(v as Allergy["severity"])}
              options={[
                {
                  value: "mild",
                  label: t("allergySeverity.mild"),
                  description: t("allergySeverityDescription.mild"),
                },
                {
                  value: "moderate",
                  label: t("allergySeverity.moderate"),
                  description: t("allergySeverityDescription.moderate"),
                },
                {
                  value: "severe",
                  label: t("allergySeverity.severe"),
                  description: t("allergySeverityDescription.severe"),
                },
                {
                  value: "anaphylactic",
                  label: t("allergySeverity.anaphylactic"),
                  description: t("allergySeverityDescription.anaphylactic"),
                },
              ]}
            />
          </Field>
          <Field label={t("allergies.fields.status")}>
            <SelectMenu
              value={status}
              onChange={(v) => setStatus(v as Allergy["status"])}
              options={[
                { value: "active", label: t("status.active") },
                { value: "resolved", label: t("status.resolved") },
              ]}
            />
          </Field>
          <Field label={t("allergies.fields.onsetDateOptional")}>
            <DateInput value={onsetDate} onChange={setOnsetDate} clearable />
          </Field>
        </div>
        <Field label={t("allergies.fields.reactionOptional")}>
          <Textarea
            value={reaction}
            onChange={(e) => setReaction(e.target.value)}
            rows={2}
            placeholder="e.g. Hives, swelling, anaphylaxis"
          />
        </Field>
        <Field label={t("allergies.fields.notesOptional")}>
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
