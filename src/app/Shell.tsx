import * as React from "react";
import { NavLink, Outlet, useLocation, useNavigationType } from "react-router-dom";
import {
  Activity,
  Bell,
  CalendarRange,
  FileText,
  FlaskConical,
  HeartPulse,
  LayoutDashboard,
  NotebookPen,
  Pill,
  Search,
  ScanLine,
  Settings,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  Syringe,
  TestTubes,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/app/AppContext";
import { useQuery } from "@/hooks/useQuery";
import { getNotificationFeedData } from "@/db/repos";
import { buildNotificationFeed, loadDismissedIds, visibleNotifications } from "@/lib/notifications";
import { Button } from "@/components/ui/button";
import { CommandPalette } from "@/components/app/CommandPalette";
import logo from "@/assets/logo.svg";

type NavItem =
  | { kind: "link"; to: string; labelKey: string; icon: React.ElementType; end?: boolean }
  | { kind: "label"; labelKey: string };

/** Cap on retained per-history-entry scroll offsets (prevents unbounded growth). */
const MAX_SCROLL_ENTRIES = 50;

const NAV: NavItem[] = [
  { kind: "link", to: "/", labelKey: "nav.dashboard", icon: LayoutDashboard, end: true },
  { kind: "link", to: "/timeline", labelKey: "nav.timeline", icon: CalendarRange },
  { kind: "link", to: "/assistant", labelKey: "nav.assistant", icon: Sparkles },
  { kind: "label", labelKey: "nav.records" },
  { kind: "link", to: "/diagnoses", labelKey: "nav.diagnoses", icon: FlaskConical },
  { kind: "link", to: "/allergies", labelKey: "nav.allergies", icon: ShieldAlert },
  { kind: "link", to: "/vaccines", labelKey: "nav.vaccines", icon: Syringe },
  { kind: "link", to: "/imaging", labelKey: "nav.imaging", icon: ScanLine },
  { kind: "label", labelKey: "nav.labsVitals" },
  { kind: "link", to: "/labs", labelKey: "nav.labResults", icon: TestTubes },
  { kind: "link", to: "/biomarkers", labelKey: "nav.biomarkers", icon: Activity },
  { kind: "link", to: "/journal", labelKey: "nav.journal", icon: NotebookPen },
  { kind: "link", to: "/lifestyle", labelKey: "nav.lifestyle", icon: HeartPulse },
  { kind: "label", labelKey: "nav.care" },
  { kind: "link", to: "/medications", labelKey: "nav.medications", icon: Pill },
  { kind: "link", to: "/visits", labelKey: "nav.visits", icon: Stethoscope },
  { kind: "link", to: "/report", labelKey: "nav.report", icon: FileText },
];

/**
 * Bell affordance in the chrome header: a count badge of the live in-app
 * notifications feed (medication-intake nudges + due re-tests), minus anything
 * the user dismissed. Re-fetched on every navigation so logging a med or
 * dismissing an item from the feed page reflects without a manual reload.
 */
function NotificationBell() {
  const { t } = useI18n();
  const { profileId } = useApp();
  const location = useLocation();
  const { data: count } = useQuery(async () => {
    const data = await getNotificationFeedData(profileId);
    const items = visibleNotifications(buildNotificationFeed(data), loadDismissedIds());
    return items.length;
    // Re-run on navigation so the badge stays fresh across the session.
  }, [profileId, location.key]);

  const n = count ?? 0;
  return (
    <NavLink
      to="/notifications"
      title={t("nav.notifications")}
      aria-label={t("nav.notifications")}
      className={({ isActive }) =>
        cn(
          "relative inline-flex size-8 items-center justify-center rounded-md transition-colors",
          isActive
            ? "bg-secondary text-secondary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )
      }
    >
      <Bell className="size-4" />
      {n > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
          {n > 9 ? "9+" : n}
        </span>
      )}
    </NavLink>
  );
}

export function Shell() {
  const { t } = useI18n();
  const [searchOpen, setSearchOpen] = React.useState(false);
  const location = useLocation();
  const navType = useNavigationType();
  const mainRef = React.useRef<HTMLElement>(null);
  // Per-history-entry scroll offsets, keyed by location.key (unique per entry).
  const scrollPositions = React.useRef(new Map<string, number>());
  const lastKey = React.useRef<string>(location.key);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Continuously record the current entry's scroll offset so it's available
  // the moment we navigate away (the page DOM is gone by the next render).
  // WKWebView scrolls the <main> container, not window — bind to it directly.
  React.useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const onScroll = () => {
      const positions = scrollPositions.current;
      positions.set(lastKey.current, main.scrollTop);
      // Bound the map: one entry per visited history key would otherwise grow
      // forever over a long session. Evict oldest (insertion-ordered), never the
      // entry we're actively scrolling.
      while (positions.size > MAX_SCROLL_ENTRIES) {
        const oldest = positions.keys().next().value;
        if (oldest === undefined || oldest === lastKey.current) break;
        positions.delete(oldest);
      }
    };
    main.addEventListener("scroll", onScroll, { passive: true });
    return () => main.removeEventListener("scroll", onScroll);
  }, []);

  // Scroll restoration: on POP (browser back/forward) restore the saved offset
  // for the entry we land on; on PUSH/REPLACE (forward to a new page) go to top.
  React.useLayoutEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    lastKey.current = location.key;
    if (navType === "POP") {
      main.scrollTop = scrollPositions.current.get(location.key) ?? 0;
    } else {
      main.scrollTop = 0;
    }
  }, [location.key, navType]);

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-14 shrink-0 flex-col border-r bg-card md:w-52">
        <div className="flex h-14 items-center gap-2.5 border-b px-3 md:px-4">
          <img src={logo} alt="Soma" className="size-7 shrink-0" />
          <span className="hidden text-sm font-semibold tracking-tight md:block">Soma</span>
          <div className="ml-auto hidden items-center gap-0.5 md:flex">
            <Button
              variant="ghost"
              size="iconSm"
              className="text-muted-foreground"
              onClick={() => setSearchOpen(true)}
              title={`${t("search.open")} (⌘K)`}
              aria-label={t("search.open")}
            >
              <Search className="size-4" />
            </Button>
            <NotificationBell />
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {NAV.map((item) => {
            if (item.kind === "label") {
              return (
                <span
                  key={item.labelKey}
                  className="mt-2 hidden px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground md:block"
                >
                  {t(item.labelKey)}
                </span>
              );
            }
            const label = t(item.labelKey);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                title={label}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )
                }
              >
                <item.icon className="size-4 shrink-0" />
                <span className="hidden md:block">{label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="flex flex-col gap-0.5 border-t p-2">
          <NavLink
            to="/settings"
            title={t("nav.settings")}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )
            }
          >
            <Settings className="size-4 shrink-0" />
            <span className="hidden md:block">{t("nav.settings")}</span>
          </NavLink>
        </div>
      </aside>
      <main ref={mainRef} className="flex-1 overflow-y-auto">
        {/* key on location.key re-mounts the page so navigation fades in;
            scroll restoration is handled imperatively on <main> above. */}
        <div key={location.key} className="animate-step-in mx-auto max-w-6xl p-6 md:p-8">
          <Outlet />
        </div>
      </main>
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
