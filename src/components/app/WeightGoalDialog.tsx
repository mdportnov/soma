import * as React from "react";
import { Trash2 } from "lucide-react";
import { getProfile, listWeightLog, updateProfile } from "@/db/repos";
import type { Profile } from "@/db/schema";
import { Field } from "@/components/app/Field";
import { useToast } from "@/components/app/Toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Dialog } from "@/components/ui/dialog";
import { kgToLb, lbToKg, type UnitSystem } from "@/lib/units";
import { readWeightGoal } from "@/lib/weightGoal";
import { todayISO } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const DAY = 86400000;

function plusDaysISO(iso: string, days: number): string {
  return new Date(new Date(`${iso}T00:00:00`).getTime() + days * DAY).toISOString().slice(0, 10);
}

/**
 * Sets or clears the weight goal (target weight + deadline, plus a fixed start
 * anchor). Self-contained: when opened it reads the current goal off the
 * profile and prefills the start from the latest weigh-in. Used from both the
 * Journal overview and the Weight tab; on save it asks the parent to reload the
 * profile so the projection redraws.
 */
export function WeightGoalDialog({
  open,
  profileId,
  unitSystem,
  onClose,
  onSaved,
}: {
  open: boolean;
  profileId: number;
  unitSystem: UnitSystem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const imperial = unitSystem === "imperial";
  const unitLabel = imperial ? "lb" : "kg";
  const toDisplay = (kg: number) => Math.round((imperial ? kgToLb(kg) : kg) * 10) / 10;
  const toKg = (n: number) => (imperial ? lbToKg(n) : n);

  const [startDate, setStartDate] = React.useState(todayISO());
  const [startWeight, setStartWeight] = React.useState("");
  const [targetWeight, setTargetWeight] = React.useState("");
  const [targetDate, setTargetDate] = React.useState("");
  const [hadGoal, setHadGoal] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const [profile, rows] = await Promise.all([getProfile(profileId), listWeightLog(profileId)]);
      if (cancelled || !profile) return;
      const goal = readWeightGoal(profile);
      const latestKg = rows[0]?.weightKg ?? profile.weightKg ?? null;
      setHadGoal(goal != null);
      setStartDate(goal?.startDate ?? todayISO());
      setStartWeight(
        goal != null
          ? String(toDisplay(goal.startKg))
          : latestKg != null
            ? String(toDisplay(latestKg))
            : "",
      );
      setTargetWeight(goal != null ? String(toDisplay(goal.targetKg)) : "");
      setTargetDate(goal?.targetDate ?? plusDaysISO(todayISO(), 90));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, profileId, imperial]);

  const startNum = Number(startWeight);
  const targetNum = Number(targetWeight);
  const valid =
    startWeight.trim() !== "" &&
    targetWeight.trim() !== "" &&
    Number.isFinite(startNum) &&
    Number.isFinite(targetNum) &&
    startNum > 0 &&
    targetNum > 0 &&
    !!startDate &&
    !!targetDate &&
    new Date(`${targetDate}T00:00:00`).getTime() > new Date(`${startDate}T00:00:00`).getTime();

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await updateProfile(profileId, {
        targetWeightKg: toKg(targetNum),
        targetWeightDate: targetDate,
        targetWeightStartDate: startDate,
        targetWeightStartKg: toKg(startNum),
      } satisfies Partial<Profile>);
      toast.show(t("toasts.saved"));
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await updateProfile(profileId, {
        targetWeightKg: null,
        targetWeightDate: null,
        targetWeightStartDate: null,
        targetWeightStartKg: null,
      });
      toast.show(t("weightGoal.removedToast"));
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={hadGoal ? t("weightGoal.titleEdit") : t("weightGoal.titleAdd")}
      description={t("weightGoal.description")}
      onSubmit={save}
      submitDisabled={saving || !valid}
    >
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={`${t("weightGoal.startWeight")} (${unitLabel})`}>
            <Input
              type="number"
              step="any"
              value={startWeight}
              onChange={(e) => setStartWeight(e.target.value)}
            />
          </Field>
          <Field label={t("weightGoal.startDate")}>
            <DateInput value={startDate} onChange={setStartDate} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`${t("weightGoal.targetWeight")} (${unitLabel})`}>
            <Input
              type="number"
              step="any"
              value={targetWeight}
              onChange={(e) => setTargetWeight(e.target.value)}
            />
          </Field>
          <Field label={t("weightGoal.targetDate")}>
            <DateInput value={targetDate} onChange={setTargetDate} />
          </Field>
        </div>

        <div className="mt-1 flex items-center justify-between gap-2">
          {hadGoal ? (
            <Button variant="ghost" size="sm" className="text-destructive" onClick={remove}>
              <Trash2 /> {t("weightGoal.remove")}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button onClick={save} disabled={saving || !valid}>
              {hadGoal ? t("common.saveChanges") : t("weightGoal.save")}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
