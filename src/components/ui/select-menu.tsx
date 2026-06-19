import * as React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export type SelectMenuOption = {
  value: string;
  label: string;
  description?: string;
};

type SelectMenuProps = {
  value: string | null;
  onChange: (value: string) => void;
  options: SelectMenuOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

type PanelStyle = {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
  transformOrigin: string;
};

export function SelectMenu({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className,
}: SelectMenuProps) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [panelStyle, setPanelStyle] = React.useState<PanelStyle | null>(null);

  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value) ?? null;
  const selectedLabel = selectedOption?.label ?? null;

  const computePanel = React.useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
    setPanelStyle({
      // Anchor the edge nearest the trigger so the panel hugs it and grows
      // toward the available space, sizing to its content rather than a
      // guessed height (which would leave a gap above the trigger).
      ...(openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      left: rect.left,
      width: rect.width,
      maxHeight: Math.min(320, openUp ? spaceAbove : spaceBelow),
      transformOrigin: openUp ? "bottom center" : "top center",
    });
  }, []);

  const openPanel = React.useCallback(() => {
    if (disabled) return;
    computePanel();
    setOpen(true);
    const idx = options.findIndex((o) => o.value === value);
    setActiveIndex(idx >= 0 ? idx : 0);
  }, [disabled, computePanel, options, value]);

  const closePanel = React.useCallback(() => {
    setOpen(false);
  }, []);

  const selectOption = React.useCallback(
    (opt: SelectMenuOption) => {
      onChange(opt.value);
      closePanel();
    },
    [onChange, closePanel],
  );

  // Return focus to trigger after panel closes
  const prevOpen = React.useRef(false);
  React.useEffect(() => {
    if (prevOpen.current && !open) triggerRef.current?.focus();
    prevOpen.current = open;
  }, [open]);

  // Recompute position on scroll/resize while open
  React.useEffect(() => {
    if (!open) return;
    const handler = () => computePanel();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [open, computePanel]);

  // Scroll active row into view via data-active attribute
  React.useEffect(() => {
    const panel = listRef.current;
    if (!panel) return;
    const activeEl = panel.querySelector<HTMLElement>("[data-active=true]");
    activeEl?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  // Outside click
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!triggerRef.current?.contains(target) && !listRef.current?.contains(target)) {
        closePanel();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, closePanel]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        openPanel();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      closePanel();
      triggerRef.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(options.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = options[activeIndex];
      if (opt) selectOption(opt);
    }
  };

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        onKeyDown={onKeyDown}
        onClick={() => (open ? closePanel() : openPanel())}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-input bg-card pl-3 pr-2.5 text-sm transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:border-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          !selectedLabel && "text-muted-foreground",
        )}
      >
        <span className="truncate">{selectedLabel ?? placeholder ?? t("common.select")}</span>
        <ChevronDown
          className={cn(
            "ml-1.5 size-4 shrink-0 text-muted-foreground transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {open &&
        panelStyle &&
        createPortal(
          <div
            ref={listRef}
            role="listbox"
            style={{
              position: "fixed",
              top: panelStyle.top,
              bottom: panelStyle.bottom,
              left: panelStyle.left,
              width: panelStyle.width,
              maxHeight: panelStyle.maxHeight,
              transformOrigin: panelStyle.transformOrigin,
              zIndex: 9999,
            }}
            className="overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-xl animate-combobox-in"
            onKeyDown={onKeyDown}
          >
            {options.map((opt, i) => (
              <OptionRow
                key={opt.value}
                opt={opt}
                isActive={i === activeIndex}
                isSelected={opt.value === value}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => selectOption(opt)}
              />
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

type OptionRowProps = {
  opt: SelectMenuOption;
  isActive: boolean;
  isSelected: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
};

function OptionRow({ opt, isActive, isSelected, onMouseEnter, onClick }: OptionRowProps) {
  return (
    <div
      role="option"
      aria-selected={isSelected}
      data-active={isActive}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={cn(
        "flex cursor-pointer select-none items-start justify-between gap-2 px-3 py-1.5 text-sm",
        isActive && "bg-accent text-accent-foreground",
        !isActive && "hover:bg-accent/60",
      )}
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{opt.label}</span>
        {opt.description && (
          <span className="line-clamp-2 text-xs text-muted-foreground">{opt.description}</span>
        )}
      </span>
      {isSelected && <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />}
    </div>
  );
}
