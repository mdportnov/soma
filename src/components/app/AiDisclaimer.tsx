import { Info } from "lucide-react";
import { AI_DISCLAIMER } from "@/ai/prompts";

/** Mandatory on every AI-generated output (§8). */
export function AiDisclaimer() {
  return (
    <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <Info className="size-3.5 shrink-0" />
      {AI_DISCLAIMER}
    </p>
  );
}
