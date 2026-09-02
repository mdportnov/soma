import * as React from "react";
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  archiveChatThread,
  deleteChatThread,
  listChatThreads,
  renameChatThread,
  restoreChatThread,
  type ChatThreadSummary,
} from "@/db/chat-repos";
import { useConfirm } from "@/components/app/Confirm";
import { useToast } from "@/components/app/Toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";
import { useI18n } from "@/lib/i18n";
import { pluralForm } from "@/lib/plural";
import { cn, formatDate, uiLocale } from "@/lib/utils";
import { groupThreads, relativeActivity } from "./thread-groups";

/** Debounce for the search box — local SQLite answers in ms, this only stops a rebuild per keystroke. */
const SEARCH_DEBOUNCE_MS = 150;

export type ThreadListProps = {
  profileId: number;
  currentId: number | null;
  /** True while an answer is streaming: switching is blocked until it ends. */
  busy: boolean;
  /** Bump to reload the list (a new message changed a title or preview). */
  refreshKey: number;
  onOpen: (id: number) => void;
  onNew: () => void;
  /** The current thread was archived or deleted — the page must move on. */
  onCurrentGone: () => void;
  /** Rows changed (rename/archive/restore) — lets the header re-read its title. */
  onChanged?: () => void;
  autoFocusSearch?: boolean;
  className?: string;
};

/**
 * The chat list: search, date-bucketed active threads, a collapsed archive,
 * inline rename and a per-row menu. Shared by the docked panel and the header
 * popover so both switch, rename and delete through the same code path. Row
 * focus is roving (↑/↓), F2 renames, Delete asks to delete.
 */
export function ThreadList(props: ThreadListProps) {
  const { t, lang } = useI18n();
  const { confirmDelete } = useConfirm();
  const toast = useToast();
  const [query, setQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [threads, setThreads] = React.useState<ChatThreadSummary[] | null>(null);
  const [error, setError] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [renamingId, setRenamingId] = React.useState<number | null>(null);
  const [menuId, setMenuId] = React.useState<number | null>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const runId = React.useRef(0);

  React.useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [query]);

  const load = React.useCallback(async () => {
    const id = ++runId.current;
    try {
      const rows = await listChatThreads(props.profileId, { status: "all", query: debounced });
      if (runId.current !== id) return;
      setThreads(rows);
      setError(false);
    } catch (e) {
      console.error("listChatThreads failed", e);
      if (runId.current === id) setError(true);
    }
  }, [props.profileId, debounced]);

  React.useEffect(() => {
    void load();
  }, [load, props.refreshKey]);

  // A menu is a one-off: any click elsewhere or Escape closes it.
  React.useEffect(() => {
    if (menuId == null) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-thread-menu]")) setMenuId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuId(null);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuId]);

  const label = (thread: ChatThreadSummary) =>
    thread.displayTitle ?? t("aiAnalysis.threads.newUntitled");

  const rename = async (thread: ChatThreadSummary, title: string) => {
    setRenamingId(null);
    if (title.trim() === (thread.title ?? "")) return;
    await renameChatThread(thread.id, title);
    await load();
    props.onChanged?.();
  };

  const archive = async (thread: ChatThreadSummary) => {
    setMenuId(null);
    await archiveChatThread(thread.id);
    await load();
    props.onChanged?.();
    if (thread.id === props.currentId) props.onCurrentGone();
    toast.showAction(t("aiAnalysis.threads.archivedToast"), t("aiAnalysis.threads.undo"), () => {
      void restoreChatThread(thread.id).then(() => {
        void load();
        props.onChanged?.();
      });
    });
  };

  const restore = async (thread: ChatThreadSummary) => {
    setMenuId(null);
    await restoreChatThread(thread.id);
    await load();
    props.onChanged?.();
    toast.show(t("aiAnalysis.threads.restoredToast"));
  };

  const remove = async (thread: ChatThreadSummary) => {
    setMenuId(null);
    const ok = await confirmDelete({
      entity: "chatThread",
      name: label(thread),
      cascade: [
        { key: "chatMessage", count: thread.messageCount },
        { key: "chatDraft", count: thread.pendingChangeSets },
      ],
    });
    if (!ok) return;
    await deleteChatThread(thread.id);
    await load();
    props.onChanged?.();
    if (thread.id === props.currentId) props.onCurrentGone();
    toast.show(t("aiAnalysis.threads.deletedToast"));
  };

  const moveFocus = (from: HTMLElement, delta: 1 | -1) => {
    const rows = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-thread-row]") ?? [])];
    const index = rows.indexOf(from);
    const next = rows[index + delta];
    next?.focus();
  };

  const onRowKey = (e: React.KeyboardEvent<HTMLElement>, thread: ChatThreadSummary) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      moveFocus(e.currentTarget, e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "F2") {
      e.preventDefault();
      setRenamingId(thread.id);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      void remove(thread);
    }
  };

  const active = (threads ?? []).filter((thread) => thread.status === "active");
  const archived = (threads ?? []).filter((thread) => thread.status === "archived");
  const groups = groupThreads(active);

  const renderRow = (thread: ChatThreadSummary) => {
    const current = thread.id === props.currentId;
    const blocked = props.busy && !current;
    const renaming = renamingId === thread.id;
    const badges: React.ReactNode[] = [];
    if (thread.lastModelId) {
      badges.push(
        <Badge
          key="model"
          variant="secondary"
          className="max-w-32 truncate"
          title={thread.lastModelId}
        >
          {thread.lastModelId}
        </Badge>,
      );
    }
    const records = thread.citedRecords + thread.changedRecords;
    if (records > 0) {
      badges.push(
        <Badge key="records" variant="outline">
          {t(`aiAnalysis.threads.records.${pluralForm(lang, records)}`, { n: String(records) })}
        </Badge>,
      );
    }
    if (thread.pendingChangeSets > 0) {
      badges.push(
        <Badge key="pending" variant="warning">
          {t(`aiAnalysis.threads.pending.${pluralForm(lang, thread.pendingChangeSets)}`, {
            n: String(thread.pendingChangeSets),
          })}
        </Badge>,
      );
    }
    return (
      <div
        key={thread.id}
        className={cn(
          "group relative rounded-md",
          current ? "bg-muted" : "hover:bg-muted/60",
          current &&
            "before:absolute before:top-2 before:bottom-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary",
        )}
      >
        {renaming ? (
          <RenameField
            initial={thread.title ?? thread.displayTitle ?? ""}
            placeholder={t("aiAnalysis.threads.renamePlaceholder")}
            onDone={(title) => void rename(thread, title)}
            onCancel={() => setRenamingId(null)}
          />
        ) : (
          <button
            type="button"
            data-thread-row
            aria-current={current ? "true" : undefined}
            aria-disabled={blocked || undefined}
            title={blocked ? t("aiAnalysis.threads.switchBlocked") : undefined}
            onClick={() => {
              if (blocked) return;
              props.onOpen(thread.id);
            }}
            onDoubleClick={() => setRenamingId(thread.id)}
            onKeyDown={(e) => onRowKey(e, thread)}
            className={cn(
              "flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 pr-8 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              blocked && "cursor-not-allowed opacity-60",
            )}
          >
            <span className="flex items-baseline gap-2">
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-sm",
                  thread.displayTitle ? "font-medium" : "text-muted-foreground",
                )}
              >
                {label(thread)}
              </span>
              <time
                dateTime={thread.updatedAt}
                className="shrink-0 text-[11px] text-muted-foreground"
                title={formatDate(thread.updatedAt)}
              >
                {relativeActivity(thread.updatedAt, uiLocale(), new Date(), formatDate)}
              </time>
            </span>
            {thread.lastMessagePreview && (
              <span className="truncate text-xs text-muted-foreground">
                {thread.lastMessagePreview}
              </span>
            )}
            {badges.length > 0 && <span className="mt-1 flex flex-wrap gap-1">{badges}</span>}
          </button>
        )}
        {!renaming && (
          <div data-thread-menu className="absolute top-1.5 right-1.5">
            <button
              type="button"
              aria-label={t("aiAnalysis.threads.menu")}
              aria-haspopup="menu"
              aria-expanded={menuId === thread.id}
              onClick={() => setMenuId((id) => (id === thread.id ? null : thread.id))}
              className={cn(
                "inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50 outline-none",
                menuId === thread.id
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
              )}
            >
              <MoreHorizontal className="size-3.5" />
            </button>
            {menuId === thread.id && (
              <div
                role="menu"
                className="absolute right-0 z-20 mt-1 w-44 rounded-md border bg-popover p-1 text-sm shadow-lg"
              >
                <MenuItem
                  icon={<Pencil className="size-3.5" />}
                  label={t("aiAnalysis.threads.rename")}
                  onClick={() => {
                    setMenuId(null);
                    setRenamingId(thread.id);
                  }}
                />
                {thread.status === "active" ? (
                  <MenuItem
                    icon={<Archive className="size-3.5" />}
                    label={t("aiAnalysis.threads.archive")}
                    onClick={() => void archive(thread)}
                  />
                ) : (
                  <MenuItem
                    icon={<ArchiveRestore className="size-3.5" />}
                    label={t("aiAnalysis.threads.restore")}
                    onClick={() => void restore(thread)}
                  />
                )}
                <div className="my-1 border-t" />
                <MenuItem
                  icon={<Trash2 className="size-3.5" />}
                  label={t("aiAnalysis.threads.delete")}
                  destructive
                  onClick={() => void remove(thread)}
                />
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={cn("flex min-h-0 flex-col", props.className)}>
      <div className="flex items-center gap-1.5 px-1 pb-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && query) {
                e.stopPropagation();
                setQuery("");
              }
            }}
            placeholder={t("aiAnalysis.threads.search")}
            aria-label={t("aiAnalysis.threads.search")}
            autoFocus={props.autoFocusSearch}
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Tooltip content={`${t("aiAnalysis.threads.new")} (⌘⇧O)`}>
          <Button
            variant="outline"
            size="iconSm"
            onClick={props.onNew}
            disabled={props.busy}
            aria-label={t("aiAnalysis.threads.new")}
          >
            <Plus />
          </Button>
        </Tooltip>
      </div>
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-2">
        {error && (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground">
            <p>{t("aiAnalysis.threads.listError")}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => void load()}>
              {t("aiAnalysis.threads.retry")}
            </Button>
          </div>
        )}
        {threads === null && !error && (
          <div className="space-y-2 px-1 pt-1" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-md bg-muted/70" />
            ))}
          </div>
        )}
        {threads !== null && !error && threads.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            {debounced
              ? t("aiAnalysis.threads.noMatches", { query: debounced })
              : t("aiAnalysis.threads.empty")}
          </p>
        )}
        {groups.map((group) => (
          <section key={group.key} className="mb-2">
            <h3 className="px-2.5 pt-2 pb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              {t(`aiAnalysis.threads.${group.key}`)}
            </h3>
            <div className="space-y-0.5">{group.threads.map(renderRow)}</div>
          </section>
        ))}
        {archived.length > 0 && (
          <section className="mb-2">
            <button
              type="button"
              onClick={() => setArchiveOpen((v) => !v)}
              aria-expanded={archiveOpen}
              className="flex w-full items-center gap-1 px-2.5 pt-2 pb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase hover:text-foreground"
            >
              <ChevronDown
                className={cn("size-3 transition-transform", !archiveOpen && "-rotate-90")}
              />
              {t("aiAnalysis.threads.archived")} ({archived.length})
            </button>
            {archiveOpen && <div className="space-y-0.5">{archived.map(renderRow)}</div>}
          </section>
        )}
      </div>
    </div>
  );
}

function MenuItem(props: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={props.onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted",
        props.destructive && "text-destructive",
      )}
    >
      {props.icon}
      {props.label}
    </button>
  );
}

/** Inline title editor: Enter saves, Escape cancels, blur saves. */
function RenameField(props: {
  initial: string;
  placeholder: string;
  onDone: (title: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = React.useState(props.initial);
  const cancelled = React.useRef(false);
  return (
    <Input
      autoFocus
      value={value}
      maxLength={120}
      placeholder={props.placeholder}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          props.onDone(value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancelled.current = true;
          props.onCancel();
        }
      }}
      onBlur={() => {
        if (!cancelled.current) props.onDone(value);
      }}
      className="h-9 text-sm"
    />
  );
}
