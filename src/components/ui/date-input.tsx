import * as React from "react";
import { createPortal } from "react-dom";
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

// Approximate DayPicker panel footprint, used to decide whether to open upward.
const PANEL_HEIGHT = 340;
const PANEL_GAP = 6;

type PanelPos = { top: number; left: number; transformOrigin: string };

function DatePopover({
  open,
  triggerRef,
  panelRef,
  selected,
  defaultMonth,
  onSelect,
  onClose,
}: {
  open: boolean;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
  selected: Date | undefined;
  defaultMonth: Date | undefined;
  onSelect: (date: Date) => void;
  onClose: () => void;
}) {
  const [rendered, setRendered] = React.useState(open);
  const [closing, setClosing] = React.useState(false);
  const [pos, setPos] = React.useState<PanelPos | null>(null);

  const computePos = React.useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const openUp = spaceBelow < PANEL_HEIGHT && rect.top > spaceBelow;
    setPos({
      top: openUp ? rect.top - PANEL_GAP : rect.bottom + PANEL_GAP,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 320)),
      transformOrigin: openUp ? "bottom left" : "top left",
    });
  }, [triggerRef]);

  React.useEffect(() => {
    if (open) {
      computePos();
      setRendered(true);
      setClosing(false);
    } else if (rendered) {
      setClosing(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Track scroll/resize while open so the panel sticks to its trigger.
  React.useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", computePos, true);
    window.addEventListener("resize", computePos);
    return () => {
      window.removeEventListener("scroll", computePos, true);
      window.removeEventListener("resize", computePos);
    };
  }, [open, computePos]);

  if (!rendered || !pos) return null;

  const openUp = pos.transformOrigin.startsWith("bottom");

  return createPortal(
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        transform: openUp ? "translateY(-100%)" : undefined,
        transformOrigin: pos.transformOrigin,
        zIndex: 9999,
      }}
      onAnimationEnd={() => {
        if (closing) {
          setRendered(false);
          setClosing(false);
        }
      }}
      className={cn(
        "rounded-xl border bg-popover p-3 text-popover-foreground shadow-xl",
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
    </div>,
    document.body,
  );
}

/**
 * Themed replacement for `<input type="date">` — the native WebKit calendar
 * popup ignores the app theme entirely. Renders an input-styled trigger and
 * a portaled DayPicker dropdown (fixed positioning, flips upward near the
 * viewport bottom) so it never clips inside dialogs or scroll containers.
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
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const selected = parseISO(value);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false);
      }
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
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
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
        triggerRef={triggerRef}
        panelRef={panelRef}
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
