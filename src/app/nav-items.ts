import type { ElementType } from "react";
import {
  Activity,
  CalendarRange,
  FileText,
  FlaskConical,
  HeartPulse,
  LayoutDashboard,
  NotebookPen,
  NotebookText,
  Pill,
  ScanLine,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  Syringe,
  TestTubes,
} from "lucide-react";

/**
 * The sidebar's section list — the single source of truth for "where can I go".
 *
 * It lives outside `Shell.tsx` because the command palette navigates to exactly
 * the same set of places and must not drift from it: one list, rendered as a
 * sidebar by the shell and as jump commands by ⌘K, both gated by the same
 * `isRouteEnabled` section filter.
 */
export type NavItem =
  | { kind: "link"; to: string; labelKey: string; icon: ElementType; end?: boolean }
  | { kind: "label"; labelKey: string };

export const NAV: NavItem[] = [
  { kind: "link", to: "/", labelKey: "nav.dashboard", icon: LayoutDashboard, end: true },
  { kind: "link", to: "/timeline", labelKey: "nav.timeline", icon: CalendarRange },
  { kind: "link", to: "/assistant", labelKey: "nav.assistant", icon: Sparkles },
  { kind: "label", labelKey: "nav.records" },
  { kind: "link", to: "/diagnoses", labelKey: "nav.diagnoses", icon: FlaskConical },
  { kind: "link", to: "/allergies", labelKey: "nav.allergies", icon: ShieldAlert },
  { kind: "link", to: "/vaccines", labelKey: "nav.vaccines", icon: Syringe },
  { kind: "link", to: "/imaging", labelKey: "nav.imaging", icon: ScanLine },
  { kind: "link", to: "/notes", labelKey: "nav.notes", icon: NotebookText },
  { kind: "label", labelKey: "nav.labsVitals" },
  { kind: "link", to: "/labs", labelKey: "nav.labResults", icon: TestTubes },
  { kind: "link", to: "/biomarkers", labelKey: "nav.biomarkers", icon: Activity },
  { kind: "link", to: "/journal", labelKey: "nav.journal", icon: NotebookPen },
  { kind: "link", to: "/lifestyle", labelKey: "nav.lifestyle", icon: HeartPulse },
  { kind: "label", labelKey: "nav.care" },
  { kind: "link", to: "/medications", labelKey: "nav.medications", icon: Pill },
  { kind: "link", to: "/visits", labelKey: "nav.visits", icon: Stethoscope },
  { kind: "link", to: "/report", labelKey: "nav.report", icon: FileText },
];
