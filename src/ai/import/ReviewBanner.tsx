import { AlertTriangle } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/**
 * "Requires 100% manual review" banner, shown above review tables for document
 * types that have no deterministic dictionary fallback (vaccines, discharge,
 * imaging, prescriptions, allergies). Nothing on those screens is auto-accepted.
 */
export function ReviewBanner() {
  const { t } = useI18n();
  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-medium">{t("importWizard.reviewBanner.title")}</p>
        <p className="text-xs opacity-90">{t("importWizard.reviewBanner.description")}</p>
      </div>
    </div>
  );
}
