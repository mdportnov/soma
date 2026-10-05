import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
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
  "aria-label"?: string;
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
  "aria-label": ariaLabel,
}: ComboboxProps) {
  const { t } = useI18n();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [restoreFocus, setRestoreFocus] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [panelStyle, setPanelStyle] = useState<PanelStyle | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const orderedOptions = useMemo(() => {
    const groups = new Map<string, ComboboxOption[]>();
    for (const option of options) {
      const group = option.group ?? "";
      const items = groups.get(group) ?? [];
      items.push(option);
      groups.set(group, items);
    }
    return [...groups.values()].flat();
  }, [options]);

  const selectedOption = options.find((o) => o.value === value) ?? null;
  // A custom (free-form) value has no matching option but should still display.
  const selectedLabel = selectedOption?.label ?? (allowCustom && value ? value : null);
  const isSearching = query.trim().length > 0;
  const filtered = useMemo(() => filterOptions(orderedOptions, query), [orderedOptions, query]);
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

  const computePanel = useCallback(() => {
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

  const openPanel = useCallback(() => {
    if (disabled) return;
    computePanel();
    setRestoreFocus(false);
    setOpen(true);
    setQuery("");
    setActiveIndex(
      Math.max(
        0,
        orderedOptions.findIndex((option) => option.value === value),
      ),
    );
  }, [disabled, computePanel, orderedOptions, value]);

  const closePanel = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const selectOption = useCallback(
    (opt: ComboboxOption) => {
      onChange(opt.value);
      closePanel();
      setRestoreFocus(true);
    },
    [onChange, closePanel],
  );

  useEffect(() => {
    if (!open && restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  }, [open, restoreFocus]);

  // Recompute position on scroll/resize while open
  useEffect(() => {
    if (!open) return;
    const handler = () => computePanel();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [open, computePanel]);

  useLayoutEffect(() => {
    if (open) searchRef.current?.focus({ preventScroll: true });
  }, [open]);

  const scrollToOption = (element: HTMLElement | null, center = false) => {
    const viewport = scrollRef.current;
    if (!viewport || !element) return;
    const row = element.getBoundingClientRect();
    const bounds = viewport.getBoundingClientRect();
    if (center) viewport.scrollTop += row.top - bounds.top - (bounds.height - row.height) / 2;
    else if (row.top < bounds.top + 28) viewport.scrollTop += row.top - bounds.top - 28;
    else if (row.bottom > bounds.bottom) viewport.scrollTop += row.bottom - bounds.bottom;
  };

  // Scroll the active row into view, but ONLY when navigating by keyboard.
  // Doing it on hover makes the list nudge under the cursor, which retriggers
  // mouseenter on a neighbouring row → visible jitter while moving the mouse.
  const navByKeyboard = useRef(false);
  useEffect(() => {
    if (!navByKeyboard.current) return;
    navByKeyboard.current = false;
    const panel = listRef.current;
    if (!panel) return;
    scrollToOption(panel.querySelector<HTMLElement>("[data-active=true]"));
  }, [activeIndex, query]);

  // Outside click
  useEffect(() => {
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

  const onKeyDown = (e: KeyboardEvent) => {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        openPanel();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closePanel();
      triggerRef.current?.focus({ preventScroll: true });
    } else if (e.key === "Tab") {
      if (e.shiftKey) e.preventDefault();
      triggerRef.current?.focus({ preventScroll: true });
      closePanel();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      navByKeyboard.current = true;
      setActiveIndex((i) => Math.max(0, Math.min(i + 1, flatOptions.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      navByKeyboard.current = true;
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = flatOptions[activeIndex];
      if (opt) selectOption(opt);
    }
  };

  // Group options for display when not searching
  const groups = useMemo(() => {
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

  useLayoutEffect(() => {
    if (!open) return;
    scrollToOption(
      listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]') ?? null,
      true,
    );
  }, [open]);

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
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
            "ml-1.5 size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open &&
        panelStyle &&
        createPortal(
          <div
            ref={listRef}
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
            className="flex flex-col overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-xl animate-popover-in"
            onKeyDown={onKeyDown}
          >
            <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5">
              <Search className="size-3.5 shrink-0 text-muted-foreground" />
              <input
                ref={searchRef}
                type="text"
                role="combobox"
                aria-label={t("common.search")}
                aria-autocomplete="list"
                aria-expanded={open}
                aria-controls={listId}
                aria-activedescendant={
                  flatOptions[activeIndex] ? `${listId}-${activeIndex}` : undefined
                }
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                  navByKeyboard.current = true;
                }}
                placeholder={t("common.search")}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
              />
            </div>

            <div
              ref={scrollRef}
              id={listId}
              role="listbox"
              aria-label={ariaLabel ?? selectedLabel ?? t("common.select")}
              className="overflow-y-auto"
              style={{ maxHeight: panelStyle.maxHeight - 40 }}
            >
              {flatOptions.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                  {t("common.noMatches")}
                </p>
              ) : isSearching ? (
                flatOptions.map((opt, i) => (
                  <OptionRow
                    key={opt.isCustom ? "__custom__" : opt.value}
                    id={`${listId}-${i}`}
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
                              id={`${listId}-${i}`}
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
  id: string;
  opt: ComboboxOption;
  isActive: boolean;
  isSelected: boolean;
  showGroup: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
};

function OptionRow({
  id,
  opt,
  isActive,
  isSelected,
  showGroup,
  onMouseEnter,
  onClick,
}: OptionRowProps) {
  return (
    <div
      id={id}
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
