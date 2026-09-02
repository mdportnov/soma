import { describe, expect, it } from "vitest";
import {
  EMPTY_JOURNAL,
  MAX_JOURNAL_ENTRIES,
  MAX_TRAIL_DEPTH,
  buildTrail,
  drillState,
  isDrillState,
  recordVisit,
  resolveBack,
  type Journal,
  type NavType,
} from "./nav-journal";

/** Terse label resolver: crumbs come out as the raw i18n key, easy to assert on. */
const t = (key: string) => key;

let keySeed = 0;
const nextKey = () => `k${++keySeed}`;

/**
 * Replay a walk through the app. `path` alone is a push; `"path!"` marks a
 * drill-down link; `"~path"` is a replace of the current entry; a number is a
 * history delta (back/forward), which replays the entry we land on with its
 * original key, exactly as the router does.
 */
function walk(steps: (string | number)[]): Journal {
  let journal = EMPTY_JOURNAL;
  const keys: string[] = [];
  for (const step of steps) {
    if (typeof step === "number") {
      const target = journal.index + step;
      const entry = journal.entries[target];
      if (!entry) throw new Error(`no history entry at ${target}`);
      journal = recordVisit(journal, { ...entry }, "POP");
      continue;
    }
    const replace = step.startsWith("~");
    const drill = step.endsWith("!");
    const raw = step.replace(/^~/, "").replace(/!$/, "");
    const [path, search = ""] = raw.split(/(?=\?)/);
    const key = nextKey();
    keys.push(key);
    journal = recordVisit(
      journal,
      { key, path, search, drill },
      replace ? "REPLACE" : ("PUSH" as NavType),
    );
  }
  return journal;
}

const paths = (journal: Journal) => journal.entries.map((e) => e.path);
const labels = (journal: Journal, leaf: string, options = {}) =>
  buildTrail(journal, {
    pathname: journal.entries[journal.index]?.path ?? "/",
    leaf: { label: leaf },
    t,
    ...options,
  }).map((c) => c.label);

describe("drill state", () => {
  it("recognises only its own marker", () => {
    expect(isDrillState(drillState)).toBe(true);
    expect(isDrillState({ somaDrill: false })).toBe(false);
    expect(isDrillState(null)).toBe(false);
    expect(isDrillState(undefined)).toBe(false);
    expect(isDrillState("somaDrill")).toBe(false);
  });
});

describe("recordVisit", () => {
  it("appends pushes and moves the pointer", () => {
    const journal = walk(["/labs", "/labs/42", "/biomarkers/7"]);
    expect(paths(journal)).toEqual(["/labs", "/labs/42", "/biomarkers/7"]);
    expect(journal.index).toBe(2);
  });

  it("moves the pointer on a POP without truncating the forward half", () => {
    const journal = walk(["/labs", "/labs/42", "/biomarkers/7", -1]);
    expect(paths(journal)).toEqual(["/labs", "/labs/42", "/biomarkers/7"]);
    expect(journal.index).toBe(1);
  });

  it("drops the forward half once the user pushes from a popped position", () => {
    const journal = walk(["/labs", "/labs/42", "/biomarkers/7", -2, "/visits"]);
    expect(paths(journal)).toEqual(["/labs", "/visits"]);
    expect(journal.index).toBe(1);
  });

  it("swaps a replace in place and inherits the drill flag it overwrites", () => {
    // Landing on a biomarker from a panel, then the highlight parameter being
    // consumed with a replace: still the same step, still a drill-down.
    const journal = walk(["/labs/42", "/biomarkers/7?highlight=3!", "~/biomarkers/7"]);
    expect(paths(journal)).toEqual(["/labs/42", "/biomarkers/7"]);
    expect(journal.entries[1].search).toBe("");
    expect(journal.entries[1].drill).toBe(true);
    expect(journal.index).toBe(1);
  });

  it("returns the same object when the visit changes nothing", () => {
    const journal = walk(["/labs"]);
    const entry = journal.entries[0];
    expect(recordVisit(journal, { ...entry }, "POP")).toBe(journal);
  });

  it("evicts the oldest entries past the cap and keeps the pointer aligned", () => {
    const journal = walk(Array.from({ length: MAX_JOURNAL_ENTRIES + 5 }, (_, i) => `/labs/${i}`));
    expect(journal.entries).toHaveLength(MAX_JOURNAL_ENTRIES);
    expect(journal.index).toBe(MAX_JOURNAL_ENTRIES - 1);
    expect(journal.entries[0].path).toBe("/labs/5");
  });
});

describe("resolveBack", () => {
  it("unwinds history to the screen the user actually came from", () => {
    // The bug this whole module exists for: a biomarker opened from a panel
    // must not send the user to the biomarker list.
    const journal = walk(["/labs", "/labs/42", "/biomarkers/7!"]);
    expect(resolveBack(journal, "/biomarkers/7")).toEqual({
      kind: "history",
      delta: -1,
      to: "/labs/42",
    });
  });

  it("falls back to the hierarchy when there is no recorded history", () => {
    expect(resolveBack(EMPTY_JOURNAL, "/biomarkers/7")).toEqual({
      kind: "path",
      to: "/biomarkers",
    });
    expect(resolveBack(EMPTY_JOURNAL, "/labs/42/verify")).toEqual({
      kind: "path",
      to: "/labs/42",
    });
  });

  it("falls back to the hierarchy when the journal is out of sync with the page", () => {
    // After a window reload the router hands us a fresh key on a deep path.
    const journal = walk(["/labs"]);
    expect(resolveBack(journal, "/biomarkers/7")).toEqual({ kind: "path", to: "/biomarkers" });
  });

  it("has nothing to offer on a top-level page opened first", () => {
    expect(resolveBack(walk(["/labs"]), "/labs")).toBeNull();
    expect(resolveBack(EMPTY_JOURNAL, "/labs")).toBeNull();
  });

  it("walks past a wizard that already saved its record", () => {
    // /labs -> import -> the panel it created. Back belongs on /labs; returning
    // to a finished wizard would re-open work the user is done with.
    const journal = walk(["/labs", "/labs/import", "/labs/42"]);
    expect(resolveBack(journal, "/labs/42")).toEqual({ kind: "history", delta: -2, to: "/labs" });
  });

  it("walks past a creation form the same way", () => {
    const journal = walk(["/labs", "/labs/new", "/labs/42"]);
    expect(resolveBack(journal, "/labs/42")).toEqual({ kind: "history", delta: -2, to: "/labs" });
  });

  it("drops to the hierarchy when everything behind us is spent", () => {
    const journal = walk(["/labs/import", "/labs/42"]);
    expect(resolveBack(journal, "/labs/42")).toEqual({ kind: "path", to: "/labs" });
  });

  it("skips entries for the page we are already on", () => {
    // The assistant rewriting ?thread=, or a list swapping tabs: back should
    // leave the page, not click through its own view states.
    const journal = walk(["/timeline", "/assistant?thread=1", "/assistant?thread=2"]);
    expect(resolveBack(journal, "/assistant")).toEqual({
      kind: "history",
      delta: -2,
      to: "/timeline",
    });
  });

  it("keeps the search of the entry it returns to", () => {
    const journal = walk(["/journal?tab=weight", "/labs/42"]);
    expect(resolveBack(journal, "/labs/42")).toEqual({
      kind: "history",
      delta: -1,
      to: "/journal?tab=weight",
    });
  });

  it("honours a contextual parent over the registry one", () => {
    // The import wizard opened from Vaccines belongs to vaccines, not labs.
    expect(resolveBack(EMPTY_JOURNAL, "/labs/import", "/vaccines")).toEqual({
      kind: "path",
      to: "/vaccines",
    });
  });

  it("returns a sideways arrival honestly rather than inventing a parent", () => {
    // ⌘K from medications to a biomarker: back means medications.
    const journal = walk(["/medications", "/biomarkers/7"]);
    expect(resolveBack(journal, "/biomarkers/7")).toEqual({
      kind: "history",
      delta: -1,
      to: "/medications",
    });
  });
});

describe("buildTrail", () => {
  it("shows the hierarchy when the page was opened from its own list", () => {
    const journal = walk(["/biomarkers", "/biomarkers/7"]);
    expect(labels(journal, "Haemoglobin")).toEqual(["nav.biomarkers", "Haemoglobin"]);
  });

  it("shows the walked path when the record was drilled into from another one", () => {
    const journal = walk(["/labs", "/labs/42", "/biomarkers/7!"]);
    const trail = buildTrail(journal, {
      pathname: "/biomarkers/7",
      leaf: { label: "Haemoglobin", selectable: true },
      t,
      labels: {},
    });
    expect(trail.map((c) => c.label)).toEqual(["nav.labResults", "nav.labResults", "Haemoglobin"]);
    expect(trail.map((c) => c.to)).toEqual(["/labs", "/labs/42", undefined]);
  });

  it("prefers the record title a page registered over the registry's generic label", () => {
    const journal = walk(["/labs", "/labs/42", "/biomarkers/7!"]);
    journal.entries[1].label = "Panel of Dec 4";
    expect(labels(journal, "Haemoglobin")).toEqual([
      "nav.labResults",
      "Panel of Dec 4",
      "Haemoglobin",
    ]);
  });

  it("takes an explicit label override, so a deep link reads right too", () => {
    expect(
      labels(walk(["/labs/42/verify"]), "breadcrumb.verify", {
        labels: { "/labs/42": "Panel of Dec 4" },
      }),
    ).toEqual(["nav.labResults", "Panel of Dec 4", "breadcrumb.verify"]);
  });

  it("does not graft an unrelated page onto the trail after a sideways jump", () => {
    // ⌘K from medications: the crumbs must describe the structure, not the jump.
    const journal = walk(["/medications", "/biomarkers/7"]);
    expect(labels(journal, "Haemoglobin")).toEqual(["nav.biomarkers", "Haemoglobin"]);
  });

  it("stops the chain at the first step that was not a drill-down", () => {
    // Panel -> biomarker (drill), then ⌘K to a visit: only the visit's own
    // hierarchy survives.
    const journal = walk(["/labs/42", "/biomarkers/7!", "/visits/9"]);
    expect(labels(journal, "Dr Ivanova")).toEqual(["nav.visits", "Dr Ivanova"]);
  });

  it("chains several drill-downs and roots them in the hierarchy", () => {
    const journal = walk(["/visits", "/visits/9", "/diagnoses/3!", "/medications/5!"]);
    expect(labels(journal, "Metformin")).toEqual([
      "nav.visits",
      "nav.visits",
      "nav.diagnoses",
      "Metformin",
    ]);
  });

  it("keeps the trail short enough to stay on one line", () => {
    const journal = walk([
      "/visits",
      "/visits/9",
      "/diagnoses/3!",
      "/medications/5!",
      "/labs/42!",
      "/biomarkers/7!",
    ]);
    expect(labels(journal, "Haemoglobin")).toHaveLength(MAX_TRAIL_DEPTH);
  });

  it("replaces the hierarchical root with a contextual one", () => {
    // Import opened from the Vaccines page.
    const journal = walk(["/vaccines", "/labs/import?type=vaccine"]);
    expect(
      labels(journal, "breadcrumb.importWizard", {
        fallback: { label: "nav.vaccines", to: "/vaccines" },
      }),
    ).toEqual(["nav.vaccines", "breadcrumb.importWizard"]);
  });

  it("falls back to pure hierarchy when the journal knows nothing", () => {
    expect(labels(EMPTY_JOURNAL, "Haemoglobin", { pathname: "/biomarkers/7" })).toEqual([
      "nav.biomarkers",
      "Haemoglobin",
    ]);
  });

  it("marks crumbs that sit behind us so clicking them unwinds history", () => {
    const journal = walk(["/labs", "/labs/42", "/biomarkers/7!"]);
    const trail = buildTrail(journal, {
      pathname: "/biomarkers/7",
      leaf: { label: "Haemoglobin" },
      t,
    });
    expect(trail.map((c) => c.delta)).toEqual([-2, -1, undefined]);
  });

  it("leaves a crumb that is not in history as a plain link", () => {
    const journal = walk(["/biomarkers/7"]);
    const trail = buildTrail(journal, {
      pathname: "/biomarkers/7",
      leaf: { label: "Haemoglobin" },
      t,
    });
    expect(trail[0]).toEqual({ label: "nav.biomarkers", to: "/biomarkers" });
  });
});
