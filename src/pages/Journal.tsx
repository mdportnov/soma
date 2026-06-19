import * as React from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  HeartPulse,
  Pencil,
  Plus,
  Scale,
  Stethoscope,
  Target,
  Trash2,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import {
  createBpEntry,
  createSymptomEntry,
  createWeightEntry,
  deleteBpEntry,
  deleteSymptomEntry,
  deleteWeightEntry,
  getProfile,
  listBpLog,
  listSymptomLog,
  listSymptomNames,
  listWeightLog,
  updateBpEntry,
  updateSymptomEntry,
  updateWeightEntry,
} from "@/db/repos";
import type { BpLog, SymptomLog, WeightLog } from "@/db/schema";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JournalOverview } from "@/components/charts/JournalOverview";
import { WeightGoalDialog } from "@/components/app/WeightGoalDialog";
import { buildWeightSeries, readWeightGoal, type WeightGoal } from "@/lib/weightGoal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, formatDate, formatValue, todayISO } from "@/lib/utils";
import { kgToLb, lbToKg, type UnitSystem } from "@/lib/units";
import { isCrisis, isStage2 } from "@/lib/vitals";
import { useToast } from "@/components/app/Toast";
import { useI18n } from "@/lib/i18n";

type Tab = "overview" | "weight" | "bp" | "symptoms";
const TABS: Tab[] = ["overview", "weight", "bp", "symptoms"];
const DAY = 86400000;
const SYS_C = "#dc2626";
const DIA_C = "#2563eb";

function tsOf(iso: string): number {
  return new Date(`${iso.slice(0, 10)}T00:00:00`).getTime();
}

export function Journal() {
  const { profileId } = useApp();
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab");
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : "overview";

  const setTab = (next: Tab) => {
    const p = new URLSearchParams(params);
    p.set("tab", next);
    setParams(p, { replace: true });
  };

  const {
    data: profile,
    loading,
    reload: reloadProfile,
  } = useQuery(() => getProfile(profileId), [profileId]);
  const [goalOpen, setGoalOpen] = React.useState(false);
  if (loading || !profile) return <Loading />;
  const unitSystem: UnitSystem = profile.unitSystem ?? "metric";
  const goal = readWeightGoal(profile);

  return (
    <>
      <PageHeader
        title={t("journal.title")}
        description={t("journal.description")}
        actions={
          <div className="flex rounded-lg border p-0.5">
            {TABS.map((tb) => (
              <Button
                key={tb}
                variant={tab === tb ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2.5"
                onClick={() => setTab(tb)}
              >
                {t(`journal.tabs.${tb}`)}
              </Button>
            ))}
          </div>
        }
      />

      {tab === "overview" && (
        <JournalOverview
          profileId={profileId}
          unitSystem={unitSystem}
          targetWeightKg={profile.targetWeightKg}
          goal={goal}
          onOpenTab={setTab}
          onEditGoal={() => setGoalOpen(true)}
        />
      )}
      {tab === "weight" && (
        <WeightTab
          profileId={profileId}
          unitSystem={unitSystem}
          targetWeightKg={profile.targetWeightKg}
          goal={goal}
          onEditGoal={() => setGoalOpen(true)}
        />
      )}
      {tab === "bp" && <BpTab profileId={profileId} />}
      {tab === "symptoms" && <SymptomsTab profileId={profileId} />}

      <WeightGoalDialog
        open={goalOpen}
        profileId={profileId}
        unitSystem={unitSystem}
        onClose={() => setGoalOpen(false)}
        onSaved={() => {
          setGoalOpen(false);
          void reloadProfile();
        }}
      />
    </>
  );
}

// ── Weight ───────────────────────────────────────────────────────────────────

function WeightTab({
  profileId,
  unitSystem,
  targetWeightKg,
  goal,
  onEditGoal,
}: {
  profileId: number;
  unitSystem: UnitSystem;
  targetWeightKg: number | null;
  goal: WeightGoal | null;
  onEditGoal: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const { data: rows, loading, reload } = useQuery(() => listWeightLog(profileId), [profileId]);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<WeightLog | null>(null);
  const [showAll, setShowAll] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // With a dated goal the x-axis runs forward to the deadline; widen the canvas
  // (~px per day) and scroll to the right edge so "now → target" is in view,
  // leaving the past reachable by scrolling left.
  const goalActive = goal != null;
  React.useEffect(() => {
    if (goalActive && scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [goalActive, rows]);

  if (loading || !rows) return <Loading />;

  const imperial = unitSystem === "imperial";
  const unitLabel = imperial ? "lb" : "kg";
  const toDisplay = (kg: number) => (imperial ? kgToLb(kg) : kg);

  const chartData = buildWeightSeries({ actual: rows, goal, toDisplay });
  const tsList = chartData.map((p) => p.t);
  const minTs = tsList.length ? Math.min(...tsList) : tsOf(todayISO());
  const maxTs = tsList.length ? Math.max(...tsList) : minTs;
  const spanDays = Math.max(1, (maxTs - minTs) / DAY);
  const chartWidth = goalActive ? Math.round(spanDays * 2.5) : null;
  const todayTs = tsOf(todayISO());
  const goalTargetDisplay = goal ? toDisplay(goal.targetKg) : null;
  const targetDisplay = targetWeightKg != null ? toDisplay(targetWeightKg) : null;

  const visible = showAll ? rows : rows.slice(0, 20);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={openNew}>
          <Plus /> {t("weight.logWeight")}
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Scale}
          title={t("weight.emptyTitle")}
          description={t("weight.emptyDescription")}
          action={
            <Button size="sm" onClick={openNew}>
              {t("weight.addFirst")}
            </Button>
          }
        />
      ) : (
        <>
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle>{t("weight.chartTitle")}</CardTitle>
              <GoalButton
                goal={goal}
                unitLabel={unitLabel}
                toDisplay={toDisplay}
                onClick={onEditGoal}
              />
            </CardHeader>
            <CardContent>
              <div ref={scrollRef} className="overflow-x-auto">
                <div
                  className="h-60"
                  style={chartWidth != null ? { width: chartWidth, minWidth: "100%" } : undefined}
                >
                  <ResponsiveContainer>
                    <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--border)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="t"
                        type="number"
                        domain={goalActive ? [minTs, maxTs] : ["dataMin", "dataMax"]}
                        scale="time"
                        allowDataOverflow
                        tickFormatter={(v) => formatDate(new Date(v).toISOString())}
                        stroke="var(--muted-foreground)"
                        fontSize={11}
                        tickLine={false}
                        axisLine={{ stroke: "var(--border)" }}
                      />
                      <YAxis
                        domain={["auto", "auto"]}
                        stroke="var(--muted-foreground)"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        width={48}
                        tickFormatter={(v) => formatValue(v)}
                      />
                      {goal && goalTargetDisplay != null ? (
                        <>
                          {todayTs >= minTs && todayTs <= maxTs && (
                            <ReferenceLine
                              x={todayTs}
                              stroke="var(--muted-foreground)"
                              strokeDasharray="2 3"
                              label={{
                                value: t("weightGoal.today"),
                                position: "insideTopRight",
                                fill: "var(--muted-foreground)",
                                fontSize: 10,
                              }}
                            />
                          )}
                          <Line
                            type="linear"
                            dataKey="plan"
                            stroke="var(--success)"
                            strokeWidth={1.5}
                            strokeDasharray="5 4"
                            dot={false}
                            connectNulls
                            isAnimationActive={false}
                          />
                          <ReferenceDot
                            x={tsOf(goal.targetDate)}
                            y={goalTargetDisplay}
                            r={4}
                            fill="var(--success)"
                            stroke="var(--card)"
                            strokeWidth={2}
                            label={{
                              value: `${formatValue(goalTargetDisplay, 1)} ${unitLabel}`,
                              position: "top",
                              fill: "var(--success)",
                              fontSize: 11,
                            }}
                          />
                        </>
                      ) : (
                        targetDisplay != null && (
                          <ReferenceLine
                            y={targetDisplay}
                            stroke="var(--success)"
                            strokeDasharray="5 4"
                            label={{
                              value: t("weight.targetLabel"),
                              position: "right",
                              fill: "var(--success)",
                              fontSize: 10,
                            }}
                          />
                        )
                      )}
                      <Tooltip
                        cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const p = payload[0].payload as (typeof chartData)[number];
                          if (p.value == null && p.plan == null) return null;
                          return (
                            <div className="rounded-lg border bg-card px-3 py-2 text-xs shadow-md">
                              {p.value != null && (
                                <p className="font-medium tabular-nums">
                                  {formatValue(p.value, 1)} {unitLabel}
                                </p>
                              )}
                              {p.plan != null && (
                                <p className="tabular-nums" style={{ color: "var(--success)" }}>
                                  {t("weightGoal.planLabel")}: {formatValue(p.plan, 1)} {unitLabel}
                                </p>
                              )}
                              <p className="text-muted-foreground">{formatDate(p.date)}</p>
                            </div>
                          );
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="var(--primary)"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        connectNulls
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("weight.table.date")}</TableHead>
                    <TableHead>{t("weight.table.weight")}</TableHead>
                    <TableHead>{t("weight.table.notes")}</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{formatDate(r.date)}</TableCell>
                      <TableCell className="font-medium tabular-nums">
                        {formatValue(toDisplay(r.weightKg))} {unitLabel}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.notes ?? "—"}</TableCell>
                      <TableCell>
                        <RowActions
                          onEdit={() => {
                            setEditing(r);
                            setFormOpen(true);
                          }}
                          onDelete={async () => {
                            const { id: _id, ...data } = r;
                            await deleteWeightEntry(r.id);
                            void reload();
                            toast.showAction(
                              t("toasts.deleted", { name: t("journal.tabs.weight") }),
                              t("common.undo"),
                              async () => {
                                await createWeightEntry(data);
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
                <ShowAll count={rows.length} onClick={() => setShowAll(true)} />
              )}
            </CardContent>
          </Card>
        </>
      )}

      <WeightForm
        open={formOpen}
        editing={editing}
        profileId={profileId}
        unitLabel={unitLabel}
        imperial={imperial}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          void reload();
        }}
      />
    </>
  );
}

function WeightForm({
  open,
  editing,
  profileId,
  unitLabel,
  imperial,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: WeightLog | null;
  profileId: number;
  unitLabel: string;
  imperial: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [date, setDate] = React.useState(todayISO());
  const toast = useToast();
  const [weight, setWeight] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setDate(editing?.date ?? todayISO());
    setWeight(
      editing?.weightKg != null
        ? String(Math.round((imperial ? kgToLb(editing.weightKg) : editing.weightKg) * 10) / 10)
        : "",
    );
    setNotes(editing?.notes ?? "");
  }, [open, editing, imperial]);

  const valid = date && weight.trim() !== "" && Number.isFinite(Number(weight));

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const n = Number(weight);
      const data = {
        profileId,
        date,
        weightKg: imperial ? lbToKg(n) : n,
        notes: notes.trim() || null,
      };
      if (editing) await updateWeightEntry(editing.id, data);
      else await createWeightEntry(data);
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
      title={editing ? t("weight.dialog.titleEdit") : t("weight.dialog.titleAdd")}
      onSubmit={save}
      submitDisabled={saving || !valid}
    >
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("weight.table.date")}>
            <DateInput value={date} onChange={setDate} />
          </Field>
          <Field label={`${t("weight.fields.weight")} (${unitLabel})`}>
            <Input
              type="number"
              step="any"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </Field>
        </div>
        <Field label={t("weight.fields.notesOptional")}>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <DialogActions
          editing={!!editing}
          saving={saving}
          valid={!!valid}
          onClose={onClose}
          onSave={save}
        />
      </div>
    </Dialog>
  );
}

// ── Blood pressure ───────────────────────────────────────────────────────────

function BpTab({ profileId }: { profileId: number }) {
  const { t } = useI18n();
  const toast = useToast();
  const { data: rows, loading, reload } = useQuery(() => listBpLog(profileId), [profileId]);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<BpLog | null>(null);
  const [showAll, setShowAll] = React.useState(false);
  const [now] = React.useState(() => Date.now());

  if (loading || !rows) return <Loading />;

  const chartData = [...rows]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({ t: tsOf(r.date), date: r.date, sys: r.systolic, dia: r.diastolic }));

  const sevenDaysAgo = now - 7 * DAY;
  const hasRecentCrisis = rows.some(
    (r) => tsOf(r.date) >= sevenDaysAgo && isCrisis(r.systolic, r.diastolic),
  );

  const visible = showAll ? rows : rows.slice(0, 20);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={openNew}>
          <Plus /> {t("bp.logReading")}
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={HeartPulse}
          title={t("bp.emptyTitle")}
          description={t("bp.emptyDescription")}
          action={
            <Button size="sm" onClick={openNew}>
              {t("bp.addFirst")}
            </Button>
          }
        />
      ) : (
        <>
          {hasRecentCrisis && (
            <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p>{t("bp.crisisBanner")}</p>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{t("bp.chartTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-60 w-full">
                <ResponsiveContainer>
                  <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="t"
                      type="number"
                      domain={["dataMin", "dataMax"]}
                      scale="time"
                      tickFormatter={(v) => formatDate(new Date(v).toISOString())}
                      stroke="var(--muted-foreground)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: "var(--border)" }}
                    />
                    <YAxis
                      domain={[40, 200]}
                      stroke="var(--muted-foreground)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      width={48}
                    />
                    <ReferenceArea y1={140} y2={180} fill="#f59e0b" fillOpacity={0.08} />
                    <ReferenceArea y1={180} y2={200} fill="#dc2626" fillOpacity={0.1} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0].payload as (typeof chartData)[number];
                        return (
                          <div className="rounded-lg border bg-card px-3 py-2 text-xs shadow-md">
                            <p className="font-medium tabular-nums">
                              {p.sys}/{p.dia}
                            </p>
                            <p className="text-muted-foreground">{formatDate(p.date)}</p>
                          </div>
                        );
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="sys"
                      name={t("bp.systolic")}
                      stroke={SYS_C}
                      strokeWidth={2}
                      dot={{ r: 2.5 }}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="dia"
                      name={t("bp.diastolic")}
                      stroke={DIA_C}
                      strokeWidth={2}
                      dot={{ r: 2.5 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("bp.table.date")}</TableHead>
                    <TableHead>{t("bp.table.time")}</TableHead>
                    <TableHead>{t("bp.table.reading")}</TableHead>
                    <TableHead>{t("bp.table.pulse")}</TableHead>
                    <TableHead>{t("bp.table.status")}</TableHead>
                    <TableHead>{t("bp.table.notes")}</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{formatDate(r.date)}</TableCell>
                      <TableCell className="text-muted-foreground">{r.time ?? "—"}</TableCell>
                      <TableCell className="font-medium tabular-nums">
                        {r.systolic}/{r.diastolic}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {r.heartRateBpm ?? "—"}
                      </TableCell>
                      <TableCell>
                        {isCrisis(r.systolic, r.diastolic) ? (
                          <Badge variant="destructive">{t("bp.status.crisis")}</Badge>
                        ) : isStage2(r.systolic, r.diastolic) ? (
                          <Badge variant="warning">{t("bp.status.stage2")}</Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.notes ?? "—"}</TableCell>
                      <TableCell>
                        <RowActions
                          onEdit={() => {
                            setEditing(r);
                            setFormOpen(true);
                          }}
                          onDelete={async () => {
                            const { id: _id, ...data } = r;
                            await deleteBpEntry(r.id);
                            void reload();
                            toast.showAction(
                              t("toasts.deleted", { name: t("journal.tabs.bp") }),
                              t("common.undo"),
                              async () => {
                                await createBpEntry(data);
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
                <ShowAll count={rows.length} onClick={() => setShowAll(true)} />
              )}
            </CardContent>
          </Card>
        </>
      )}

      <BpForm
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

function BpForm({
  open,
  editing,
  profileId,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: BpLog | null;
  profileId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [date, setDate] = React.useState(todayISO());
  const [time, setTime] = React.useState("");
  const toast = useToast();
  const [systolic, setSystolic] = React.useState("");
  const [diastolic, setDiastolic] = React.useState("");
  const [heartRate, setHeartRate] = React.useState("");
  const [position, setPosition] = React.useState<"" | "sitting" | "standing" | "supine">("");
  const [arm, setArm] = React.useState<"" | "left" | "right">("");
  const [notes, setNotes] = React.useState("");
  const [sysTouched, setSysTouched] = React.useState(false);
  const [diaTouched, setDiaTouched] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setDate(editing?.date ?? todayISO());
    setTime(editing?.time ?? "");
    setSystolic(editing?.systolic != null ? String(editing.systolic) : "");
    setDiastolic(editing?.diastolic != null ? String(editing.diastolic) : "");
    setHeartRate(editing?.heartRateBpm != null ? String(editing.heartRateBpm) : "");
    setPosition(editing?.position ?? "");
    setArm(editing?.armSide ?? "");
    setNotes(editing?.notes ?? "");
    setSysTouched(false);
    setDiaTouched(false);
  }, [open, editing]);

  const sysNum = Number(systolic);
  const diaNum = Number(diastolic);
  const valid =
    date &&
    systolic.trim() !== "" &&
    diastolic.trim() !== "" &&
    Number.isFinite(sysNum) &&
    Number.isFinite(diaNum);
  const sysCrisis = sysTouched && Number.isFinite(sysNum) && sysNum > 180;
  const diaCrisis = diaTouched && Number.isFinite(diaNum) && diaNum > 120;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const data = {
        profileId,
        date,
        time: time.trim() || null,
        systolic: sysNum,
        diastolic: diaNum,
        heartRateBpm: heartRate.trim() ? Number(heartRate) : null,
        position: position || null,
        armSide: arm || null,
        notes: notes.trim() || null,
      };
      if (editing) await updateBpEntry(editing.id, data);
      else await createBpEntry(data);
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
      title={editing ? t("bp.dialog.titleEdit") : t("bp.dialog.titleAdd")}
      onSubmit={save}
      submitDisabled={saving || !valid}
    >
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("bp.table.date")}>
            <DateInput value={date} onChange={setDate} />
          </Field>
          <Field label={t("bp.fields.timeOptional")}>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label={t("bp.fields.systolic")}>
            <Input
              type="number"
              value={systolic}
              onChange={(e) => setSystolic(e.target.value)}
              onBlur={() => setSysTouched(true)}
            />
            {sysCrisis && (
              <p className="text-[11px] text-amber-600 dark:text-amber-500">{t("bp.crisisHint")}</p>
            )}
          </Field>
          <Field label={t("bp.fields.diastolic")}>
            <Input
              type="number"
              value={diastolic}
              onChange={(e) => setDiastolic(e.target.value)}
              onBlur={() => setDiaTouched(true)}
            />
            {diaCrisis && (
              <p className="text-[11px] text-amber-600 dark:text-amber-500">{t("bp.crisisHint")}</p>
            )}
          </Field>
          <Field label={t("bp.fields.heartRate")}>
            <Input type="number" value={heartRate} onChange={(e) => setHeartRate(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("bp.fields.position")}>
            <SelectMenu
              value={position || null}
              onChange={(v) => setPosition(v as typeof position)}
              options={[
                { value: "", label: "—" },
                { value: "sitting", label: t("bp.position.sitting") },
                { value: "standing", label: t("bp.position.standing") },
                { value: "supine", label: t("bp.position.supine") },
              ]}
            />
          </Field>
          <Field label={t("bp.fields.arm")}>
            <SelectMenu
              value={arm || null}
              onChange={(v) => setArm(v as typeof arm)}
              options={[
                { value: "", label: "—" },
                { value: "left", label: t("bp.arm.left") },
                { value: "right", label: t("bp.arm.right") },
              ]}
            />
          </Field>
        </div>
        <Field label={t("bp.fields.notesOptional")}>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <DialogActions
          editing={!!editing}
          saving={saving}
          valid={!!valid}
          onClose={onClose}
          onSave={save}
        />
      </div>
    </Dialog>
  );
}

// ── Symptoms ─────────────────────────────────────────────────────────────────

function severityColor(s: number): string {
  if (s >= 7) return "#dc2626";
  if (s >= 4) return "#d97706";
  return "#16a34a";
}

function SymptomsTab({ profileId }: { profileId: number }) {
  const { t } = useI18n();
  const toast = useToast();
  const { data, loading, reload } = useQuery(async () => {
    const [rows, names] = await Promise.all([
      listSymptomLog(profileId),
      listSymptomNames(profileId),
    ]);
    return { rows, names };
  }, [profileId]);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<SymptomLog | null>(null);
  const [severeOnly, setSevereOnly] = React.useState(false);
  const [showAll, setShowAll] = React.useState(false);

  if (loading || !data) return <Loading />;
  const { rows, names } = data;

  const filtered = severeOnly ? rows.filter((r) => r.severity >= 6) : rows;
  const visible = showAll ? filtered : filtered.slice(0, 20);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          onClick={() => setSevereOnly((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {severeOnly ? t("symptoms.showAll") : t("symptoms.thresholdLabel", { n: "6" })}
        </button>
        <Button onClick={openNew}>
          <Plus /> {t("symptoms.logSymptom")}
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Stethoscope}
          title={t("symptoms.emptyTitle")}
          description={t("symptoms.emptyDescription")}
          action={
            <Button size="sm" onClick={openNew}>
              {t("symptoms.addFirst")}
            </Button>
          }
        />
      ) : (
        <>
          <Card>
            <CardContent className="py-4">
              <SymptomStrip rows={filtered} />
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("symptoms.table.date")}</TableHead>
                    <TableHead>{t("symptoms.table.time")}</TableHead>
                    <TableHead>{t("symptoms.table.symptom")}</TableHead>
                    <TableHead>{t("symptoms.table.severity")}</TableHead>
                    <TableHead>{t("symptoms.table.notes")}</TableHead>
                    <TableHead className="w-20" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{formatDate(r.date)}</TableCell>
                      <TableCell className="text-muted-foreground">{r.time ?? "—"}</TableCell>
                      <TableCell className="font-medium">{r.symptomName}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 tabular-nums">
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: severityColor(r.severity) }}
                          />
                          {r.severity}
                        </span>
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
                            await deleteSymptomEntry(r.id);
                            void reload();
                            toast.showAction(
                              t("toasts.deleted", { name: r.symptomName }),
                              t("common.undo"),
                              async () => {
                                await createSymptomEntry(data);
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
              {!showAll && filtered.length > 20 && (
                <ShowAll count={filtered.length} onClick={() => setShowAll(true)} />
              )}
            </CardContent>
          </Card>
        </>
      )}

      <SymptomForm
        open={formOpen}
        editing={editing}
        profileId={profileId}
        names={names}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          void reload();
        }}
      />
    </>
  );
}

function SymptomStrip({ rows }: { rows: SymptomLog[] }) {
  const byDate = new Map<string, SymptomLog[]>();
  for (const r of rows) {
    const list = byDate.get(r.date) ?? [];
    list.push(r);
    byDate.set(r.date, list);
  }
  const days = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (days.length === 0) return null;

  return (
    <div className="relative h-20 w-full">
      <div className="flex h-full items-end gap-1 overflow-x-auto pb-5">
        {days.map(([date, items]) => {
          const sorted = [...items].sort((a, b) => b.severity - a.severity);
          const shown = sorted.slice(0, 3);
          const extra = sorted.length - shown.length;
          return (
            <div key={date} className="flex shrink-0 flex-col items-center" style={{ width: 28 }}>
              <div className="flex flex-1 flex-col-reverse items-center justify-start gap-1 pb-1">
                {shown.map((s) => (
                  <span
                    key={s.id}
                    className="size-2 rounded-full"
                    style={{ backgroundColor: severityColor(s.severity) }}
                    title={`${s.symptomName} · ${s.severity}`}
                  />
                ))}
                {extra > 0 && (
                  <span className="text-[9px] leading-none text-muted-foreground">+{extra}</span>
                )}
              </div>
              <span className="absolute bottom-0 text-[10px] text-muted-foreground">
                {new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SymptomForm({
  open,
  editing,
  profileId,
  names,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: SymptomLog | null;
  profileId: number;
  names: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [symptomName, setSymptomName] = React.useState("");
  const [date, setDate] = React.useState(todayISO());
  const [time, setTime] = React.useState("");
  const [severity, setSeverity] = React.useState("5");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setSymptomName(editing?.symptomName ?? "");
    setDate(editing?.date ?? todayISO());
    setTime(editing?.time ?? "");
    setSeverity(editing?.severity != null ? String(editing.severity) : "5");
    setNotes(editing?.notes ?? "");
  }, [open, editing]);

  const valid = symptomName.trim() !== "" && date;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const data = {
        profileId,
        symptomName: symptomName.trim(),
        date,
        time: time.trim() || null,
        severity: Number(severity),
        notes: notes.trim() || null,
      };
      if (editing) await updateSymptomEntry(editing.id, data);
      else await createSymptomEntry(data);
      onSaved();
      toast.show(t(editing ? "toasts.updated" : "toasts.added", { name: data.symptomName }));
    } finally {
      setSaving(false);
    }
  };

  const nameOptions = names.map((n) => ({
    value: n,
    label: n,
    group: t("symptoms.previouslyLogged"),
  }));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? t("symptoms.dialog.titleEdit") : t("symptoms.dialog.titleAdd")}
      onSubmit={save}
      submitDisabled={saving || !valid}
    >
      <div className="grid gap-3">
        <Field label={t("symptoms.fields.symptomName")}>
          <Combobox
            value={symptomName || null}
            onChange={setSymptomName}
            options={nameOptions}
            placeholder={t("symptoms.namePlaceholder")}
            allowCustom
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("symptoms.table.date")}>
            <DateInput value={date} onChange={setDate} />
          </Field>
          <Field label={t("symptoms.fields.timeOptional")}>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <Field label={t("symptoms.fields.severity")}>
          <SelectMenu
            value={severity}
            onChange={setSeverity}
            options={Array.from({ length: 10 }, (_, i) => String(i + 1)).map((n) => ({
              value: n,
              label: t(`symptomSeverity.${n}`),
            }))}
          />
        </Field>
        <Field label={t("symptoms.fields.notesOptional")}>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <DialogActions
          editing={!!editing}
          saving={saving}
          valid={!!valid}
          onClose={onClose}
          onSave={save}
        />
      </div>
    </Dialog>
  );
}

// ── shared bits ──────────────────────────────────────────────────────────────

function GoalButton({
  goal,
  unitLabel,
  toDisplay,
  onClick,
}: {
  goal: WeightGoal | null;
  unitLabel: string;
  toDisplay: (kg: number) => number;
  onClick: () => void;
}) {
  const { t } = useI18n();
  return (
    <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={onClick}>
      <Target className="size-3.5" />
      {goal ? (
        <span className="tabular-nums">
          {formatValue(toDisplay(goal.targetKg), 1)} {unitLabel} · {formatDate(goal.targetDate)}
        </span>
      ) : (
        t("weightGoal.set")
      )}
    </Button>
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

function ShowAll({ count, onClick }: { count: number; onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button
      onClick={onClick}
      className="w-full border-t py-2.5 text-center text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground"
    >
      {t("symptoms.showAll")} ({count})
    </button>
  );
}

function DialogActions({
  editing,
  saving,
  valid,
  onClose,
  onSave,
}: {
  editing: boolean;
  saving: boolean;
  valid: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className={cn("mt-1 flex justify-end gap-2")}>
      <Button variant="outline" onClick={onClose}>
        {t("common.cancel")}
      </Button>
      <Button onClick={onSave} disabled={saving || !valid}>
        {editing ? t("common.saveChanges") : t("common.add")}
      </Button>
    </div>
  );
}
