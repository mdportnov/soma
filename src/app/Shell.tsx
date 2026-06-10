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
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo.svg";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/timeline", label: "Timeline", icon: CalendarRange },
  { to: "/biomarkers", label: "Biomarkers", icon: Activity },
  { to: "/labs", label: "Lab results", icon: TestTubes },
  { to: "/medications", label: "Medications", icon: Pill },
  { to: "/visits", label: "Visits", icon: Stethoscope },
  { to: "/diagnoses", label: "Diagnoses", icon: FlaskConical },
];

export function Shell() {
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
          {NAV.map(({ to, label, icon: Icon, end }) => (
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
          ))}
        </nav>
        <div className="flex flex-col gap-0.5 border-t p-2">
          <NavLink
            to="/settings"
            title="Settings"
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
            <span className="hidden md:block">Settings</span>
          </NavLink>
          <Button
            variant="ghost"
            className="justify-start gap-2.5 px-2.5 text-muted-foreground"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title="Toggle theme"
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            <span className="hidden md:block">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
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
