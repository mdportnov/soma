import * as React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizeLabel, similarity } from "@/lib/fuzzy";
import { useI18n } from "@/lib/i18n";

export type ComboboxOption = {
  value: string;
  label: string;
  group?: string;
  keywords?: string[];
  /** Internal: synthetic "use what you typed" row added by `allowCustom`. */
  isCustom?: boolean;
};

type ComboboxProps = {
  value: string | null;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Offer the typed query as a free-form value when it matches no option. */
  allowCustom?: boolean;
};

type PanelStyle = {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
  transformOrigin: string;
};

function filterOptions(options: ComboboxOption[], query: string): ComboboxOption[] {
  if (!query.trim()) return options;
  const q = normalizeLabel(query);

  const scored = options.flatMap((opt) => {
    const texts = [opt.label, ...(opt.keywords ?? [])].map(normalizeLabel);
    const substringMatch = texts.some((t) => t.includes(q));
    if (substringMatch) return [{ opt, score: 1 }];
    const best = Math.max(...texts.map((t) => similarity(q, t)));
    if (best > 0.35) return [{ opt, score: best }];
    return [];
  });

  return scored.sort((a, b) => b.score - a.score).map((s) => s.opt);
}

export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  className,
  allowCustom,
}: ComboboxProps) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [panelStyle, setPanelStyle] = React.useState<PanelStyle | null>(null);

  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value) ?? null;
  // A custom (free-form) value has no matching option but should still display.
  const selectedLabel = selectedOption?.label ?? (allowCustom && value ? value : null);
  const isSearching = query.trim().length > 0;
  const filtered = filterOptions(options, query);
  const trimmedQuery = query.trim();
  const customOption: ComboboxOption | null =
    allowCustom &&
    trimmedQuery &&
    !options.some(
      (o) => o.value === trimmedQuery || normalizeLabel(o.label) === normalizeLabel(trimmedQuery),
    )
      ? { value: trimmedQuery, label: trimmedQuery, isCustom: true }
      : null;
  const flatOptions = customOption ? [...filtered, customOption] : filtered;

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
    setQuery("");
    setActiveIndex(0);
  }, [disabled, computePanel]);

  const closePanel = React.useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const selectOption = React.useCallback(
    (opt: ComboboxOption) => {
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

  // Focus search input when panel opens
  React.useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 0);
  }, [open]);

  // Scroll active row into view via data-active attribute
  React.useEffect(() => {
    const panel = listRef.current;
    if (!panel) return;
    const activeEl = panel.querySelector<HTMLElement>("[data-active=true]");
    activeEl?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

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
      setActiveIndex((i) => Math.min(i + 1, flatOptions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = flatOptions[activeIndex];
      if (opt) selectOption(opt);
    }
  };

  // Group options for display when not searching
  const groups = React.useMemo(() => {
    if (isSearching) return null;
    const map = new Map<string, ComboboxOption[]>();
    for (const opt of filtered) {
      const g = opt.group ?? "";
      const list = map.get(g) ?? [];
      list.push(opt);
      map.set(g, list);
    }
    return map;
  }, [filtered, isSearching]);

  // Reset active index when query changes
  React.useEffect(() => {
    setActiveIndex(0);
  }, [query]);

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
            className="flex flex-col overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-xl animate-combobox-in"
            onKeyDown={onKeyDown}
          >
            <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5">
              <Search className="size-3.5 shrink-0 text-muted-foreground" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("common.search")}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
              />
            </div>

            <div className="overflow-y-auto" style={{ maxHeight: panelStyle.maxHeight - 40 }}>
              {flatOptions.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                  {t("common.noMatches")}
                </p>
              ) : isSearching ? (
                flatOptions.map((opt, i) => (
                  <OptionRow
                    key={opt.isCustom ? "__custom__" : opt.value}
                    opt={
                      opt.isCustom
                        ? { ...opt, label: t("common.useCustomValue", { value: opt.value }) }
                        : opt
                    }
                    isActive={i === activeIndex}
                    isSelected={opt.value === value}
                    showGroup
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => selectOption(opt)}
                  />
                ))
              ) : (
                [...(groups ?? new Map<string, ComboboxOption[]>()).entries()].map(
                  ([group, items]) => {
                    const groupStart = flatOptions.indexOf(items[0]);
                    return (
                      <div key={group || "__nogroup__"}>
                        {group && (
                          <p className="sticky top-0 z-10 bg-popover px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {group}
                          </p>
                        )}
                        {items.map((opt, gi) => {
                          const i = groupStart + gi;
                          return (
                            <OptionRow
                              key={opt.value}
                              opt={opt}
                              isActive={i === activeIndex}
                              isSelected={opt.value === value}
                              showGroup={false}
                              onMouseEnter={() => setActiveIndex(i)}
                              onClick={() => selectOption(opt)}
                            />
                          );
                        })}
                      </div>
                    );
                  },
                )
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

type OptionRowProps = {
  opt: ComboboxOption;
  isActive: boolean;
  isSelected: boolean;
  showGroup: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
};

function OptionRow({
  opt,
  isActive,
  isSelected,
  showGroup,
  onMouseEnter,
  onClick,
}: OptionRowProps) {
  return (
    <div
      role="option"
      aria-selected={isSelected}
      data-active={isActive}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={cn(
        "flex cursor-pointer select-none items-center justify-between gap-2 px-3 py-1.5 text-sm",
        isActive && "bg-accent text-accent-foreground",
        !isActive && "hover:bg-accent/60",
      )}
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{opt.label}</span>
        {showGroup && opt.group && (
          <span className="text-[10px] text-muted-foreground">{opt.group}</span>
        )}
      </span>
      {isSelected && <Check className="size-3.5 shrink-0 text-primary" />}
    </div>
  );
}
