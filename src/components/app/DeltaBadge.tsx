import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { BiomarkerChange } from "@/lib/insights";
import { cn, formatValue } from "@/lib/utils";

/**
 * Compact change indicator: an arrow for the value direction, colored by
 * trajectory (green = improved, amber/red = worsened, grey = neutral). Shows the
 * percent move when available, otherwise the absolute delta in the given unit.
 */
export function DeltaBadge({
  change,
  unit,
  className,
}: {
  change: BiomarkerChange;
  unit?: string;
  className?: string;
}) {
  const Icon =
    change.direction === "up" ? ArrowUpRight : change.direction === "down" ? ArrowDownRight : Minus;

  const tone =
    change.trajectory === "improved"
      ? "text-success"
      : change.trajectory === "worsened"
        ? change.severity === "alert"
          ? "text-destructive"
          : "text-warning"
        : "text-muted-foreground";

  const sign = change.absChange > 0 ? "+" : change.absChange < 0 ? "−" : "";
  const label =
    change.pctChange != null
      ? `${sign}${Math.abs(Math.round(change.pctChange * 100))}%`
      : `${sign}${formatValue(Math.abs(change.absChange))}${unit ? ` ${unit}` : ""}`;

  return (
    <span
      className={cn("inline-flex items-center gap-0.5 text-xs font-medium tabular-nums", tone, className)}
    >
      <Icon className="size-3.5" />
      {label}
    </span>
  );
}
