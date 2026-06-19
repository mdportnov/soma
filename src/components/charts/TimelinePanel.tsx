import * as React from "react";
import { ChevronDown } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function readCollapsed(key?: string): boolean {
  if (!key) return false;
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/**
 * Collapsible card shell for the dashboard-style timelines (medications,
 * diagnoses, vaccines). A chevron button in the top-right toggles the body with
 * the same grid-rows height animation used by the shared Collapsible; the state
 * is remembered per `storageKey`. The main Timeline tab does not use this.
 */
export function TimelinePanel({
  title,
  right,
  storageKey,
  children,
}: {
  title: string;
  /** Optional header content shown left of the toggle (e.g. a legend). */
  right?: React.ReactNode;
  /** localStorage key to persist the collapsed state; omit to not persist. */
  storageKey?: string;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = React.useState(() => readCollapsed(storageKey));
  const contentId = React.useId();

  const toggle = () =>
    setCollapsed((c) => {
      const next = !c;
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, next ? "1" : "0");
        } catch {
          /* private mode / quota — non-fatal */
        }
      }
      return next;
    });

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        <div className="ml-auto flex items-center gap-3">
          {right}
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-controls={contentId}
            aria-label={collapsed ? t("common.expand") : t("common.collapse")}
            className="-mr-1 inline-flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronDown
              className={cn("size-4 transition-transform duration-200", collapsed && "-rotate-90")}
            />
          </button>
        </div>
      </div>

      <div
        id={contentId}
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: collapsed ? "0fr" : "1fr" }}
        aria-hidden={collapsed}
      >
        <div
          className={cn(
            "overflow-hidden transition-opacity duration-200",
            collapsed ? "opacity-0" : "opacity-100",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
