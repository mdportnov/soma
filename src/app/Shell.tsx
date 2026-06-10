import * as React from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Activity,
  CalendarRange,
  FlaskConical,
  LayoutDashboard,
  Moon,
  Pill,
  Settings,
  Stethoscope,
  Sun,
  TestTubes,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { applyTheme, loadTheme, type Theme } from "@/lib/theme";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo.svg";

const NAV = [
  { to: "/", labelKey: "nav.dashboard", icon: LayoutDashboard, end: true },
  { to: "/timeline", labelKey: "nav.timeline", icon: CalendarRange },
  { to: "/biomarkers", labelKey: "nav.biomarkers", icon: Activity },
  { to: "/labs", labelKey: "nav.labResults", icon: TestTubes },
  { to: "/medications", labelKey: "nav.medications", icon: Pill },
  { to: "/visits", labelKey: "nav.visits", icon: Stethoscope },
  { to: "/diagnoses", labelKey: "nav.diagnoses", icon: FlaskConical },
];

export function Shell() {
  const { t } = useI18n();
  const [theme, setTheme] = React.useState<Theme>(() => loadTheme());
  const location = useLocation();

  React.useEffect(() => applyTheme(theme), [theme]);

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-14 shrink-0 flex-col border-r bg-card md:w-52">
        <div className="flex h-14 items-center gap-2.5 border-b px-3 md:px-4">
          <img src={logo} alt="Soma" className="size-7 shrink-0" />
          <span className="hidden text-sm font-semibold tracking-tight md:block">Soma</span>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          {NAV.map(({ to, labelKey, icon: Icon, end }) => {
            const label = t(labelKey);
            return (
              <NavLink
                key={to}
                to={to}
                end={end}
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
                <Icon className="size-4 shrink-0" />
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
          <Button
            variant="ghost"
            className="justify-start gap-2.5 px-2.5 text-muted-foreground"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title={t("theme.toggleTheme")}
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            <span className="hidden md:block">
              {theme === "dark" ? t("theme.lightMode") : t("theme.darkMode")}
            </span>
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        {/* key on pathname re-mounts the page so navigation fades in */}
        <div key={location.pathname} className="animate-step-in mx-auto max-w-6xl p-6 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
