/**
 * Route metadata registry — the structural map of the app.
 *
 * Each entry maps a route pattern (the `path` used in `<Route>`, e.g. `labs/:id`)
 * to its breadcrumb title key and its logical `parent` route. This describes
 * *where a page sits in the data*, which is a different question from *how the
 * user got there* — the latter lives in `nav-journal.ts`.
 *
 * The split matters. Breadcrumbs answer "where am I"; the back affordance
 * answers "where was I". They agree on a straight drill-down and disagree the
 * moment the user arrives sideways (⌘K, a notification, the timeline, a record
 * link inside a chat). The hierarchy here is the safety net for both: when the
 * session journal has nothing to say — a deep link, a window reload, the first
 * screen of a run — back and the trail both fall back to it and still land
 * somewhere the user can make sense of.
 */

export type Crumb = {
  /** Visible label. Already translated, or a literal record value for leaves. */
  label: string;
  /** Target route for ancestor crumbs. Omitted on the current (leaf) crumb. */
  to?: string;
  /** Leaf crumbs that are record data opt back into text selection. */
  selectable?: boolean;
  /**
   * Set when this crumb's target is a history entry we are still standing in
   * front of. Clicking it then unwinds history (`navigate(delta)`) instead of
   * pushing a fresh entry, so the stack shortens the way the user expects and
   * the page they land on keeps its scroll position.
   */
  delta?: number;
};

export type RouteMeta = {
  /** i18n key for the crumb/back label of this route. */
  titleKey: string;
  /** Logical parent route ("up"). Top-level routes have no parent. */
  parent?: string;
  /**
   * A page that is spent once the user leaves it going forward: creation forms
   * and the import wizard. It is never a back target — returning to a wizard
   * that already saved its record would re-open finished work — so the journal
   * walks straight past it when resolving "back" and when building a trail.
   */
  transient?: boolean;
};

/**
 * Registry keyed by absolute route path (with leading slash). Every route in
 * `App.tsx` is listed, even the top-level ones that carry no breadcrumb of
 * their own: they are the ancestors and the back targets of the deep pages, and
 * the journal needs to be able to label and classify any path it recorded.
 */
export const ROUTE_META: Record<string, RouteMeta> = {
  "/": { titleKey: "nav.dashboard" },
  "/timeline": { titleKey: "nav.timeline" },
  "/biomarkers": { titleKey: "nav.biomarkers" },
  "/biomarkers/:id": { titleKey: "nav.biomarkers", parent: "/biomarkers" },
  "/labs": { titleKey: "nav.labResults" },
  "/labs/new": { titleKey: "breadcrumb.labPanelNew", parent: "/labs", transient: true },
  "/labs/import": { titleKey: "breadcrumb.importWizard", parent: "/labs", transient: true },
  "/labs/compare": { titleKey: "labCompare.title", parent: "/labs" },
  "/labs/:id": { titleKey: "nav.labResults", parent: "/labs" },
  "/labs/:id/verify": { titleKey: "breadcrumb.verify", parent: "/labs/:id" },
  "/visits": { titleKey: "nav.visits" },
  "/visits/:id": { titleKey: "nav.visits", parent: "/visits" },
  "/diagnoses": { titleKey: "nav.diagnoses" },
  "/diagnoses/:id": { titleKey: "nav.diagnoses", parent: "/diagnoses" },
  "/medications": { titleKey: "nav.medications" },
  "/medications/:id": { titleKey: "nav.medications", parent: "/medications" },
  "/allergies": { titleKey: "nav.allergies" },
  "/vaccines": { titleKey: "nav.vaccines" },
  "/imaging": { titleKey: "nav.imaging" },
  "/imaging/new": { titleKey: "breadcrumb.imagingNew", parent: "/imaging", transient: true },
  "/imaging/:id": { titleKey: "nav.imaging", parent: "/imaging" },
  "/emergency": { titleKey: "emergency.openCard", parent: "/" },
  "/assistant": { titleKey: "nav.assistant" },
  "/lifestyle": { titleKey: "nav.lifestyle" },
  "/journal": { titleKey: "nav.journal" },
  "/notes": { titleKey: "nav.notes" },
  "/notifications": { titleKey: "nav.notifications" },
  "/report": { titleKey: "nav.report", parent: "/" },
  "/settings": { titleKey: "nav.settings" },
};

/** Guard against a malformed registry cycle turning an ancestor walk into a hang. */
const MAX_ANCESTOR_DEPTH = 6;

/**
 * Resolve the logical parent route for a concrete pathname, by matching it
 * against the registry patterns. Returns `undefined` for top-level routes.
 * This is the hierarchy — the fallback when the session journal cannot say
 * where the user actually came from.
 */
export function resolveParent(pathname: string): string | undefined {
  const pattern = matchRoute(pathname);
  if (!pattern) return undefined;
  const parent = ROUTE_META[pattern]?.parent;
  if (!parent) return undefined;
  return resolveConcrete(parent, pathname);
}

/**
 * Concrete ancestor paths for a pathname, root-most first, excluding the page
 * itself: `/labs/42/verify` -> `["/labs", "/labs/42"]`.
 */
export function ancestorChain(pathname: string): string[] {
  const out: string[] = [];
  let current = pathname;
  for (let i = 0; i < MAX_ANCESTOR_DEPTH; i++) {
    const parent = resolveParent(current);
    if (!parent || parent === current || out.includes(parent)) break;
    out.unshift(parent);
    current = parent;
  }
  return out;
}

/** i18n key for a concrete pathname's own label, if the route is registered. */
export function routeTitleKey(pathname: string): string | undefined {
  const pattern = matchRoute(pathname);
  return pattern ? ROUTE_META[pattern]?.titleKey : undefined;
}

/** True for wizards and creation forms — pages that must never be a back target. */
export function isTransientRoute(pathname: string): boolean {
  const pattern = matchRoute(pathname);
  return pattern ? ROUTE_META[pattern]?.transient === true : false;
}

/** Match a concrete pathname to its registered route pattern. */
export function matchRoute(pathname: string): string | undefined {
  const path = normalize(pathname);
  if (ROUTE_META[path]) return path;
  const parts = path.split("/");
  for (const pattern of Object.keys(ROUTE_META)) {
    const pp = pattern.split("/");
    if (pp.length !== parts.length) continue;
    if (pp.every((seg, i) => seg.startsWith(":") || seg === parts[i])) return pattern;
  }
  return undefined;
}

/**
 * Substitute dynamic params from the concrete pathname into a parent pattern,
 * e.g. parent `/labs/:id` + current `/labs/42/verify` -> `/labs/42`.
 */
function resolveConcrete(parentPattern: string, currentPathname: string): string {
  const parentParts = parentPattern.split("/");
  const currentParts = normalize(currentPathname).split("/");
  return parentParts
    .map((seg, i) => (seg.startsWith(":") ? (currentParts[i] ?? seg) : seg))
    .join("/");
}

function normalize(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname || "/";
}
