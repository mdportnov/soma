import * as React from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { CornerDownLeft, Search } from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useI18n } from "@/lib/i18n";
import { pluralForm } from "@/lib/plural";
import { cn, formatDate } from "@/lib/utils";
import { INTERESTS_EVENT, loadInterests } from "@/lib/interests";
import { buildCommands, commandMatches, type Command } from "@/lib/search-commands";
import { Badge } from "@/components/ui/badge";
import {
  ensureSearchIndex,
  rebuildSearchIndex,
  recentRecords,
  searchRecords,
  type SearchResult,
} from "@/db/search";
import { ENTITY_TYPES, type EntityType } from "@/db/search-index";

/** Records shown per type group, so one noisy type can't fill the whole list. */
const PER_GROUP = 5;
/** Commands shown at most, for the same reason. */
const MAX_COMMANDS = 6;
/** Records shown in the empty state before anything is typed. */
const RECENT_COUNT = 7;

type Item =
  | { kind: "command"; id: string; label: string; command: Command }
  | { kind: "record"; id: string; result: SearchResult };

type Section = { key: string; label: string; items: Item[] };

function badgeVariant(type: EntityType) {
  switch (type) {
    case "lab_panel":
    case "lab_result":
    case "lab_finding":
      return "default" as const;
    case "medication":
    case "prescription":
      return "success" as const;
    case "diagnosis":
    case "allergy":
      return "warning" as const;
    default:
      return "secondary" as const;
  }
}

/**
 * Wraps the part of `text` the query matched in a <mark>, so the user can see
 * *why* a row is in the list — the match is often in a field the row doesn't
 * display. Falls back to plain text when the query only matched the hidden
 * content blob.
 */
function findMatch(text: string, query: string): { start: number; end: number } | null {
  const haystack = text.toLowerCase();
  const whole = query.toLowerCase().trim();
  const tokens = whole.split(/\s+/).filter(Boolean);
  // Prefer the whole query, then the longest token that actually appears.
  const candidates = [whole, ...[...tokens].sort((a, b) => b.length - a.length)];
  for (const c of candidates) {
    if (!c) continue;
    const i = haystack.indexOf(c);
    if (i >= 0) return { start: i, end: i + c.length };
  }
  return null;
}

function MarkedText({ text, query }: { text: string; query: string }) {
  const at = findMatch(text, query);
  if (!at) return <>{text}</>;
  return (
    <>
      {text.slice(0, at.start)}
      <mark className="rounded-[3px] bg-primary/20 px-0.5 text-inherit">
        {text.slice(at.start, at.end)}
      </mark>
      {text.slice(at.end)}
    </>
  );
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profileId } = useApp();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const [rendered, setRendered] = React.useState(open);
  const [closing, setClosing] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [recent, setRecent] = React.useState<SearchResult[]>([]);
  const [active, setActive] = React.useState(0);
  // Bumped when a rebuild finishes, so a search issued against the old index
  // is re-run against the fresh one instead of the user seeing stale rows.
  const [indexVersion, setIndexVersion] = React.useState(0);

  // Mount/unmount with exit animation, mirroring dialog.tsx.
  React.useEffect(() => {
    if (open) {
      setRendered(true);
      setClosing(false);
    } else if (rendered) {
      setClosing(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Refresh the index whenever the palette opens. Deliberately not awaited: the
  // previous index is already searchable, so typing is never blocked on the
  // rebuild — the version bump re-runs the query once fresh rows land.
  React.useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setActive(0);
    let cancelled = false;
    void rebuildSearchIndex(profileId).then(() => {
      if (!cancelled) setIndexVersion((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [open, profileId]);

  // Lazy first-build safety net (e.g. if the palette is never the first opener).
  React.useEffect(() => {
    void ensureSearchIndex(profileId);
  }, [profileId]);

  // Empty state: the newest records, so ⌘K on a blank query is still useful.
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void recentRecords(profileId, RECENT_COUNT).then((r) => {
      if (!cancelled) setRecent(r);
    });
    return () => {
      cancelled = true;
    };
  }, [open, profileId, indexVersion]);

  // Live search — the query space is local and tiny, so no debounce is needed.
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const r = await searchRecords(profileId, query);
      if (!cancelled) {
        setResults(r);
        setActive(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, query, profileId, indexVersion]);

  // Section interests gate the command list exactly as they gate the sidebar.
  const [interestsTick, setInterestsTick] = React.useState(0);
  React.useEffect(() => {
    const onChange = () => setInterestsTick((n) => n + 1);
    window.addEventListener(INTERESTS_EVENT, onChange);
    return () => window.removeEventListener(INTERESTS_EVENT, onChange);
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- tick is an intended re-run trigger
  const commands = React.useMemo(() => buildCommands(loadInterests()), [interestsTick, open]);

  const handleAnimationEnd = () => {
    if (closing) {
      setRendered(false);
      setClosing(false);
    }
  };

  const trimmed = query.trim();

  /**
   * The rendered list: commands first (they are the fastest thing the palette
   * does), then records grouped by type, then — on an empty query — the recent
   * records. `flat` is the same list linearized for keyboard navigation, so the
   * arrow keys walk exactly what the eye sees.
   */
  const { sections, flat } = React.useMemo(() => {
    const out: Section[] = [];

    const matched = commands
      .filter((c) => commandMatches(t(c.labelKey), trimmed))
      .slice(0, trimmed ? MAX_COMMANDS : commands.length);
    if (matched.length > 0) {
      out.push({
        key: "commands",
        label: t("search.groups.commands"),
        items: matched.map((c) => ({
          kind: "command" as const,
          id: `cmd:${c.id}`,
          label: t(c.labelKey),
          command: c,
        })),
      });
    }

    if (trimmed) {
      const byType = new Map<EntityType, SearchResult[]>();
      for (const r of results) {
        const arr = byType.get(r.entityType) ?? [];
        if (arr.length < PER_GROUP) arr.push(r);
        byType.set(r.entityType, arr);
      }
      for (const type of ENTITY_TYPES) {
        const items = byType.get(type);
        if (!items?.length) continue;
        out.push({
          key: type,
          label: t(`search.types.${type}`),
          items: items.map((r) => ({
            kind: "record" as const,
            id: `${r.entityType}:${r.entityId}`,
            result: r,
          })),
        });
      }
    } else if (recent.length > 0) {
      out.push({
        key: "recent",
        label: t("search.groups.recent"),
        items: recent.map((r) => ({
          kind: "record" as const,
          id: `${r.entityType}:${r.entityId}`,
          result: r,
        })),
      });
    }

    return { sections: out, flat: out.flatMap((s) => s.items) };
  }, [commands, results, recent, trimmed, t]);

  const go = React.useCallback(
    (item: Item) => {
      navigate(item.kind === "command" ? item.command.to : item.result.route);
      onClose();
    },
    [navigate, onClose],
  );

  /** Index of the first item of the section that owns `index`. */
  const sectionStarts = React.useMemo(() => {
    const starts: number[] = [];
    let n = 0;
    for (const s of sections) {
      starts.push(n);
      n += s.items.length;
    }
    return starts;
  }, [sections]);

  React.useEffect(() => {
    if (!open || closing) return;
    const onKey = (e: KeyboardEvent) => {
      const last = flat.length - 1;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        // Wraps, so holding Down never dead-ends at the bottom of a long list.
        setActive((i) => (last < 0 ? 0 : i >= last ? 0 : i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (last < 0 ? 0 : i <= 0 ? last : i - 1));
      } else if (e.key === "Home") {
        e.preventDefault();
        setActive(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setActive(Math.max(last, 0));
      } else if (e.key === "Tab") {
        // Tab hops group to group — the fast way past a long "Lab results"
        // block to the visits underneath it. Focus stays in the input.
        e.preventDefault();
        if (sectionStarts.length === 0) return;
        setActive((i) => {
          let current = 0;
          for (let s = 0; s < sectionStarts.length; s++) if (sectionStarts[s] <= i) current = s;
          const next = e.shiftKey ? current - 1 : current + 1;
          const wrapped = (next + sectionStarts.length) % sectionStarts.length;
          return sectionStarts[wrapped];
        });
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = flat[active];
        if (item) go(item);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closing, onClose, flat, sectionStarts, active, go]);

  React.useEffect(() => {
    if (open && !closing) inputRef.current?.focus();
  }, [open, closing]);

  // Keep the keyboard cursor visible when it walks past the fold.
  React.useEffect(() => {
    const item = flat[active];
    if (!item) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-item-id="${CSS.escape(item.id)}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [active, flat]);

  if (!rendered) return null;

  const activeId = flat[active]?.id;
  const count = results.length;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[25vh]">
      <div
        className={cn(
          "absolute inset-0 bg-black/40 backdrop-blur-sm",
          closing ? "animate-overlay-out" : "animate-overlay-in",
        )}
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("search.title")}
        onAnimationEnd={handleAnimationEnd}
        className={cn(
          "relative z-10 mx-4 w-full max-w-xl overflow-hidden rounded-xl border bg-card shadow-xl",
          closing ? "animate-dialog-out" : "animate-dialog-in",
        )}
      >
        <div className="flex items-center gap-2.5 border-b px-3.5">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search.placeholder")}
            className="h-12 w-full border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
            role="combobox"
            aria-expanded
            aria-controls="command-palette-list"
            aria-activedescendant={activeId ? `cp-${activeId}` : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="shrink-0 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {t("search.esc")}
          </kbd>
        </div>

        <div
          ref={listRef}
          id="command-palette-list"
          role="listbox"
          aria-label={t("search.title")}
          className="max-h-80 overflow-y-auto py-1.5"
        >
          {flat.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                {trimmed ? t("search.noResults", { query: trimmed }) : t("search.hint")}
              </p>
              {trimmed && (
                <p className="mt-1 text-xs text-muted-foreground/80">{t("search.noResultsHint")}</p>
              )}
            </div>
          ) : (
            sections.map((section) => (
              <div key={section.key} role="group" aria-label={section.label} className="mb-1">
                <div className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {section.label}
                </div>
                {section.items.map((item) => {
                  const idx = flat.indexOf(item);
                  const isActive = idx === active;
                  return (
                    <button
                      key={item.id}
                      id={`cp-${item.id}`}
                      data-item-id={item.id}
                      role="option"
                      aria-selected={isActive}
                      type="button"
                      onMouseMove={() => setActive(idx)}
                      onClick={() => go(item)}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-4 py-2 text-left",
                        isActive ? "bg-muted" : "hover:bg-muted",
                      )}
                    >
                      {item.kind === "command" ? (
                        <>
                          <item.command.icon className="size-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate text-sm">
                            <MarkedText text={item.label} query={trimmed} />
                          </span>
                          <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                            {t(`search.groups.${item.command.kind}`)}
                          </span>
                        </>
                      ) : (
                        <>
                          <Badge variant={badgeVariant(item.result.entityType)}>
                            {t(`search.types.${item.result.entityType}`)}
                          </Badge>
                          <span className="min-w-0 flex-1 truncate text-sm">
                            <MarkedText text={item.result.title} query={trimmed} />
                          </span>
                          {item.result.subtitle && (
                            <span className="hidden max-w-40 truncate text-xs text-muted-foreground sm:block">
                              {item.result.subtitle}
                            </span>
                          )}
                          {item.result.date && (
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                              {formatDate(item.result.date)}
                            </span>
                          )}
                        </>
                      )}
                      {isActive && (
                        <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t px-4 py-2 text-[11px] text-muted-foreground">
          <span>{t("search.footer")}</span>
          {trimmed && count > 0 && (
            <span className="tabular-nums">
              {t(`search.resultCount.${pluralForm(lang, count)}`, { count: String(count) })}
            </span>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
