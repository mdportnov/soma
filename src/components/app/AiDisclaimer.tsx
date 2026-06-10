import { Info } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/** Mandatory on every AI-generated output (§8). */
export function AiDisclaimer() {
  const { t } = useI18n();

  return (
    <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <Info className="size-3.5 shrink-0" />
      {t("settings.ai.aiDisclaimer")}
    </p>
  );
}
