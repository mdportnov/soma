import type { ElementType } from "react";
import {
  FileDown,
  FilePlus2,
  GitCompareArrows,
  ScanLine,
  Settings as SettingsIcon,
  ShieldAlert,
} from "lucide-react";
import { NAV } from "@/app/nav-items";
import { isRouteEnabled, type SectionGroup } from "@/lib/interests";
import { normalizeLabel } from "@/lib/fuzzy";

/**
 * The non-record half of ⌘K: jump to a section, or start something.
 *
 * Section commands are derived from the sidebar's own `NAV` list, so a section
 * added or renamed there shows up here for free and can never disagree with it.
 * Quick actions are the routes that *do* something rather than list something —
 * every one of them is a real route in `App.tsx`; there is no command here that
 * navigates somewhere the router doesn't serve.
 */

export type CommandKind = "nav" | "action";

export type Command = {
  /** Stable id, also the i18n key suffix for actions. */
  id: string;
  kind: CommandKind;
  /** Destination path. */
  to: string;
  /** Translation key for the visible label. */
  labelKey: string;
  icon: ElementType;
  /**
   * Section route this command belongs to, when it is not `to` itself — an
   * action inherits the visibility of the section it acts on ("Add imaging"
   * disappears with the Imaging section).
   */
  gate?: string;
};

/** Actions worth a keystroke, in the order they are offered. */
const QUICK_ACTIONS: Command[] = [
  {
    id: "newLabPanel",
    kind: "action",
    to: "/labs/new",
    labelKey: "search.commands.newLabPanel",
    icon: FilePlus2,
  },
  {
    id: "importLabs",
    kind: "action",
    to: "/labs/import",
    labelKey: "search.commands.importLabs",
    icon: FileDown,
  },
  {
    id: "compareLabs",
    kind: "action",
    to: "/labs/compare",
    labelKey: "search.commands.compareLabs",
    icon: GitCompareArrows,
  },
  {
    id: "newImaging",
    kind: "action",
    to: "/imaging/new",
    labelKey: "search.commands.newImaging",
    icon: ScanLine,
    gate: "/imaging",
  },
  {
    id: "emergencyCard",
    kind: "action",
    to: "/emergency",
    labelKey: "search.commands.emergencyCard",
    icon: ShieldAlert,
  },
  {
    id: "settings",
    kind: "action",
    to: "/settings",
    labelKey: "search.commands.settings",
    icon: SettingsIcon,
  },
];

/**
 * Every command the palette may show, section-filtered exactly like the sidebar:
 * a user who hid Vaccines should not be offered a jump to it.
 */
export function buildCommands(enabled: Set<SectionGroup>): Command[] {
  const navCommands: Command[] = NAV.filter(
    (item): item is Extract<typeof item, { kind: "link" }> => item.kind === "link",
  ).map((item) => ({
    id: `nav:${item.to}`,
    kind: "nav" as const,
    to: item.to,
    labelKey: item.labelKey,
    icon: item.icon,
  }));

  return [...navCommands, ...QUICK_ACTIONS].filter((c) => isRouteEnabled(c.gate ?? c.to, enabled));
}

/**
 * Substring match on the already-translated label, accent- and case-folded so
 * "labs" finds "Lab results" and "прививк" finds "Прививки". Deliberately not
 * fuzzy: a command list is short enough that a loose match is more surprising
 * than helpful.
 */
export function commandMatches(label: string, query: string): boolean {
  const q = normalizeLabel(query);
  if (!q) return true;
  return normalizeLabel(label).includes(q);
}
