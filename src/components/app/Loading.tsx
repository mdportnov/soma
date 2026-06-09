import { Loader2 } from "lucide-react";

export function Loading({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      <span className="text-sm">{label ?? "Loading…"}</span>
    </div>
  );
}
