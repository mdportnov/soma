import * as React from "react";
import { X, type LucideIcon } from "lucide-react";
import { useDismissed } from "@/hooks/useDismissed";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * A dismissible inline hint / coachmark. Renders nothing once dismissed (state
 * persisted by `id` via the hint store). Use for first-run guidance that should
 * linger until the user closes it. `id` must be stable and unique per hint.
 */
export function HintCard({
  id,
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  id: string;
  icon?: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const { t } = useI18n();
  const { dismissed, dismiss } = useDismissed(id);
  if (dismissed) return null;

  return (
    <div
      className={cn(
        "relative flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4",
        className,
      )}
    >
      {Icon && <Icon className="mt-0.5 size-4 shrink-0 text-primary" />}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        {children && (
          <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{children}</div>
        )}
        {action && <div className="mt-3">{action}</div>}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("common.dismiss")}
        title={t("common.dismiss")}
        className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
