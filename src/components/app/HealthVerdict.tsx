import { CheckCircle2, TriangleAlert } from "lucide-react";
import type { VerdictStatus } from "@/lib/dashboard-digest";
import { cn } from "@/lib/utils";

/**
 * One-line plain-language read at the top of the dashboard: calm green when
 * nothing needs attention, amber when something does. Reusable wherever a
 * single "am I OK right now" sentence belongs.
 */
export function HealthVerdict({
  status,
  message,
  className,
}: {
  status: VerdictStatus;
  message: string;
  className?: string;
}) {
  const calm = status === "calm";
  const Icon = calm ? CheckCircle2 : TriangleAlert;
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border px-4 py-3",
        calm
          ? "border-success/30 bg-success/8 text-success"
          : "border-warning/40 bg-warning/10 text-warning",
        className,
      )}
    >
      <Icon className="size-5 shrink-0" />
      <p className="text-sm font-medium text-foreground">{message}</p>
    </div>
  );
}
