import * as React from "react";
import { ChevronDown, NotebookText, Pencil, Plus, Trash2 } from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import { useHighlight } from "@/hooks/useHighlight";
import { createHealthNote, deleteHealthNote, listHealthNotes, updateHealthNote } from "@/db/repos";
import type { HealthNote } from "@/db/schema";
import { useToast } from "@/components/app/Toast";
import { useConfirm } from "@/components/app/Confirm";
import { PageHeader } from "@/components/app/PageHeader";
import { Loading } from "@/components/app/Loading";
import { IconAction } from "@/components/app/IconAction";
import { EmptyState } from "@/components/app/EmptyState";
import { Field } from "@/components/app/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DateInput } from "@/components/ui/date-input";
import { SelectMenu } from "@/components/ui/select-menu";
import { ChipSelect } from "@/components/ui/chip-select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatDate, formatDateObject, uiLocale } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

type Category = HealthNote["category"];
type Precision = HealthNote["datePrecision"];

const CATEGORIES: Category[] = [
  "general",
  "concern",
  "symptom_pattern",
  "treatment",
  "history",
  "other",
];

const PRECISIONS: Precision[] = ["day", "month", "year", "approximate", "range", "unknown"];

/**
 * Renders a note's date at the precision it was recorded with: a note about
 * "childhood surgery" must not read as a specific day. When the user's own
 * phrase was kept (`dateRaw`), that wins — it carries more meaning than a
 * normalized ISO date the AI guessed.
 */
function noteDateLabel(note: HealthNote, unknownLabel: string): string {
  if (note.dateRaw) return note.dateRaw;
  if (!note.date) return unknownLabel;
  const parsed = new Date(`${note.date.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return note.date;
  switch (note.datePrecision) {
    case "year":
      return String(parsed.getFullYear());
    case "month":
      return formatDateObject(parsed, uiLocale(), { month: "short", year: "numeric" });
    case "approximate":
      return `≈ ${formatDate(note.date)}`;
    default:
      return formatDate(note.date);
  }
}

/** Card headline: an explicit title, else the summary, else the raw text. */
function noteHeadline(note: HealthNote): string {
  const text = note.title || note.summary || note.originalText;
  return text.replace(/\s+/g, " ").trim();
}

export function HealthNotes() {
  const { profileId } = useApp();
  const { t } = useI18n();
  const toast = useToast();
  const { confirmDelete } = useConfirm();
  // ⌘K lands here as /notes?highlight=<id> — flash that note.
  const highlight = useHighlight();
  const { data: notes, loading, reload } = useQuery(() => listHealthNotes(profileId), [profileId]);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<HealthNote | null>(null);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [search, setSearch] = React.useState("");

  const visible = React.useMemo(() => {
    if (!notes) return [];
    const needle = search.trim().toLowerCase();
    return notes.filter((n) => {
      if (categories.length && !categories.includes(n.category)) return false;
      if (!needle) return true;
      const haystack = [n.title, n.summary, n.originalText, n.dateRaw, ...n.tags]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [notes, categories, search]);

  if (loading || !notes) return <Loading />;

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const remove = async (note: HealthNote) => {
    const { id: _id, createdAt: _c, ...data } = note;
    const ok = await confirmDelete({
      entity: "note",
      name: noteHeadline(note).slice(0, 60),
      dateLabel: note.date || note.dateRaw ? noteDateLabel(note, "") : null,
      undoable: true,
    });
    if (!ok) return;
    await deleteHealthNote(note.id);
    void reload();
    toast.showUndo(t("toasts.deleted", { name: noteHeadline(note).slice(0, 40) }), async () => {
      await createHealthNote(data);
      void reload();
    });
  };

  return (
    <>
      <PageHeader
        title={t("healthNotes.title")}
        description={t("healthNotes.description")}
        actions={
          <Button onClick={openNew}>
            <Plus /> {t("common.add")}
          </Button>
        }
      />

      {notes.length === 0 ? (
        <EmptyState
          icon={NotebookText}
          title={t("healthNotes.emptyTitle")}
          description={t("healthNotes.emptyDescription")}
          action={
            <Button size="sm" onClick={openNew}>
              {t("healthNotes.addFirst")}
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <ChipSelect
              options={CATEGORIES.map((c) => ({
                value: c,
                label: t(`healthNoteCategory.${c}`),
              }))}
              value={categories}
              onChange={setCategories}
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("healthNotes.searchPlaceholder")}
              className="ml-auto w-full sm:w-64"
            />
          </div>

          {visible.length === 0 ? (
            <EmptyState
              icon={NotebookText}
              title={t("healthNotes.noMatchesTitle")}
              description={t("healthNotes.noMatchesDescription")}
            />
          ) : (
            <div className="space-y-2">
              {visible.map((note) => (
                // The card is a shared component, so the ⌘K flash rides on a
                // wrapper rather than threading ref/className through its API.
                <div
                  key={note.id}
                  ref={highlight.id === note.id ? highlight.ref : undefined}
                  className={highlight.className(note.id)}
                >
                  <NoteCard
                    note={note}
                    onEdit={() => {
                      setEditing(note);
                      setFormOpen(true);
                    }}
                    onDelete={() => void remove(note)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <NoteForm
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

function NoteCard({
  note,
  onEdit,
  onDelete,
}: {
  note: HealthNote;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = React.useState(false);
  // The verbatim text is only worth its own block when a condensed summary is
  // already shown above it; otherwise the headline is that text.
  const hasOriginal = Boolean(note.summary || note.title);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold selectable">{noteHeadline(note)}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <Badge variant="secondary" className="text-xs">
                {t(`healthNoteCategory.${note.category}`)}
              </Badge>
              <span>{noteDateLabel(note, t("healthNotes.noDate"))}</span>
              {note.datePrecision !== "day" && note.date && (
                <span className="opacity-70">
                  · {t(`datePrecision.${note.datePrecision}`).toLowerCase()}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <IconAction label={t("common.edit")} icon={<Pencil />} onClick={onEdit} />
            <IconAction
              label={t("common.delete")}
              icon={<Trash2 />}
              destructive
              onClick={onDelete}
            />
          </div>
        </div>

        {note.title && note.summary && (
          <p className="mt-2 text-sm text-muted-foreground selectable">{note.summary}</p>
        )}

        {note.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {note.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[11px] font-normal">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {hasOriginal && (
          <div className="mt-3 border-t pt-2">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <ChevronDown
                className={cn("size-3 transition-transform", expanded && "rotate-180")}
              />
              {expanded ? t("healthNotes.hideOriginal") : t("healthNotes.showOriginal")}
            </button>
            {expanded && (
              <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground selectable">
                {note.originalText}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NoteForm({
  open,
  editing,
  profileId,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: HealthNote | null;
  profileId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [category, setCategory] = React.useState<Category>("general");
  const [title, setTitle] = React.useState("");
  const [summary, setSummary] = React.useState("");
  const [originalText, setOriginalText] = React.useState("");
  const [date, setDate] = React.useState("");
  const [datePrecision, setDatePrecision] = React.useState<Precision>("unknown");
  const [dateRaw, setDateRaw] = React.useState("");
  const [tags, setTags] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setCategory(editing?.category ?? "general");
    setTitle(editing?.title ?? "");
    setSummary(editing?.summary ?? "");
    setOriginalText(editing?.originalText ?? "");
    setDate(editing?.date ?? "");
    setDatePrecision(editing?.datePrecision ?? "unknown");
    setDateRaw(editing?.dateRaw ?? "");
    setTags((editing?.tags ?? []).join(", "));
  }, [open, editing]);

  const save = async () => {
    if (!originalText.trim()) return;
    setSaving(true);
    try {
      const data = {
        profileId,
        category,
        title: title.trim() || null,
        summary: summary.trim() || null,
        originalText: originalText.trim(),
        date: date || null,
        // A date without a stated precision is a concrete day; clearing the date
        // drops any precision claim with it.
        datePrecision: (date
          ? datePrecision === "unknown"
            ? "day"
            : datePrecision
          : "unknown") as Precision,
        dateRaw: dateRaw.trim() || null,
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      };
      if (editing) await updateHealthNote(editing.id, data);
      else await createHealthNote(data);
      const name = (data.title || data.summary || data.originalText).slice(0, 40);
      toast.show(t(editing ? "toasts.updated" : "toasts.added", { name }));
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? t("healthNotes.dialog.titleEdit") : t("healthNotes.dialog.titleAdd")}
      onSubmit={save}
      submitDisabled={saving || !originalText.trim()}
      guardUnsaved
    >
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-[11rem_1fr]">
          <Field label={t("healthNotes.fields.category")}>
            <SelectMenu
              value={category}
              onChange={(v) => setCategory(v as Category)}
              options={CATEGORIES.map((c) => ({
                value: c,
                label: t(`healthNoteCategory.${c}`),
                description: t(`healthNoteCategoryDescription.${c}`),
              }))}
            />
          </Field>
          <Field label={t("healthNotes.fields.titleOptional")}>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("healthNotes.placeholders.title")}
            />
          </Field>
        </div>

        <Field label={t("healthNotes.fields.text")}>
          <Textarea
            value={originalText}
            onChange={(e) => setOriginalText(e.target.value)}
            rows={5}
            placeholder={t("healthNotes.placeholders.text")}
          />
        </Field>

        <Field label={t("healthNotes.fields.summaryOptional")}>
          <Textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={2}
            placeholder={t("healthNotes.placeholders.summary")}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t("healthNotes.fields.dateOptional")}>
            <DateInput value={date} onChange={setDate} clearable />
          </Field>
          <Field label={t("healthNotes.fields.datePrecision")}>
            <SelectMenu
              value={datePrecision}
              onChange={(v) => setDatePrecision(v as Precision)}
              options={PRECISIONS.map((p) => ({ value: p, label: t(`datePrecision.${p}`) }))}
            />
          </Field>
          <Field label={t("healthNotes.fields.dateRawOptional")}>
            <Input
              value={dateRaw}
              onChange={(e) => setDateRaw(e.target.value)}
              placeholder={t("healthNotes.placeholders.dateRaw")}
            />
          </Field>
        </div>

        <Field label={t("healthNotes.fields.tagsOptional")}>
          <Input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder={t("healthNotes.placeholders.tags")}
          />
        </Field>

        <DialogActions
          onClose={onClose}
          onSubmit={() => void save()}
          submitLabel={editing ? t("common.saveChanges") : t("common.add")}
          disabled={saving || !originalText.trim()}
        />
      </div>
    </Dialog>
  );
}
