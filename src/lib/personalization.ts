/**
 * Personalization persistence — the bridge between the fast localStorage prefs
 * (sidebar sections, dashboard cards, notification mutes) and a durable copy on
 * the profile row, so a user's layout choices travel in a backup and survive a
 * reinstall or a move to a new device.
 *
 * localStorage stays the synchronous source of truth the sidebar and bell read
 * on every render; this module mirrors it up to the DB on every change and, once
 * per device, hydrates from the DB when a restored profile carries prefs the
 * fresh install hasn't seen yet. Per-device chrome (theme, dismissed hints) is
 * deliberately NOT synced — those should reset on a new device.
 */

import type { UiPrefs } from "@/db/schema";
import { getProfile, updateProfile } from "@/db/repos";
import { loadInterests, saveInterests, SECTION_GROUPS, type SectionGroup } from "@/lib/interests";
import {
  DASHBOARD_WIDGETS,
  loadDashboardWidgets,
  saveDashboardWidgets,
  type DashboardWidget,
} from "@/lib/dashboard-prefs";
import {
  loadNotificationPrefs,
  saveNotificationPrefs,
  clearDismissedNotifications,
} from "@/lib/notifications";
import { clearDismissedHints } from "@/lib/hints";

/** Marks that this device has run its one-time hydrate from the DB. */
const HYDRATED_KEY = "soma.personalization.hydrated";

/** Read the current localStorage prefs into the shape stored on the profile. */
export function collectPersonalization(): UiPrefs {
  const enabledSections = loadInterests();
  const enabledWidgets = loadDashboardWidgets();
  const notifications = loadNotificationPrefs();
  return {
    sectionsHidden: SECTION_GROUPS.filter((g) => !enabledSections.has(g)),
    dashboardHidden: DASHBOARD_WIDGETS.filter((w) => !enabledWidgets.has(w)),
    notifications,
  };
}

/** Write a stored bundle back into the live localStorage prefs. */
export function applyPersonalization(prefs: UiPrefs): void {
  if (prefs.sectionsHidden) {
    const hidden = new Set(prefs.sectionsHidden);
    saveInterests(new Set(SECTION_GROUPS.filter((g) => !hidden.has(g)) as SectionGroup[]));
  }
  if (prefs.dashboardHidden) {
    const hidden = new Set(prefs.dashboardHidden);
    saveDashboardWidgets(
      new Set(DASHBOARD_WIDGETS.filter((w) => !hidden.has(w)) as DashboardWidget[]),
    );
  }
  if (prefs.notifications) {
    const cur = loadNotificationPrefs();
    saveNotificationPrefs({ ...cur, ...prefs.notifications });
  }
}

/**
 * Restore everything personalization-related to defaults: all sidebar sections
 * and dashboard cards visible, all notification categories on, and every
 * dismissed notification / first-run hint brought back. Also clears the mirror
 * on the profile. The escape hatch for an over-customized install.
 */
export async function resetPersonalization(profileId: number): Promise<void> {
  saveInterests(new Set(SECTION_GROUPS as readonly SectionGroup[]));
  saveDashboardWidgets(new Set(DASHBOARD_WIDGETS as readonly DashboardWidget[]));
  saveNotificationPrefs({ medication: true, retest: true, retestUpcoming: true });
  clearDismissedNotifications();
  clearDismissedHints();
  try {
    await updateProfile(profileId, { uiPrefs: null });
  } catch {
    /* the local reset already applied; the mirror clears on the next change */
  }
}

/** Mirror the current localStorage prefs onto the profile. Fire-and-forget. */
export async function syncPersonalizationToDb(profileId: number): Promise<void> {
  try {
    await updateProfile(profileId, { uiPrefs: collectPersonalization() });
  } catch {
    /* a failed mirror just means this change lives only in localStorage for now */
  }
}

/**
 * Once per device, pull personalization from the profile when localStorage has
 * never been written here (a fresh install whose DB came from a backup). On a
 * device that already customized things, the local copy wins and we only stamp
 * the marker. Safe to call on every boot.
 */
export async function hydratePersonalizationFromDb(profileId: number): Promise<void> {
  try {
    if (localStorage.getItem(HYDRATED_KEY)) return;
    const prof = await getProfile(profileId);
    if (prof?.uiPrefs) applyPersonalization(prof.uiPrefs);
    localStorage.setItem(HYDRATED_KEY, "1");
  } catch {
    /* hydrate is best-effort; the app still opens with defaults */
  }
}
