/**
 * Section interests — which optional areas of the app the user wants in the
 * sidebar. Lets a labs-only user hide vaccines / imaging / journal instead of
 * drowning in 16 nav items.
 *
 * Core areas (dashboard, timeline, labs, biomarkers, doctor report, settings)
 * are always visible and never gated. Every group here defaults to ON; an absent
 * stored value means "all enabled", so existing installs are unaffected and
 * hiding is strictly opt-in.
 *
 * Storage holds the HIDDEN groups (the complement), not the enabled ones, so a
 * brand-new section added in a future version is visible by default rather than
 * silently hidden for everyone who picked their interests before it existed.
 * It's a per-device UI preference in localStorage, deliberately outside backups.
 */

export const SECTION_GROUPS = [
  "meds",
  "conditions",
  "allergies",
  "vaccines",
  "imaging",
  "vitals",
  "ai",
] as const;

export type SectionGroup = (typeof SECTION_GROUPS)[number];

const STORAGE_KEY = "soma.sections.hidden";

/** Fires after the selection changes so a live sidebar can re-read it at once. */
export const INTERESTS_EVENT = "soma:interests";

/** Nav routes gated by a group. Routes not listed here are always shown. */
export const ROUTE_GROUP: Record<string, SectionGroup> = {
  "/assistant": "ai",
  "/medications": "meds",
  "/visits": "conditions",
  "/diagnoses": "conditions",
  "/allergies": "allergies",
  "/vaccines": "vaccines",
  "/imaging": "imaging",
  "/journal": "vitals",
  "/lifestyle": "vitals",
};

function isGroup(id: string): id is SectionGroup {
  return (SECTION_GROUPS as readonly string[]).includes(id);
}

/** The currently ENABLED groups (= all groups minus the stored hidden ones). */
export function loadInterests(): Set<SectionGroup> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return new Set(SECTION_GROUPS); // never set → everything on
    const hidden = new Set((JSON.parse(raw) as string[]).filter(isGroup));
    return new Set(SECTION_GROUPS.filter((g) => !hidden.has(g)));
  } catch {
    return new Set(SECTION_GROUPS);
  }
}

/** Persist by storing the complement (hidden groups) and notify live listeners. */
export function saveInterests(enabled: Set<SectionGroup>): void {
  try {
    const hidden = SECTION_GROUPS.filter((g) => !enabled.has(g));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(hidden));
    if (typeof window !== "undefined") window.dispatchEvent(new Event(INTERESTS_EVENT));
  } catch {
    /* storage unavailable — selection just won't persist this session */
  }
}

/** True when a nav route should be visible given the enabled groups. */
export function isRouteEnabled(route: string, enabled: Set<SectionGroup>): boolean {
  const group = ROUTE_GROUP[route];
  return group ? enabled.has(group) : true;
}
