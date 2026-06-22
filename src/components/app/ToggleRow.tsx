import type { LucideIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/** A label + description row with a trailing switch, for preference lists. */
export function ToggleRow({
  label,
  description,
  checked,
  onChange,
  icon: Icon,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  icon?: LucideIcon;
  disabled?: boolean;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 py-3", disabled && "opacity-60")}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon && <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
        <div className="min-w-0">
          <p className="text-sm font-medium">{label}</p>
          {description && (
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      <Switch checked={checked} onChange={onChange} aria-label={label} disabled={disabled} />
    </div>
  );
}
