import * as React from "react";
import { Activity, Gauge, HeartPulse, Moon, Pencil, Plus, Trash2 } from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import {
  deleteLifestyleLog,
  getRecentLifestyle,
  listLifestyleLog,
  upsertLifestyleLog,
} from "@/db/repos";
import type { LifestyleLog, NewLifestyleLog } from "@/db/schema";
import { summarizeLifestyle, type LifestyleSummary } from "@/lib/lifestyle";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, formatDate, formatValue, todayISO } from "@/lib/utils";
import { useToast } from "@/components/app/Toast";
import { useI18n } from "@/lib/i18n";

const WINDOW_DAYS = 30;

type Intensity = "light" | "moderate" | "intense";

/** Parse a numeric input string to a finite number, or null when empty/invalid. */
function parseNumeric(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function Lifestyle() {
  const { profileId } = useApp();
  const { t } = useI18n();
  const toast = useToast();

  const { data, loading, reload } = useQuery(async () => {
    const [rows, recent] = await Promise.all([
      listLifestyleLog(profileId),
      getRecentLifestyle(profileId, WINDOW_DAYS),
    ]);
    return { rows, summary: summarizeLifestyle(recent, WINDOW_DAYS) };
  }, [profileId]);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<LifestyleLog | null>(null);
  const [showAll, setShowAll] = React.useState(false);

  if (loading || !data) return <Loading />;
  const { rows, summary } = data;
  const visible = showAll ? rows : rows.slice(0, 20);

  const openToday = () => {
    setEditing(null);
    setFormOpen(true);
  };

  return (
    <>
      <PageHeader
        title={t("lifestyle.title")}
        description={t("lifestyle.description")}
        actions={
          <Button onClick={openToday}>
            <Plus /> {t("lifestyle.logToday")}
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard icon={Moon} title={t("lifestyle.cards.sleep")} summary={summary}>
          <Metric label={t("lifestyle.metrics.avgSleep")}>
            {summary.avgSleepHours == null
              ? t("lifestyle.metrics.noData")
              : t("lifestyle.metrics.hours", { n: formatValue(summary.avgSleepHours, 1) })}
          </Metric>
          <Metric label={t("lifestyle.metrics.avgSleepQuality")}>
            {summary.avgSleepQuality == null
              ? t("lifestyle.metrics.noData")
              : t("lifestyle.metrics.scale5", { n: formatValue(summary.avgSleepQuality, 1) })}
          </Metric>
        </SummaryCard>

        <SummaryCard icon={Activity} title={t("lifestyle.cards.training")} summary={summary}>
          <Metric label={t("lifestyle.metrics.trainingLoad")}>
            {summary.trainingMinutesTotal === 0
              ? t("lifestyle.metrics.noData")
              : t("lifestyle.metrics.minutes", { n: String(summary.trainingMinutesTotal) })}
          </Metric>
          <Metric label={t("lifestyle.metrics.steps")}>
            {summary.avgSteps == null
              ? t("lifestyle.metrics.noData")
              : formatValue(summary.avgSteps, 0)}
          </Metric>
          <Metric label={t("lifestyle.cards.training")}>
            {t("lifestyle.metrics.trainingDays", { count: String(summary.trainingDays) })}
          </Metric>
        </SummaryCard>

        <SummaryCard icon={Gauge} title={t("lifestyle.cards.stress")} summary={summary}>
          <Metric label={t("lifestyle.metrics.avgStress")}>
            {summary.avgStress == null
              ? t("lifestyle.metrics.noData")
              : t("lifestyle.metrics.scale5", { n: formatValue(summary.avgStress, 1) })}
          </Metric>
          <Metric label={t("lifestyle.metrics.avgEnergy")}>
            {summary.avgEnergy == null
              ? t("lifestyle.metrics.noData")
              : t("lifestyle.metrics.scale5", { n: formatValue(summary.avgEnergy, 1) })}
          </Metric>
          <Metric label={t("lifestyle.metrics.restingHr")}>
            {summary.avgRestingHr == null
              ? t("lifestyle.metrics.noData")
              : t("lifestyle.metrics.bpm", { n: formatValue(summary.avgRestingHr, 0) })}
          </Metric>
        </SummaryCard>
      </div>

      <IntegrationsCard />

      <p className="mt-3 text-xs text-muted-foreground">{t("lifestyle.aiNote")}</p>

      <div className="mt-4">
        {rows.length === 0 ? (
          <EmptyState
            icon={HeartPulse}
            title={t("lifestyle.emptyTitle")}
            description={t("lifestyle.emptyDescription")}
            action={
              <Button size="sm" onClick={openToday}>
                {t("lifestyle.addFirst")}
              </Button>
            }
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("lifestyle.table.date")}</TableHead>
                    <TableHead>{t("lifestyle.table.sleep")}</TableHead>
                    <TableHead>{t("lifestyle.table.training")}</TableHead>
                    <TableHead>{t("lifestyle.table.stress")}</TableHead>
                    <TableHead>{t("lifestyle.table.energy")}</TableHead>
                    <TableHead>{t("lifestyle.table.notes")}</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{formatDate(r.date)}</TableCell>
                      <TableCell className="tabular-nums">
                        {r.sleepHours == null
                          ? "—"
                          : t("lifestyle.metrics.hours", { n: formatValue(r.sleepHours, 1) })}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {r.trainingMinutes == null ? (
                          "—"
                        ) : (
                          <span>
                            {t("lifestyle.metrics.minutes", { n: String(r.trainingMinutes) })}
                            {r.trainingIntensity && (
                              <span className="ml-1 text-muted-foreground">
                                · {t(`lifestyle.intensity.${r.trainingIntensity}`)}
                              </span>
                            )}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {r.stressLevel == null
                          ? "—"
                          : t("lifestyle.metrics.scale5", { n: String(r.stressLevel) })}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {r.energyLevel == null
                          ? "—"
                          : t("lifestyle.metrics.scale5", { n: String(r.energyLevel) })}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.notes ?? "—"}</TableCell>
                      <TableCell>
                        <RowActions
                          onEdit={() => {
                            setEditing(r);
                            setFormOpen(true);
                          }}
                          onDelete={async () => {
                            const { id: _id, createdAt: _c, ...data } = r;
                            await deleteLifestyleLog(r.id);
                            void reload();
                            toast.showAction(
                              t("toasts.deleted", { name: formatDate(r.date) }),
                              t("common.undo"),
                              async () => {
                                await upsertLifestyleLog(data);
                                void reload();
                              },
                            );
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!showAll && rows.length > 20 && (
                <button
                  onClick={() => setShowAll(true)}
                  className="w-full border-t py-2.5 text-center text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                >
                  {t("symptoms.showAll")} ({rows.length})
                </button>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <LifestyleForm
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

function SummaryCard({
  icon: Icon,
  title,
  summary,
  children,
}: {
  icon: typeof Moon;
  title: string;
  summary: LifestyleSummary;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0 pb-2">
        <Icon className="size-4 text-muted-foreground" />
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {children}
        <p className="pt-1 text-[11px] text-muted-foreground">
          {summary.days === 0
            ? t("lifestyle.noWindowData", { days: String(summary.windowDays) })
            : t("lifestyle.windowNote", {
                days: String(summary.windowDays),
                count: String(summary.days),
              })}
        </p>
      </CardContent>
    </Card>
  );
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums">{children}</span>
    </div>
  );
}

function IntegrationsCard() {
  const { t } = useI18n();
  return (
    <Card className="mt-4 border-dashed bg-muted/30">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-muted-foreground">{t("lifestyle.integrations.title")}</CardTitle>
        <Badge variant="secondary">{t("lifestyle.integrations.comingSoon")}</Badge>
      </CardHeader>
      <CardContent>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("lifestyle.integrations.body")}
        </p>
      </CardContent>
    </Card>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex justify-end gap-0.5">
      <Button variant="ghost" size="iconSm" aria-label={t("common.edit")} onClick={onEdit}>
        <Pencil />
      </Button>
      <Button
        variant="ghost"
        size="iconSm"
        className="text-destructive"
        aria-label={t("common.delete")}
        onClick={onDelete}
      >
        <Trash2 />
      </Button>
    </div>
  );
}

function LifestyleForm({
  open,
  editing,
  profileId,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: LifestyleLog | null;
  profileId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [date, setDate] = React.useState(todayISO());
  const [sleepHours, setSleepHours] = React.useState("");
  const [sleepQuality, setSleepQuality] = React.useState("");
  const [trainingMinutes, setTrainingMinutes] = React.useState("");
  const [trainingIntensity, setTrainingIntensity] = React.useState<"" | Intensity>("");
  const [steps, setSteps] = React.useState("");
  const [restingHeartRate, setRestingHeartRate] = React.useState("");
  const [stressLevel, setStressLevel] = React.useState("");
  const [energyLevel, setEnergyLevel] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setDate(editing?.date ?? todayISO());
    setSleepHours(editing?.sleepHours != null ? String(editing.sleepHours) : "");
    setSleepQuality(editing?.sleepQuality != null ? String(editing.sleepQuality) : "");
    setTrainingMinutes(editing?.trainingMinutes != null ? String(editing.trainingMinutes) : "");
    setTrainingIntensity(editing?.trainingIntensity ?? "");
    setSteps(editing?.steps != null ? String(editing.steps) : "");
    setRestingHeartRate(editing?.restingHeartRate != null ? String(editing.restingHeartRate) : "");
    setStressLevel(editing?.stressLevel != null ? String(editing.stressLevel) : "");
    setEnergyLevel(editing?.energyLevel != null ? String(editing.energyLevel) : "");
    setNotes(editing?.notes ?? "");
  }, [open, editing]);

  const valid = date !== "";

  const scaleOptions = [
    { value: "", label: t("lifestyle.fields.notSet") },
    ...(["1", "2", "3", "4", "5"] as const).map((n) => ({
      value: n,
      label: t(`lifestyle.scale.${n}`),
    })),
  ];

  const intensityOptions = [
    { value: "", label: t("lifestyle.fields.notSet") },
    { value: "light", label: t("lifestyle.intensity.light") },
    { value: "moderate", label: t("lifestyle.intensity.moderate") },
    { value: "intense", label: t("lifestyle.intensity.intense") },
  ];

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const data: NewLifestyleLog = {
        profileId,
        date,
        source: "manual",
        sleepHours: parseNumeric(sleepHours),
        sleepQuality: parseNumeric(sleepQuality),
        trainingMinutes: parseNumeric(trainingMinutes),
        trainingIntensity: trainingIntensity || null,
        steps: parseNumeric(steps),
        restingHeartRate: parseNumeric(restingHeartRate),
        stressLevel: parseNumeric(stressLevel),
        energyLevel: parseNumeric(energyLevel),
        notes: notes.trim() || null,
      };
      await upsertLifestyleLog(data);
      onSaved();
      toast.show(t("toasts.saved"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? t("lifestyle.dialog.titleEdit") : t("lifestyle.dialog.titleAdd")}
      onSubmit={save}
      submitDisabled={saving || !valid}
      guardUnsaved
    >
      <div className="grid gap-3">
        <Field label={t("lifestyle.fields.date")}>
          <DateInput value={date} onChange={setDate} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("lifestyle.fields.sleepHours")}>
            <Input
              type="number"
              step="any"
              value={sleepHours}
              onChange={(e) => setSleepHours(e.target.value)}
            />
          </Field>
          <Field label={t("lifestyle.fields.sleepQuality")}>
            <SelectMenu value={sleepQuality} onChange={setSleepQuality} options={scaleOptions} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("lifestyle.fields.trainingMinutes")}>
            <Input
              type="number"
              value={trainingMinutes}
              onChange={(e) => setTrainingMinutes(e.target.value)}
            />
          </Field>
          <Field label={t("lifestyle.fields.trainingIntensity")}>
            <SelectMenu
              value={trainingIntensity || null}
              onChange={(v) => setTrainingIntensity(v as "" | Intensity)}
              options={intensityOptions}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("lifestyle.fields.steps")}>
            <Input type="number" value={steps} onChange={(e) => setSteps(e.target.value)} />
          </Field>
          <Field label={t("lifestyle.fields.restingHeartRate")}>
            <Input
              type="number"
              value={restingHeartRate}
              onChange={(e) => setRestingHeartRate(e.target.value)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("lifestyle.fields.stressLevel")}>
            <SelectMenu value={stressLevel} onChange={setStressLevel} options={scaleOptions} />
          </Field>
          <Field label={t("lifestyle.fields.energyLevel")}>
            <SelectMenu value={energyLevel} onChange={setEnergyLevel} options={scaleOptions} />
          </Field>
        </div>
        <Field label={t("lifestyle.fields.notesOptional")}>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className={cn("mt-1 flex justify-end gap-2")}>
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
