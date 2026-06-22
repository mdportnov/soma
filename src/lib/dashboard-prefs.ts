/**
 * Dashboard layout preferences — which widgets the user wants on the home
 * screen. Lets someone hide the critical-allergy banner, the health verdict, or
 * the recent-activity feed instead of seeing every card on every launch.
 *
 * Mirrors the section-interests model in `interests.ts`: every widget defaults
 * to ON, and storage holds the HIDDEN complement (not the enabled set) so a new
 * widget added in a future version is visible by default rather than silently
 * hidden for everyone who customized their dashboard before it existed.
 *
 * Per-device UI preference in localStorage, deliberately outside backups.
 */

export const DASHBOARD_WIDGETS = [
  "safetyBanner",
  "verdict",
  "stats",
  "attention",
  "review",
  "changes",
  "activity",
] as const;

export type DashboardWidget = (typeof DASHBOARD_WIDGETS)[number];

const STORAGE_KEY = "soma.dashboard.hidden";

/** Fires after the selection changes so a live dashboard can re-read at once. */
export const DASHBOARD_PREFS_EVENT = "soma:dashboard-prefs";

function isWidget(id: string): id is DashboardWidget {
  return (DASHBOARD_WIDGETS as readonly string[]).includes(id);
}

/** The currently ENABLED widgets (= all widgets minus the stored hidden ones). */
export function loadDashboardWidgets(): Set<DashboardWidget> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return new Set(DASHBOARD_WIDGETS); // never set → everything on
    const hidden = new Set((JSON.parse(raw) as string[]).filter(isWidget));
    return new Set(DASHBOARD_WIDGETS.filter((w) => !hidden.has(w)));
  } catch {
    return new Set(DASHBOARD_WIDGETS);
  }
}

/** Persist by storing the complement (hidden widgets) and notify live listeners. */
export function saveDashboardWidgets(enabled: Set<DashboardWidget>): void {
  try {
    const hidden = DASHBOARD_WIDGETS.filter((w) => !enabled.has(w));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(hidden));
    if (typeof window !== "undefined") window.dispatchEvent(new Event(DASHBOARD_PREFS_EVENT));
  } catch {
    /* storage unavailable — selection just won't persist this session */
  }
}
