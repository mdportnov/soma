import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";

/**
 * `evaluated=false` means unit conversion failed, so the value was never checked
 * against a reference range — we must NOT render a green "in range", which would
 * silently present an unverified value as normal.
 */
export function FlagBadge({
  flag,
  evaluated = true,
  className,
}: {
  flag: "low" | "high" | "critical" | null | string;
  evaluated?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  if (!evaluated)
    return (
      <Badge variant="secondary" title={t("flagBadge.notEvaluatedHint")} className={className}>
        {t("flagBadge.notEvaluated")}
      </Badge>
    );
  if (!flag)
    return (
      <Badge variant="success" className={className}>
        {t("flagBadge.inRange")}
      </Badge>
    );
  if (flag === "critical")
    return (
      <Badge variant="destructive" className={className}>
        {t("flagBadge.critical")}
      </Badge>
    );
  return (
    <Badge variant="warning" className={className}>
      {flag === "low" || flag === "high" ? t(`flagBadge.${flag}`) : flag}
    </Badge>
  );
}
