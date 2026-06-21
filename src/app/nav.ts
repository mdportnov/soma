/**
 * Route metadata registry — the single source of truth for navigation hierarchy.
 *
 * Each entry maps a route pattern (the `path` used in `<Route>`, e.g. `labs/:id`)
 * to its breadcrumb title key and its logical `parent` route. The parent is the
 * route the back affordance navigates "up" to — hierarchical, not browser
 * history, so a deep link or ⌘K jump still lands somewhere predictable.
 *
 * Breadcrumbs and the back button both consume this. Detail pages build their
 * trail with `crumbs(...)`, passing the static ancestor links plus the dynamic
 * leaf label (record data) the page already fetched.
 */

export type Crumb = {
  /** Visible label. Already translated, or a literal record value for leaves. */
  label: string;
  /** Target route for ancestor crumbs. Omitted on the current (leaf) crumb. */
  to?: string;
  /** Leaf crumbs that are record data opt back into text selection. */
  selectable?: boolean;
};

export type RouteMeta = {
  /** i18n key for the crumb/back label of this route. */
  titleKey: string;
  /** Logical parent route ("up"). Top-level routes have no parent. */
  parent?: string;
};

/**
 * Registry keyed by absolute route path (with leading slash). Only sub/detail
 * pages (depth >= 2) and their ancestors need entries — top-level pages reached
 * from the sidebar carry no breadcrumb, but ancestors are listed here so the
 * trail can resolve their labels.
 */
export const ROUTE_META: Record<string, RouteMeta> = {
  "/": { titleKey: "nav.dashboard" },
  "/biomarkers": { titleKey: "nav.biomarkers" },
  "/biomarkers/:id": { titleKey: "nav.biomarkers", parent: "/biomarkers" },
  "/labs": { titleKey: "nav.labResults" },
  "/labs/new": { titleKey: "breadcrumb.labPanelNew", parent: "/labs" },
  "/labs/import": { titleKey: "breadcrumb.importWizard", parent: "/labs" },
  "/labs/:id": { titleKey: "nav.labResults", parent: "/labs" },
  "/labs/:id/verify": { titleKey: "breadcrumb.verify", parent: "/labs/:id" },
  "/visits": { titleKey: "nav.visits" },
  "/visits/:id": { titleKey: "nav.visits", parent: "/visits" },
  "/diagnoses": { titleKey: "nav.diagnoses" },
  "/diagnoses/:id": { titleKey: "nav.diagnoses", parent: "/diagnoses" },
  "/medications": { titleKey: "nav.medications" },
  "/medications/:id": { titleKey: "nav.medications", parent: "/medications" },
  "/imaging": { titleKey: "nav.imaging" },
  "/imaging/new": { titleKey: "breadcrumb.imagingNew", parent: "/imaging" },
  "/imaging/:id": { titleKey: "nav.imaging", parent: "/imaging" },
  "/emergency": { titleKey: "emergency.openCard", parent: "/" },
  "/assistant": { titleKey: "nav.assistant" },
};

/**
 * Build a breadcrumb trail from ordered segments. Each tuple is
 * `[label, to?]`; the last segment is the current page and renders as
 * non-link text. Pass `{ selectable: true }` on data leaves so the record
 * value can be selected while chrome stays non-selectable.
 *
 * Ancestor labels are resolved by the page (usually via `t(...)`); this helper
 * only assembles the array so `Breadcrumbs`/`PageHeader` get a uniform shape.
 */
export function crumbs(...segments: Crumb[]): Crumb[] {
  return segments;
}

/**
 * Resolve the logical parent route for a concrete pathname, by matching it
 * against the registry patterns. Returns `undefined` for top-level routes.
 * Used by the back button so deep links / command-palette jumps still go "up"
 * the hierarchy rather than relying on browser history.
 */
export function resolveParent(pathname: string): string | undefined {
  const pattern = matchPattern(pathname);
  if (!pattern) return undefined;
  const parent = ROUTE_META[pattern]?.parent;
  if (!parent) return undefined;
  return resolveConcrete(parent, pathname);
}

/** Match a concrete pathname to its registered route pattern. */
function matchPattern(pathname: string): string | undefined {
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
