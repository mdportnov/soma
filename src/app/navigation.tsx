import * as React from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import type { Crumb } from "@/app/nav";
import {
  EMPTY_JOURNAL,
  buildTrail,
  isDrillState,
  recordVisit,
  resolveBack,
  type BackTarget,
  type Journal,
  type NavType,
  type Visit,
} from "@/app/nav-journal";
import { pageMotion, type PageMotion } from "@/lib/motion";

/**
 * React binding for the session journal (`nav-journal.ts`).
 *
 * The provider is the only place that writes the journal; everything else reads
 * derived answers from it. It sits directly under the router — above the shell —
 * so the shell's ⌘[ / ⌘] shortcuts and every page header see the same stack.
 */

type NavigationValue = {
  journal: Journal;
  /**
   * Pages announce their record title for the entry they are mounted on, so a
   * later crumb can say "Panel of Dec 4" instead of the registry's generic
   * "Lab results". Keyed by history entry, not by path: the same path visited
   * twice is two entries and either may be labelled.
   */
  registerLabel: (key: string, label: string) => void;
  canGoBack: boolean;
  canGoForward: boolean;
};

const NavigationContext = React.createContext<NavigationValue | null>(null);

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navType = useNavigationType() as NavType;
  const [journal, setJournal] = React.useState<Journal>(EMPTY_JOURNAL);
  const [labels, setLabels] = React.useState<Record<string, string>>({});

  // Layout effect, not effect: the page header renders in the same commit and
  // would otherwise show one frame of hierarchy-only breadcrumbs before the
  // journal catches up.
  React.useLayoutEffect(() => {
    setJournal((prev) =>
      recordVisit(
        prev,
        {
          key: location.key,
          path: location.pathname,
          search: location.search,
          drill: isDrillState(location.state),
        },
        navType,
      ),
    );
  }, [location.key, location.pathname, location.search, location.state, navType]);

  const registerLabel = React.useCallback((key: string, label: string) => {
    setLabels((prev) => (prev[key] === label ? prev : { ...prev, [key]: label }));
  }, []);

  // Labels live beside the journal rather than inside it so that a page
  // resolving its title late (after its query settles) does not rewrite history
  // entries; merging on read keeps `recordVisit` a pure fold.
  const labelled = React.useMemo<Journal>(() => {
    if (Object.keys(labels).length === 0) return journal;
    return {
      index: journal.index,
      entries: journal.entries.map((entry) =>
        labels[entry.key] ? { ...entry, label: labels[entry.key] } : entry,
      ),
    };
  }, [journal, labels]);

  const value = React.useMemo<NavigationValue>(
    () => ({
      journal: labelled,
      registerLabel,
      canGoBack: labelled.index > 0,
      canGoForward: labelled.index >= 0 && labelled.index < labelled.entries.length - 1,
    }),
    [labelled, registerLabel],
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

function useNavigation(): NavigationValue {
  const value = React.useContext(NavigationContext);
  if (!value) throw new Error("useNavigation must be used inside <NavigationProvider>");
  return value;
}

/** History affordances for the shell chrome (⌘[ / ⌘]). */
export function useHistoryControls() {
  const { canGoBack, canGoForward } = useNavigation();
  return { canGoBack, canGoForward };
}

/**
 * Entrance direction for the page on the current history entry, decided once
 * per entry. The shell renders the page in the same commit the provider folds
 * the visit into the journal, so on that first render the journal still
 * describes the *previous* state — exactly what `pageMotion` needs to tell a
 * step back from a step in. The answer is pinned to the entry key: once the
 * journal catches up the same call would say "none", and re-deriving it would
 * swap the animation mid-flight.
 */
export function usePageMotion(): PageMotion {
  const location = useLocation();
  const navType = useNavigationType() as NavType;
  const { journal } = useNavigation();
  const [pinned, setPinned] = React.useState<{ key: string; motion: PageMotion }>(() => ({
    key: location.key,
    motion: pageMotion(journal, visitOf(location), navType),
  }));
  if (pinned.key !== location.key) {
    // Derived state for a new entry, settled during render (the documented
    // React pattern for "remember something from the previous render").
    const next = { key: location.key, motion: pageMotion(journal, visitOf(location), navType) };
    setPinned(next);
    return next.motion;
  }
  return pinned.motion;
}

function visitOf(location: ReturnType<typeof useLocation>): Visit {
  return {
    key: location.key,
    path: location.pathname,
    search: location.search,
    drill: isDrillState(location.state),
  };
}

/** Follow a resolved back/crumb target: unwind history when we can, else push. */
export function useGoTo() {
  const navigate = useNavigate();
  return React.useCallback(
    (target: BackTarget | Crumb) => {
      if ("delta" in target && typeof target.delta === "number") {
        navigate(target.delta);
        return;
      }
      if (target.to) navigate(target.to);
    },
    [navigate],
  );
}

export type PageNav = {
  /** The current page's own crumb label — usually the record title. */
  leaf: string;
  /** Record leaves opt into text selection; static labels do not. */
  selectable?: boolean;
  /**
   * Overrides the hierarchical "up" for pages whose parent is contextual: the
   * import wizard belongs to whichever section opened it, not always to labs.
   */
  fallback?: Crumb;
  /**
   * Record titles for ancestor paths, so a crumb reads "Panel of Dec 4" even on
   * a deep link where no journal entry exists to carry the label.
   */
  labels?: Record<string, string>;
};

/**
 * Everything a detail page's header needs: the trail (structure, coloured by
 * the drill-downs actually walked) and the back target (the real previous
 * screen, or the hierarchy when there is none).
 */
export function usePageNav(nav: PageNav): { breadcrumbs: Crumb[]; back: BackTarget | null } {
  const { t } = useI18n();
  const location = useLocation();
  const { journal, registerLabel } = useNavigation();
  const { leaf, selectable, fallback, labels } = nav;

  React.useLayoutEffect(() => {
    if (leaf) registerLabel(location.key, leaf);
  }, [location.key, leaf, registerLabel]);

  const breadcrumbs = React.useMemo(
    () =>
      buildTrail(journal, {
        pathname: location.pathname,
        leaf: { label: leaf, selectable },
        t,
        labels,
        fallback,
      }),
    [journal, location.pathname, leaf, selectable, t, labels, fallback],
  );

  const back = React.useMemo(
    () => resolveBack(journal, location.pathname, fallback?.to),
    [journal, location.pathname, fallback?.to],
  );

  return { breadcrumbs, back };
}
