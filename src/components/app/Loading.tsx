import { Loader2 } from "lucide-react";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";

/**
 * Pending-state indicator. Renders nothing for the first `delayMs` so a load
 * that finishes quickly (the normal case against the local database) never
 * flashes a spinner and never pushes the page height around.
 */
export function Loading({ label, delayMs }: { label?: string; delayMs?: number }) {
  const show = useDelayedFlag(true, delayMs);
  if (!show) return null;
  return (
    <div className="animate-fade-in flex items-center justify-center gap-2 py-16 text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      <span className="text-sm">{label ?? "Loading…"}</span>
    </div>
  );
}
