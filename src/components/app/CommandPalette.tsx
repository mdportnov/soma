import * as React from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { useApp } from "@/app/AppContext";
import { useI18n } from "@/lib/i18n";
import { cn, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  ensureSearchIndex,
  rebuildSearchIndex,
  searchRecords,
  type EntityType,
  type SearchResult,
} from "@/db/search";

const GROUP_ORDER: EntityType[] = [
  "biomarker",
  "lab_panel",
  "visit",
  "diagnosis",
  "medication",
  "allergy",
  "vaccine",
  "symptom",
  "imaging",
  "health_note",
];

const PER_GROUP = 5;

function routeFor(r: SearchResult): string {
  switch (r.entityType) {
    case "biomarker":
      return `/biomarkers/${r.entityId}`;
    case "lab_panel":
      return `/labs/${r.entityId}`;
    case "visit":
      return `/visits/${r.entityId}`;
    case "diagnosis":
      return "/diagnoses";
    case "medication":
      return "/medications";
    case "allergy":
      return "/allergies";
    case "vaccine":
      return "/vaccines";
    case "symptom":
      return "/journal?tab=symptoms";
    case "imaging":
      return `/imaging/${r.entityId}`;
    case "health_note":
      return "/assistant";
    default:
      return "/";
  }
}

function badgeVariant(type: EntityType) {
  switch (type) {
    case "lab_panel":
      return "default" as const;
    case "medication":
      return "success" as const;
    case "diagnosis":
      return "warning" as const;
    default:
      return "secondary" as const;
  }
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profileId } = useApp();
  const { t } = useI18n();
  const navigate = useNavigate();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const [rendered, setRendered] = React.useState(open);
  const [closing, setClosing] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [active, setActive] = React.useState(0);

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

  // Refresh the index whenever the palette opens; data is small so this is cheap.
  React.useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setActive(0);
    void rebuildSearchIndex(profileId);
  }, [open, profileId]);

  // Lazy first-build safety net (e.g. if the palette is never the first opener).
  React.useEffect(() => {
    void ensureSearchIndex(profileId);
  }, [profileId]);

  // Debounced-free live search — query space is tiny.
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
  }, [open, query, profileId]);

  const handleAnimationEnd = () => {
    if (closing) {
      setRendered(false);
      setClosing(false);
    }
  };

  // Cap each group to PER_GROUP and keep a flat list for keyboard navigation.
  const grouped = React.useMemo(() => {
    const map = new Map<EntityType, SearchResult[]>();
    for (const r of results) {
      const arr = map.get(r.entityType) ?? [];
      if (arr.length < PER_GROUP) arr.push(r);
      map.set(r.entityType, arr);
    }
    const sections = GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({
      type: g,
      items: map.get(g)!,
    }));
    const flat = sections.flatMap((s) => s.items);
    return { sections, flat };
  }, [results]);

  const go = React.useCallback(
    (r: SearchResult) => {
      navigate(routeFor(r));
      onClose();
    },
    [navigate, onClose],
  );

  React.useEffect(() => {
    if (!open || closing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, grouped.flat.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const r = grouped.flat[active];
        if (r) go(r);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closing, onClose, grouped.flat, active, go]);

  React.useEffect(() => {
    if (open && !closing) inputRef.current?.focus();
  }, [open, closing]);

  if (!rendered) return null;

  const trimmed = query.trim();

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
          />
          <kbd className="shrink-0 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {t("search.esc")}
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto py-1.5">
          {trimmed === "" ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              {t("search.hint")}
            </p>
          ) : grouped.flat.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              {t("search.noResults", { query: trimmed })}
            </p>
          ) : (
            grouped.sections.map((section) => (
              <div key={section.type} className="mb-1">
                <div className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(`search.types.${section.type}`)}
                </div>
                {section.items.map((r) => {
                  const idx = grouped.flat.indexOf(r);
                  const isActive = idx === active;
                  return (
                    <button
                      key={`${r.entityType}-${r.entityId}`}
                      type="button"
                      onMouseMove={() => setActive(idx)}
                      onClick={() => go(r)}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-4 py-2 text-left",
                        isActive ? "bg-muted" : "hover:bg-muted",
                      )}
                    >
                      <Badge variant={badgeVariant(r.entityType)}>
                        {t(`search.types.${r.entityType}`)}
                      </Badge>
                      <span className="min-w-0 flex-1 truncate text-sm">{r.title}</span>
                      {r.subtitle && (
                        <span className="hidden max-w-40 truncate text-xs text-muted-foreground sm:block">
                          {r.subtitle}
                        </span>
                      )}
                      {r.date && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatDate(r.date)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-3 border-t px-4 py-2 text-[11px] text-muted-foreground">
          <span>{t("search.footer")}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
