import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BellOff,
  ChevronRight,
  FlaskConical,
  Pause,
  Pencil,
  Pill,
  Play,
  Plus,
  SlidersHorizontal,
  TestTubes,
  Trash2,
} from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import { useI18n } from "@/lib/i18n";
import {
  createRetestSchedule,
  deleteRetestSchedule,
  getNotificationFeedData,
  listBiomarkers,
  listRetestSchedules,
  updateRetestSchedule,
} from "@/db/repos";
import type { Biomarker, NewRetestSchedule, RetestSchedule } from "@/db/schema";
import {
  buildNotificationFeed,
  dismissNotification,
  filterByPrefs,
  loadDismissedIds,
  loadNotificationPrefs,
  NOTIFICATION_PREFS_EVENT,
  restoreNotification,
  retestDueDate,
  saveNotificationPrefs,
  visibleNotifications,
  type NotificationItem,
  type NotificationPrefs,
  type NotificationSeverity,
} from "@/lib/notifications";
import { PageHeader } from "@/components/app/PageHeader";
import { Loading } from "@/components/app/Loading";
import { EmptyState } from "@/components/app/EmptyState";
import { Field } from "@/components/app/Field";
import { ToggleRow } from "@/components/app/ToggleRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { SelectMenu } from "@/components/ui/select-menu";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { useToast } from "@/components/app/Toast";

const NONE = "__none__";

/** Severity → icon-chip classes (mirrors the dashboard attention list). */
function severityChip(severity: NotificationSeverity): string {
  return severity === "alert"
    ? "bg-destructive/10 text-destructive"
    : severity === "watch"
      ? "bg-warning/15 text-warning"
      : "bg-secondary text-secondary-foreground";
}

export function Notifications() {
  const { profileId } = useApp();
  const { t } = useI18n();

  const { data, loading, reload } = useQuery(async () => {
    const [feedData, schedules, biomarkers] = await Promise.all([
      getNotificationFeedData(profileId),
      listRetestSchedules(profileId),
      listBiomarkers(),
    ]);
    return { feedData, schedules, biomarkers };
  }, [profileId]);

  if (loading || !data) return <Loading />;

  return (
    <>
      <PageHeader title={t("notifications.title")} description={t("notifications.description")} />
      <PrefsSection />
      <FeedSection feedData={data.feedData} />
      <SchedulesSection
        profileId={profileId}
        schedules={data.schedules}
        biomarkers={data.biomarkers}
        reload={reload}
      />
    </>
  );
}

// ── Preferences ──────────────────────────────────────────────────────────────

function PrefsSection() {
  const { t } = useI18n();
  const [prefs, setPrefs] = React.useState<NotificationPrefs>(() => loadNotificationPrefs());

  const set = (patch: Partial<NotificationPrefs>) =>
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      saveNotificationPrefs(next);
      return next;
    });

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-muted-foreground" />
          <CardTitle>{t("notifications.prefs.title")}</CardTitle>
        </div>
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted-foreground">
          {t("notifications.prefs.description")}
        </p>
      </CardHeader>
      <CardContent className="divide-y py-0">
        <ToggleRow
          icon={Pill}
          label={t("notifications.prefs.medication.label")}
          description={t("notifications.prefs.medication.desc")}
          checked={prefs.medication}
          onChange={(v) => set({ medication: v })}
        />
        <ToggleRow
          icon={FlaskConical}
          label={t("notifications.prefs.retest.label")}
          description={t("notifications.prefs.retest.desc")}
          checked={prefs.retest}
          onChange={(v) => set({ retest: v })}
        />
        <ToggleRow
          icon={TestTubes}
          label={t("notifications.prefs.retestUpcoming.label")}
          description={t("notifications.prefs.retestUpcoming.desc")}
          checked={prefs.retestUpcoming && prefs.retest}
          disabled={!prefs.retest}
          onChange={(v) => set({ retestUpcoming: v })}
        />
      </CardContent>
    </Card>
  );
}

// ── Feed ─────────────────────────────────────────────────────────────────────

function FeedSection({
  feedData,
}: {
  feedData: Awaited<ReturnType<typeof getNotificationFeedData>>;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = React.useState<Set<string>>(() => loadDismissedIds());
  const [showDismissed, setShowDismissed] = React.useState(false);
  // Re-read prefs when the toggles above change so the feed reflects mutes live.
  const [prefs, setPrefs] = React.useState<NotificationPrefs>(() => loadNotificationPrefs());
  React.useEffect(() => {
    const onChange = () => setPrefs(loadNotificationPrefs());
    window.addEventListener(NOTIFICATION_PREFS_EVENT, onChange);
    return () => window.removeEventListener(NOTIFICATION_PREFS_EVENT, onChange);
  }, []);

  const items = React.useMemo(
    () => filterByPrefs(buildNotificationFeed(feedData), prefs),
    [feedData, prefs],
  );
  const visible = visibleNotifications(items, dismissed);
  const hidden = items.filter((i) => dismissed.has(i.id));

  const dismiss = (item: NotificationItem) => {
    dismissNotification(item.id);
    setDismissed(loadDismissedIds());
    toast.showAction(t("notifications.dismissed"), t("common.undo"), () => {
      restoreNotification(item.id);
      setDismissed(loadDismissedIds());
    });
  };

  const restore = (item: NotificationItem) => {
    restoreNotification(item.id);
    setDismissed(loadDismissedIds());
  };

  return (
    <Card className="mb-6">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>{t("notifications.feedTitle")}</CardTitle>
        {hidden.length > 0 && (
          <button
            onClick={() => setShowDismissed((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {showDismissed
              ? t("notifications.hideDismissed")
              : t("notifications.showDismissed", { count: String(hidden.length) })}
          </button>
        )}
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <EmptyState
            icon={BellOff}
            title={t("notifications.emptyTitle")}
            description={t("notifications.emptyDescription")}
          />
        ) : (
          <ul className="divide-y">
            {visible.map((item) => (
              <FeedRow
                key={item.id}
                item={item}
                onOpen={() => navigate(item.route)}
                onDismiss={() => dismiss(item)}
              />
            ))}
          </ul>
        )}

        {showDismissed && hidden.length > 0 && (
          <div className="mt-4 border-t pt-3">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("notifications.dismissed")}
            </p>
            <ul className="divide-y">
              {hidden.map((item) => (
                <li key={item.id} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                    {headline(item, t)}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => restore(item)}>
                    {t("notifications.restore")}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FeedRow({
  item,
  onOpen,
  onDismiss,
}: {
  item: NotificationItem;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  const Icon =
    item.kind === "medication" ? Pill : item.severity === "alert" ? TestTubes : FlaskConical;

  return (
    <li className="flex items-center gap-3 py-2.5">
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div
          className={
            "flex size-9 shrink-0 items-center justify-center rounded-lg " +
            severityChip(item.severity)
          }
        >
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{headline(item, t)}</p>
          <p className="truncate text-xs text-muted-foreground">{subline(item, t)}</p>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </button>
      <Button variant="ghost" size="sm" onClick={onDismiss}>
        {t("notifications.dismiss")}
      </Button>
    </li>
  );
}

function headline(
  item: NotificationItem,
  t: (key: string, vars?: Record<string, string>) => string,
) {
  return item.kind === "medication"
    ? t("notifications.medication.title", { name: item.medName })
    : t("notifications.retest.title", { label: item.label });
}

function subline(
  item: NotificationItem,
  t: (key: string, vars?: Record<string, string>) => string,
) {
  if (item.kind === "medication") {
    const due = t("notifications.medication.due");
    return item.times.length
      ? `${due} · ${t("notifications.medication.atTimes", { times: item.times.join(", ") })}`
      : due;
  }
  const status = item.noAnchor
    ? t("notifications.retest.noAnchor")
    : item.overdueDays > 0
      ? t("notifications.retest.overdue", { days: String(item.overdueDays) })
      : item.overdueDays === 0
        ? t("notifications.retest.dueToday")
        : t("notifications.retest.upcoming", { days: String(-item.overdueDays) });
  return item.noAnchor
    ? status
    : `${status} · ${t("notifications.retest.due", { date: formatDate(item.dueDate) })}`;
}

// ── Re-testing schedules ─────────────────────────────────────────────────────

function SchedulesSection({
  profileId,
  schedules,
  biomarkers,
  reload,
}: {
  profileId: number;
  schedules: RetestSchedule[];
  biomarkers: Biomarker[];
  reload: () => Promise<void>;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<RetestSchedule | null>(null);

  const bioById = React.useMemo(() => new Map(biomarkers.map((b) => [b.id, b])), [biomarkers]);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (s: RetestSchedule) => {
    setEditing(s);
    setFormOpen(true);
  };

  const toggleActive = async (s: RetestSchedule) => {
    await updateRetestSchedule(s.id, { active: !s.active });
    void reload();
  };

  const remove = async (s: RetestSchedule) => {
    const { id: _id, createdAt: _c, ...data } = s;
    await deleteRetestSchedule(s.id);
    void reload();
    toast.showAction(t("toasts.deleted", { name: s.label }), t("common.undo"), async () => {
      await createRetestSchedule(data);
      void reload();
    });
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle>{t("notifications.schedules.title")}</CardTitle>
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted-foreground">
            {t("notifications.schedules.description")}
          </p>
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus /> {t("notifications.schedules.add")}
        </Button>
      </CardHeader>
      <CardContent className={schedules.length === 0 ? undefined : "p-0"}>
        {schedules.length === 0 ? (
          <EmptyState
            icon={FlaskConical}
            title={t("notifications.schedules.emptyTitle")}
            description={t("notifications.schedules.emptyDescription")}
            action={
              <Button size="sm" onClick={openNew}>
                {t("notifications.schedules.add")}
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("notifications.schedules.table.label")}</TableHead>
                <TableHead>{t("notifications.schedules.table.every")}</TableHead>
                <TableHead>{t("notifications.schedules.table.lastTested")}</TableHead>
                <TableHead>{t("notifications.schedules.table.nextDue")}</TableHead>
                <TableHead>{t("notifications.schedules.table.status")}</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedules.map((s) => {
                const bio = s.biomarkerId != null ? bioById.get(s.biomarkerId) : null;
                const nextDue = s.lastTestedDate
                  ? retestDueDate(s.lastTestedDate, s.intervalMonths)
                  : null;
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <span className="font-medium">{s.label}</span>
                      {bio && (
                        <Link
                          to={`/biomarkers/${bio.id}`}
                          className="ml-2 text-xs text-muted-foreground hover:text-foreground hover:underline"
                        >
                          {bio.canonicalName}
                        </Link>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {t("notifications.schedules.every", { n: String(s.intervalMonths) })}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.lastTestedDate ? formatDate(s.lastTestedDate) : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {nextDue ? formatDate(nextDue) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.active ? "success" : "secondary"}>
                        {s.active
                          ? t("notifications.schedules.active")
                          : t("notifications.schedules.paused")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-0.5">
                        <Button
                          variant="ghost"
                          size="iconSm"
                          aria-label={
                            s.active
                              ? t("notifications.schedules.pause")
                              : t("notifications.schedules.resume")
                          }
                          title={
                            s.active
                              ? t("notifications.schedules.pause")
                              : t("notifications.schedules.resume")
                          }
                          onClick={() => toggleActive(s)}
                        >
                          {s.active ? <Pause /> : <Play />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="iconSm"
                          aria-label={t("common.edit")}
                          onClick={() => openEdit(s)}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="iconSm"
                          className="text-destructive"
                          aria-label={t("common.delete")}
                          onClick={() => remove(s)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <ScheduleForm
        open={formOpen}
        editing={editing}
        profileId={profileId}
        biomarkers={biomarkers}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          void reload();
        }}
      />
    </Card>
  );
}

function ScheduleForm({
  open,
  editing,
  profileId,
  biomarkers,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: RetestSchedule | null;
  profileId: number;
  biomarkers: Biomarker[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [label, setLabel] = React.useState("");
  const [biomarkerId, setBiomarkerId] = React.useState<string>(NONE);
  const [intervalMonths, setIntervalMonths] = React.useState("6");
  const [lastTestedDate, setLastTestedDate] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setLabel(editing?.label ?? "");
    setBiomarkerId(editing?.biomarkerId != null ? String(editing.biomarkerId) : NONE);
    setIntervalMonths(editing?.intervalMonths != null ? String(editing.intervalMonths) : "6");
    setLastTestedDate(editing?.lastTestedDate ?? "");
    setNotes(editing?.notes ?? "");
  }, [open, editing]);

  const intervalNum = Number(intervalMonths);
  const valid =
    label.trim() !== "" &&
    intervalMonths.trim() !== "" &&
    Number.isFinite(intervalNum) &&
    intervalNum >= 1;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const data: NewRetestSchedule = {
        profileId,
        label: label.trim(),
        biomarkerId: biomarkerId === NONE ? null : Number(biomarkerId),
        intervalMonths: Math.round(intervalNum),
        lastTestedDate: lastTestedDate || null,
        notes: notes.trim() || null,
        ...(editing ? {} : { active: true }),
      };
      if (editing) await updateRetestSchedule(editing.id, data);
      else await createRetestSchedule(data);
      onSaved();
      toast.show(t(editing ? "toasts.updated" : "toasts.added", { name: data.label }));
    } finally {
      setSaving(false);
    }
  };

  const bioOptions = [
    { value: NONE, label: t("notifications.schedules.fields.biomarkerNone") },
    ...biomarkers.map((b) => ({ value: String(b.id), label: b.canonicalName })),
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={
        editing
          ? t("notifications.schedules.dialog.titleEdit")
          : t("notifications.schedules.dialog.titleAdd")
      }
      onSubmit={save}
      submitDisabled={saving || !valid}
    >
      <div className="grid gap-3">
        <Field label={t("notifications.schedules.fields.label")}>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t("notifications.schedules.fields.labelPlaceholder")}
          />
        </Field>
        <Field label={t("notifications.schedules.fields.biomarker")}>
          <SelectMenu value={biomarkerId} onChange={setBiomarkerId} options={bioOptions} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("notifications.schedules.fields.intervalMonths")}>
            <Input
              type="number"
              min="1"
              step="1"
              value={intervalMonths}
              onChange={(e) => setIntervalMonths(e.target.value)}
            />
          </Field>
          <Field label={t("notifications.schedules.fields.lastTestedDate")}>
            <DateInput
              value={lastTestedDate}
              onChange={setLastTestedDate}
              clearable
              disableFuture
            />
          </Field>
        </div>
        <Field label={t("notifications.schedules.fields.notesOptional")}>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={save} disabled={saving || !valid}>
            {editing ? t("common.saveChanges") : t("common.add")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
