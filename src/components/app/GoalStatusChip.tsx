import type { GoalStatus } from "@/lib/weightGoal";
import { cn, formatValue } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

/**
 * "1.2 kg ahead" / "0.8 kg behind" / "on track" / "deadline passed" — a compact,
 * direction-aware read on whether the user is keeping up with the glide path.
 */
export function GoalStatusChip({
  status,
  unitLabel,
  toDisplay,
  className,
}: {
  status: GoalStatus | null;
  unitLabel: string;
  toDisplay: (kg: number) => number;
  className?: string;
}) {
  const { t } = useI18n();
  if (!status || status.state === "upcoming") return null;
  const v = `${formatValue(toDisplay(Math.abs(status.deltaKg)), 1)} ${unitLabel}`;
  const label =
    status.state === "ahead"
      ? t("weightGoal.ahead", { v })
      : status.state === "behind"
        ? t("weightGoal.behind", { v })
        : status.state === "onTrack"
          ? t("weightGoal.onTrack")
          : t("weightGoal.expired");
  const tone =
    status.state === "behind"
      ? "text-amber-600 dark:text-amber-500"
      : status.state === "ahead"
        ? ""
        : "text-muted-foreground";
  return (
    <span
      className={cn("whitespace-nowrap text-xs font-medium tabular-nums", tone, className)}
      style={status.state === "ahead" ? { color: "var(--success)" } : undefined}
    >
      {label}
    </span>
  );
}
