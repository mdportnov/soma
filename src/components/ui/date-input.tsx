import * as React from "react";
import { DayPicker } from "react-day-picker";
import { CalendarDays, X } from "lucide-react";
import { cn } from "@/lib/utils";

type DateInputProps = {
  /** ISO date `yyyy-mm-dd`, or "" when empty. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Month shown when no value is picked yet (e.g. ~1990 for birth dates). */
  defaultMonth?: Date;
  /** Show a clear button when a value is set (for optional dates). */
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
};

function parseISO(value: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return undefined;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function toISO(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

function DatePopover({
  open,
  selected,
  defaultMonth,
  onSelect,
  onClose,
}: {
  open: boolean;
  selected: Date | undefined;
  defaultMonth: Date | undefined;
  onSelect: (date: Date) => void;
  onClose: () => void;
}) {
  const [rendered, setRendered] = React.useState(open);
  const [closing, setClosing] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setRendered(true);
      setClosing(false);
    } else if (rendered) {
      setClosing(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!rendered) return null;

  return (
    <div
      onAnimationEnd={() => {
        if (closing) {
          setRendered(false);
          setClosing(false);
        }
      }}
      className={cn(
        "absolute left-0 top-full z-50 mt-1.5 rounded-xl border bg-popover text-popover-foreground p-3 shadow-xl",
        closing ? "animate-dialog-out" : "animate-dialog-in",
      )}
    >
      <DayPicker
        mode="single"
        selected={selected}
        defaultMonth={selected ?? defaultMonth}
        captionLayout="dropdown"
        startMonth={new Date(1900, 0)}
        endMonth={new Date(new Date().getFullYear() + 1, 11)}
        onSelect={(date) => {
          if (date) onSelect(date);
          else onClose();
        }}
      />
    </div>
  );
}

/**
 * Themed replacement for `<input type="date">` — the native WebKit calendar
 * popup ignores the app theme entirely. Renders an input-styled trigger and
 * a DayPicker dropdown with month/year selects (styled in index.css).
 */
export function DateInput({
  value,
  onChange,
  placeholder = "Pick a date",
  defaultMonth,
  clearable = false,
  disabled,
  className,
}: DateInputProps) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const selected = parseISO(value);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-card px-3 py-1 text-left text-sm transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:border-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
        {selected ? (
          <span className="flex-1 truncate">
            {selected.toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        ) : (
          <span className="flex-1 truncate text-muted-foreground/70">{placeholder}</span>
        )}
        {clearable && selected && (
          <span
            role="button"
            aria-label="Clear date"
            tabIndex={0}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
              setOpen(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                onChange("");
                setOpen(false);
              }
            }}
          >
            <X className="size-3.5" />
          </span>
        )}
      </button>

      <DatePopover
        open={open}
        selected={selected}
        defaultMonth={defaultMonth}
        onSelect={(date) => {
          onChange(toISO(date));
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
