import {
  Check,
  NotebookPen,
  Pill,
  ScanLine,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  Syringe,
  type LucideIcon,
} from "lucide-react";
import { SECTION_GROUPS, type SectionGroup } from "@/lib/interests";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Group → icon + i18n keys, shared by onboarding and Settings. */
export const GROUP_META: Record<
  SectionGroup,
  { icon: LucideIcon; labelKey: string; descKey: string }
> = {
  meds: {
    icon: Pill,
    labelKey: "onboarding.groups.meds.label",
    descKey: "onboarding.groups.meds.desc",
  },
  conditions: {
    icon: Stethoscope,
    labelKey: "onboarding.groups.conditions.label",
    descKey: "onboarding.groups.conditions.desc",
  },
  allergies: {
    icon: ShieldAlert,
    labelKey: "onboarding.groups.allergies.label",
    descKey: "onboarding.groups.allergies.desc",
  },
  vaccines: {
    icon: Syringe,
    labelKey: "onboarding.groups.vaccines.label",
    descKey: "onboarding.groups.vaccines.desc",
  },
  imaging: {
    icon: ScanLine,
    labelKey: "onboarding.groups.imaging.label",
    descKey: "onboarding.groups.imaging.desc",
  },
  vitals: {
    icon: NotebookPen,
    labelKey: "onboarding.groups.vitals.label",
    descKey: "onboarding.groups.vitals.desc",
  },
  ai: {
    icon: Sparkles,
    labelKey: "onboarding.groups.ai.label",
    descKey: "onboarding.groups.ai.desc",
  },
};

/** A grid of toggle chips for the optional section groups. */
export function SectionToggles({
  enabled,
  onToggle,
}: {
  enabled: Set<SectionGroup>;
  onToggle: (group: SectionGroup) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {SECTION_GROUPS.map((id) => {
        const { icon: Icon, labelKey, descKey } = GROUP_META[id];
        const on = enabled.has(id);
        return (
          <button
            key={id}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(id)}
            className={cn(
              "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
              on ? "border-primary/40 bg-primary/5" : "hover:bg-muted",
            )}
          >
            <Icon
              className={cn(
                "mt-0.5 size-4 shrink-0",
                on ? "text-primary" : "text-muted-foreground",
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t(labelKey)}</p>
              <p className="text-[11px] leading-snug text-muted-foreground">{t(descKey)}</p>
            </div>
            <span
              className={cn(
                "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-muted-foreground/40",
              )}
            >
              {on && <Check className="size-3" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
