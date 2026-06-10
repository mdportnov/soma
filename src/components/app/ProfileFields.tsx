import * as React from "react";
import { Field } from "@/components/app/Field";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n";
import { cmToFtIn, ftInToCm, kgToLb, lbToKg, type UnitSystem } from "@/lib/units";
import type { ProfileUpdate } from "@/db/repos";
import type { Profile } from "@/db/schema";

/** String-based draft so empty form controls map cleanly to nullable columns. */
export type ProfileDraft = {
  name: string;
  birthDate: string;
  sex: "" | "male" | "female" | "other";
  unitSystem: UnitSystem;
  heightCm: number | null;
  weightKg: number | null;
  targetWeightKg: number | null;
  bloodType: "" | "A" | "B" | "AB" | "O";
  rhFactor: "" | "positive" | "negative";
  ethnicity: string;
  activityLevel: "" | "sedentary" | "light" | "moderate" | "active" | "very_active";
  smoking: "" | "never" | "former" | "current";
  alcohol: "" | "none" | "occasional" | "moderate" | "heavy";
  conditions: string;
};

export const EMPTY_DRAFT: ProfileDraft = {
  name: "",
  birthDate: "",
  sex: "",
  unitSystem: "metric",
  heightCm: null,
  weightKg: null,
  targetWeightKg: null,
  bloodType: "",
  rhFactor: "",
  ethnicity: "",
  activityLevel: "",
  smoking: "",
  alcohol: "",
  conditions: "",
};

export function draftFromProfile(p: Profile): ProfileDraft {
  return {
    name: p.name ?? "",
    birthDate: p.birthDate ?? "",
    sex: p.sex ?? "",
    unitSystem: p.unitSystem ?? "metric",
    heightCm: p.heightCm ?? null,
    weightKg: p.weightKg ?? null,
    targetWeightKg: p.targetWeightKg ?? null,
    bloodType: p.bloodType ?? "",
    rhFactor: p.rhFactor ?? "",
    ethnicity: p.ethnicity ?? "",
    activityLevel: p.activityLevel ?? "",
    smoking: p.smoking ?? "",
    alcohol: p.alcohol ?? "",
    conditions: p.conditions ?? "",
  };
}

const emptyToNull = (s: string) => (s.trim() ? s.trim() : null);

export function draftToUpdate(d: ProfileDraft): ProfileUpdate {
  return {
    name: d.name.trim() || "My profile",
    birthDate: emptyToNull(d.birthDate),
    sex: (d.sex || null) as ProfileUpdate["sex"],
    unitSystem: d.unitSystem,
    heightCm: d.heightCm,
    weightKg: d.weightKg,
    targetWeightKg: d.targetWeightKg,
    bloodType: (d.bloodType || null) as ProfileUpdate["bloodType"],
    rhFactor: (d.rhFactor || null) as ProfileUpdate["rhFactor"],
    ethnicity: emptyToNull(d.ethnicity),
    activityLevel: (d.activityLevel || null) as ProfileUpdate["activityLevel"],
    smoking: (d.smoking || null) as ProfileUpdate["smoking"],
    alcohol: (d.alcohol || null) as ProfileUpdate["alcohol"],
    conditions: emptyToNull(d.conditions),
  };
}

type Patch = (patch: Partial<ProfileDraft>) => void;

// ── height / weight inputs (unit-aware) ─────────────────────────────────────

function HeightInput({
  cm,
  system,
  onChange,
}: {
  cm: number | null;
  system: UnitSystem;
  onChange: (cm: number | null) => void;
}) {
  const { t } = useI18n();

  if (system === "imperial") {
    const { ft, inches } = cm != null ? cmToFtIn(cm) : { ft: NaN, inches: NaN };
    const setPart = (nextFt: number, nextIn: number) => {
      if (Number.isNaN(nextFt) && Number.isNaN(nextIn)) return onChange(null);
      onChange(ftInToCm(Number.isNaN(nextFt) ? 0 : nextFt, Number.isNaN(nextIn) ? 0 : nextIn));
    };
    return (
      <div className="flex gap-2">
        <Input
          type="number"
          min={0}
          placeholder={t("profile.placeholders.ft")}
          value={Number.isNaN(ft) ? "" : ft}
          onChange={(e) => setPart(e.target.value === "" ? NaN : Number(e.target.value), inches)}
        />
        <Input
          type="number"
          min={0}
          max={11}
          placeholder={t("profile.placeholders.in")}
          value={Number.isNaN(inches) ? "" : inches}
          onChange={(e) => setPart(ft, e.target.value === "" ? NaN : Number(e.target.value))}
        />
      </div>
    );
  }
  return (
    <Input
      type="number"
      min={0}
      placeholder={t("profile.placeholders.cm")}
      value={cm ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
    />
  );
}

function WeightInput({
  kg,
  system,
  placeholder,
  onChange,
}: {
  kg: number | null;
  system: UnitSystem;
  placeholder?: string;
  onChange: (kg: number | null) => void;
}) {
  const { t } = useI18n();
  const imperial = system === "imperial";
  const display = kg == null ? "" : Math.round((imperial ? kgToLb(kg) : kg) * 10) / 10;
  return (
    <Input
      type="number"
      min={0}
      step="0.1"
      placeholder={placeholder ?? (imperial ? t("profile.placeholders.lb") : t("profile.placeholders.kg"))}
      value={display}
      onChange={(e) => {
        if (e.target.value === "") return onChange(null);
        const n = Number(e.target.value);
        onChange(imperial ? lbToKg(n) : n);
      }}
    />
  );
}

// ── grouped field sets ──────────────────────────────────────────────────────

/** Required core fields: name, birth date, sex, height, weight. */
export function CoreFields({ draft, patch }: { draft: ProfileDraft; patch: Patch }) {
  const { t } = useI18n();

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={t("profile.fields.name")}>
        <Input value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
      </Field>
      <Field label={t("profile.fields.dateOfBirth")}>
        <DateInput
          value={draft.birthDate}
          onChange={(birthDate) => patch({ birthDate })}
          defaultMonth={new Date(1990, 0)}
        />
      </Field>
      <Field label={t("profile.fields.biologicalSex")}>
        <Select
          value={draft.sex}
          onChange={(e) => patch({ sex: e.target.value as ProfileDraft["sex"] })}
        >
          <option value="">—</option>
          <option value="male">{t("profile.options.male")}</option>
          <option value="female">{t("profile.options.female")}</option>
          <option value="other">{t("profile.options.otherIntersex")}</option>
        </Select>
      </Field>
      <Field label={t("profile.fields.units")}>
        <Select
          value={draft.unitSystem}
          onChange={(e) => patch({ unitSystem: e.target.value as UnitSystem })}
        >
          <option value="metric">{t("profile.options.metricSystem")}</option>
          <option value="imperial">{t("profile.options.imperialSystem")}</option>
        </Select>
      </Field>
      <Field label={t("profile.fields.height")}>
        <HeightInput
          cm={draft.heightCm}
          system={draft.unitSystem}
          onChange={(cm) => patch({ heightCm: cm })}
        />
      </Field>
      <Field label={t("profile.fields.weight")}>
        <WeightInput
          kg={draft.weightKg}
          system={draft.unitSystem}
          onChange={(kg) => patch({ weightKg: kg })}
        />
      </Field>
    </div>
  );
}

/** Optional fields: blood type, ethnicity, target weight, lifestyle, conditions. */
export function OptionalFields({ draft, patch }: { draft: ProfileDraft; patch: Patch }) {
  const { t } = useI18n();

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={t("profile.fields.bloodGroup")}>
        <Select
          value={draft.bloodType}
          onChange={(e) => patch({ bloodType: e.target.value as ProfileDraft["bloodType"] })}
        >
          <option value="">—</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="AB">AB</option>
          <option value="O">O</option>
        </Select>
      </Field>
      <Field label={t("profile.fields.rhFactor")}>
        <Select
          value={draft.rhFactor}
          onChange={(e) => patch({ rhFactor: e.target.value as ProfileDraft["rhFactor"] })}
        >
          <option value="">—</option>
          <option value="positive">{t("profile.options.positiveRh")}</option>
          <option value="negative">{t("profile.options.negativeRh")}</option>
        </Select>
      </Field>
      <Field label={t("profile.fields.ethnicity")}>
        <Input
          value={draft.ethnicity}
          placeholder={t("profile.placeholders.ethnicity")}
          onChange={(e) => patch({ ethnicity: e.target.value })}
        />
      </Field>
      <Field label={t("profile.fields.targetWeight")}>
        <WeightInput
          kg={draft.targetWeightKg}
          system={draft.unitSystem}
          placeholder={t("profile.placeholders.optional")}
          onChange={(kg) => patch({ targetWeightKg: kg })}
        />
      </Field>
      <Field label={t("profile.fields.activityLevel")}>
        <Select
          value={draft.activityLevel}
          onChange={(e) =>
            patch({ activityLevel: e.target.value as ProfileDraft["activityLevel"] })
          }
        >
          <option value="">—</option>
          <option value="sedentary">{t("profile.options.sedentary")}</option>
          <option value="light">{t("profile.options.lightlyActive")}</option>
          <option value="moderate">{t("profile.options.moderatelyActive")}</option>
          <option value="active">{t("profile.options.active")}</option>
          <option value="very_active">{t("profile.options.veryActive")}</option>
        </Select>
      </Field>
      <Field label={t("profile.fields.smoking")}>
        <Select
          value={draft.smoking}
          onChange={(e) => patch({ smoking: e.target.value as ProfileDraft["smoking"] })}
        >
          <option value="">—</option>
          <option value="never">{t("profile.options.never")}</option>
          <option value="former">{t("profile.options.former")}</option>
          <option value="current">{t("profile.options.current")}</option>
        </Select>
      </Field>
      <Field label={t("profile.fields.alcohol")}>
        <Select
          value={draft.alcohol}
          onChange={(e) => patch({ alcohol: e.target.value as ProfileDraft["alcohol"] })}
        >
          <option value="">—</option>
          <option value="none">{t("profile.options.none")}</option>
          <option value="occasional">{t("profile.options.occasional")}</option>
          <option value="moderate">{t("profile.options.moderate")}</option>
          <option value="heavy">{t("profile.options.heavy")}</option>
        </Select>
      </Field>
      <Field label={t("profile.fields.chronicConditions")} className="sm:col-span-2">
        <Textarea
          value={draft.conditions}
          rows={3}
          placeholder={t("profile.placeholders.chronicConditions")}
          onChange={(e) => patch({ conditions: e.target.value })}
        />
      </Field>
    </div>
  );
}

/** Shared draft state hook. */
export function useProfileDraft(initial?: ProfileDraft) {
  const [draft, setDraft] = React.useState<ProfileDraft>(initial ?? EMPTY_DRAFT);
  const patch: Patch = (p) => setDraft((d) => ({ ...d, ...p }));
  return { draft, setDraft, patch };
}
