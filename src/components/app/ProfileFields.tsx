import * as React from "react";
import { Field } from "@/components/app/Field";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { SelectMenu } from "@/components/ui/select-menu";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
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
      placeholder={
        placeholder ?? (imperial ? t("profile.placeholders.lb") : t("profile.placeholders.kg"))
      }
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
        <SelectMenu
          value={draft.sex || null}
          onChange={(v) => patch({ sex: v as ProfileDraft["sex"] })}
          options={[
            { value: "male", label: t("profile.options.male") },
            { value: "female", label: t("profile.options.female") },
            { value: "other", label: t("profile.options.otherIntersex") },
          ]}
        />
      </Field>
      <Field label={t("profile.fields.units")}>
        <SelectMenu
          value={draft.unitSystem}
          onChange={(v) => patch({ unitSystem: v as UnitSystem })}
          options={[
            { value: "metric", label: t("profile.options.metricSystem") },
            { value: "imperial", label: t("profile.options.imperialSystem") },
          ]}
        />
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

const ETHNICITY_KEYS = [
  "white",
  "black",
  "eastAsian",
  "southAsian",
  "southeastAsian",
  "centralAsian",
  "mena",
  "hispanic",
  "nativeAmerican",
  "pacificIslander",
  "ashkenaziJewish",
  "caribbean",
  "mixed",
  "other",
] as const;

/** Canonical English ethnicity values stored in the DB, keyed by i18n label. */
const ETHNICITY_VALUES: Record<(typeof ETHNICITY_KEYS)[number], string> = {
  white: "White / European",
  black: "Black / African",
  eastAsian: "East Asian",
  southAsian: "South Asian",
  southeastAsian: "Southeast Asian",
  centralAsian: "Central Asian",
  mena: "Middle Eastern / North African",
  hispanic: "Hispanic / Latino",
  nativeAmerican: "Native American / Indigenous",
  pacificIslander: "Pacific Islander",
  ashkenaziJewish: "Ashkenazi Jewish",
  caribbean: "Caribbean",
  mixed: "Mixed / multiracial",
  other: "Other",
};

/** Optional fields: blood type, ethnicity, target weight, lifestyle, conditions. */
export function OptionalFields({ draft, patch }: { draft: ProfileDraft; patch: Patch }) {
  const { t } = useI18n();

  const ethnicityOptions: ComboboxOption[] = ETHNICITY_KEYS.map((k) => ({
    value: ETHNICITY_VALUES[k],
    label: t(`profile.ethnicity.${k}`),
  }));

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={t("profile.fields.bloodGroup")}>
        <SelectMenu
          value={draft.bloodType || null}
          onChange={(v) => patch({ bloodType: v as ProfileDraft["bloodType"] })}
          options={[
            { value: "O", label: t("profile.options.bloodO") },
            { value: "A", label: t("profile.options.bloodA") },
            { value: "B", label: t("profile.options.bloodB") },
            { value: "AB", label: t("profile.options.bloodAB") },
          ]}
        />
      </Field>
      <Field label={t("profile.fields.rhFactor")}>
        <SelectMenu
          value={draft.rhFactor || null}
          onChange={(v) => patch({ rhFactor: v as ProfileDraft["rhFactor"] })}
          options={[
            { value: "positive", label: t("profile.options.positiveRh") },
            { value: "negative", label: t("profile.options.negativeRh") },
          ]}
        />
      </Field>
      <Field label={t("profile.fields.ethnicity")} hint={t("profile.hints.ethnicity")}>
        <Combobox
          value={draft.ethnicity || null}
          onChange={(v) => patch({ ethnicity: v })}
          options={ethnicityOptions}
          placeholder={t("profile.placeholders.ethnicity")}
          allowCustom
        />
      </Field>
      <Field label={t("profile.fields.targetWeight")} hint={t("profile.hints.targetWeight")}>
        <WeightInput
          kg={draft.targetWeightKg}
          system={draft.unitSystem}
          placeholder={t("profile.placeholders.optional")}
          onChange={(kg) => patch({ targetWeightKg: kg })}
        />
      </Field>
      <Field label={t("profile.fields.activityLevel")}>
        <SelectMenu
          value={draft.activityLevel || null}
          onChange={(v) => patch({ activityLevel: v as ProfileDraft["activityLevel"] })}
          options={[
            {
              value: "sedentary",
              label: t("profile.options.sedentary"),
              description: t("profile.descriptions.sedentary"),
            },
            {
              value: "light",
              label: t("profile.options.lightlyActive"),
              description: t("profile.descriptions.lightlyActive"),
            },
            {
              value: "moderate",
              label: t("profile.options.moderatelyActive"),
              description: t("profile.descriptions.moderatelyActive"),
            },
            {
              value: "active",
              label: t("profile.options.active"),
              description: t("profile.descriptions.active"),
            },
            {
              value: "very_active",
              label: t("profile.options.veryActive"),
              description: t("profile.descriptions.veryActive"),
            },
          ]}
        />
      </Field>
      <Field label={t("profile.fields.smoking")}>
        <SelectMenu
          value={draft.smoking || null}
          onChange={(v) => patch({ smoking: v as ProfileDraft["smoking"] })}
          options={[
            { value: "never", label: t("profile.options.never") },
            {
              value: "former",
              label: t("profile.options.former"),
              description: t("profile.descriptions.smokingFormer"),
            },
            { value: "current", label: t("profile.options.current") },
          ]}
        />
      </Field>
      <Field label={t("profile.fields.alcohol")}>
        <SelectMenu
          value={draft.alcohol || null}
          onChange={(v) => patch({ alcohol: v as ProfileDraft["alcohol"] })}
          options={[
            { value: "none", label: t("profile.options.none") },
            {
              value: "occasional",
              label: t("profile.options.occasional"),
              description: t("profile.descriptions.alcoholOccasional"),
            },
            {
              value: "moderate",
              label: t("profile.options.moderate"),
              description: t("profile.descriptions.alcoholModerate"),
            },
            { value: "heavy", label: t("profile.options.heavy") },
          ]}
        />
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
