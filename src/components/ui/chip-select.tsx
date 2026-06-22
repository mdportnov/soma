import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type ChipOption<T extends string> = { value: T; label: string };

/**
 * A small multi-select rendered as toggleable chips — for short, fixed option
 * sets (e.g. specimen kinds) where checkboxes feel heavy and a dropdown hides
 * the chosen set. Selected chips read as filled; unselected as outlined.
 */
export function ChipSelect<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: ChipOption<T>[];
  value: T[];
  onChange: (next: T[]) => void;
  className?: string;
}) {
  const toggle = (v: T) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((opt) => {
        const active = value.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => toggle(opt.value)}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              active
                ? "border-transparent bg-primary/15 text-primary"
                : "border-input text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {active && <Check className="size-3" />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
