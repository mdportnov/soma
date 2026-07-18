import type { NotificationFeedData } from "@/db/repos";

/**
 * Notifications feed — derived, never stored, never an OS notification.
 *
 * Folds already-fetched data (`getNotificationFeedData`) into a prioritized list
 * of in-app feed items: medication-intake nudges (standing meds not yet logged
 * today) and re-test reminders (due / overdue from a `retest_schedule` cadence).
 *
 * Pure and deterministic over its inputs — no DB, no `Date.now()` (the caller
 * passes `today`) — so the whole feed is unit-testable. Dismiss state lives in
 * localStorage and is applied by the UI, keeping `buildNotificationFeed` pure.
 */

export type NotificationSeverity = "info" | "watch" | "alert";

export type NotificationItem =
  | {
      id: string;
      kind: "medication";
      severity: NotificationSeverity;
      route: string;
      medId: number;
      medName: string;
      /** Scheduled times of day, when the medication carries them. */
      times: string[];
    }
  | {
      id: string;
      kind: "retest";
      severity: NotificationSeverity;
      route: string;
      scheduleId: number;
      label: string;
      biomarkerId: number | null;
      /** ISO due date (anchor + interval); equals `today` when no anchor is set. */
      dueDate: string;
      /** Positive = overdue by N days, 0 = due today, negative = due in N days. */
      overdueDays: number;
      /** True when the schedule has no `lastTestedDate` anchor yet. */
      noAnchor: boolean;
    };

const SEVERITY_RANK: Record<NotificationSeverity, number> = { info: 0, watch: 1, alert: 2 };
const KIND_RANK = { retest: 0, medication: 1 } as const;

/** A re-test entering the feed when it is due within this many days. */
const RETEST_DUE_SOON_DAYS = 14;
/** Overdue beyond this many days escalates a re-test to the loudest severity. */
const RETEST_ALERT_OVERDUE_DAYS = 60;

function daysBetween(fromISO: string, toISO: string): number {
  const to = Date.parse(`${toISO.slice(0, 10)}T00:00:00Z`);
  const from = Date.parse(`${fromISO.slice(0, 10)}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

/** Next-due date for a re-test = anchor + interval months (calendar-correct). */
export function retestDueDate(lastTestedDate: string, intervalMonths: number): string {
  const [year, month, day] = lastTestedDate.slice(0, 10).split("-").map(Number);
  const monthIndex = year * 12 + month - 1 + intervalMonths;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = ((monthIndex % 12) + 12) % 12;
  const targetDay = Math.min(day, new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate());
  return new Date(Date.UTC(targetYear, targetMonth, targetDay)).toISOString().slice(0, 10);
}

export function buildNotificationFeed(data: NotificationFeedData): NotificationItem[] {
  const { today } = data;
  const items: NotificationItem[] = [];

  // ── Medication intake nudges ───────────────────────────────────────────────
  // One info-level item per standing medication not yet logged today. The date
  // in the id rolls the nudge over (and any dismissal) at midnight.
  const loggedToday = new Set(data.loggedTodayMedIds);
  for (const m of data.medications) {
    if (loggedToday.has(m.id)) continue;
    items.push({
      id: `med:${m.id}:${today}`,
      kind: "medication",
      severity: "info",
      route: "/medications",
      medId: m.id,
      medName: m.name,
      times: m.schedule?.times ?? [],
    });
  }

  // ── Re-test reminders ──────────────────────────────────────────────────────
  for (const s of data.retestSchedules) {
    const noAnchor = !s.lastTestedDate;
    const dueDate = s.lastTestedDate ? retestDueDate(s.lastTestedDate, s.intervalMonths) : today; // no baseline yet → surface immediately to record one
    const overdueDays = daysBetween(dueDate, today); // >0 overdue, <0 upcoming
    // Skip schedules that aren't due yet and aren't within the "soon" window.
    if (!noAnchor && overdueDays < -RETEST_DUE_SOON_DAYS) continue;
    const severity: NotificationSeverity =
      overdueDays > RETEST_ALERT_OVERDUE_DAYS ? "alert" : overdueDays >= 0 ? "watch" : "info";
    items.push({
      id: `retest:${s.id}:${dueDate}`,
      kind: "retest",
      severity,
      route: s.biomarkerId != null ? `/biomarkers/${s.biomarkerId}` : "/labs",
      scheduleId: s.id,
      label: s.label,
      biomarkerId: s.biomarkerId,
      dueDate,
      overdueDays,
      noAnchor,
    });
  }

  return items.sort((a, b) => {
    const bySeverity = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (bySeverity !== 0) return bySeverity;
    const byKind = KIND_RANK[a.kind] - KIND_RANK[b.kind];
    if (byKind !== 0) return byKind;
    return (a.kind === "retest" ? a.label : a.medName).localeCompare(
      b.kind === "retest" ? b.label : b.medName,
    );
  });
}

// ── dismiss state (localStorage; applied by the UI, keeps build pure) ────────

const DISMISSED_KEY = "soma.notifications.dismissed";

export function loadDismissedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function persistDismissed(ids: Set<string>): void {
  // Bound growth: only ids still capable of recurring matter; cap to a sane size.
  const list = [...ids].slice(-500);
  localStorage.setItem(DISMISSED_KEY, JSON.stringify(list));
}

export function dismissNotification(id: string): void {
  const ids = loadDismissedIds();
  ids.add(id);
  persistDismissed(ids);
}

export function restoreNotification(id: string): void {
  const ids = loadDismissedIds();
  ids.delete(id);
  persistDismissed(ids);
}

/** Forget every dismissal so all current feed items resurface. */
export function clearDismissedNotifications(): void {
  persistDismissed(new Set());
}

/** Feed minus dismissed items — the list the bell badge and feed page render. */
export function visibleNotifications(
  items: NotificationItem[],
  dismissed: Set<string>,
): NotificationItem[] {
  return items.filter((i) => !dismissed.has(i.id));
}

// ── per-category preferences (localStorage; applied by the UI) ───────────────

/**
 * Fine-grained mutes for the feed. A user who only cares about overdue re-tests
 * can silence medication nudges and "due soon" reminders without losing the
 * loud overdue ones. Per-device UI preference, deliberately outside backups.
 *
 * Every flag defaults to ON, and unknown/absent storage means "all on", so a new
 * install (or a category added in a future version) surfaces by default.
 */
export type NotificationPrefs = {
  /** Daily intake nudges for standing medications not yet logged. */
  medication: boolean;
  /** Re-test reminders from a `retest_schedule` cadence. */
  retest: boolean;
  /** Include re-tests that are merely due soon (not yet due / overdue). */
  retestUpcoming: boolean;
};

const DEFAULT_PREFS: NotificationPrefs = {
  medication: true,
  retest: true,
  retestUpcoming: true,
};

const PREFS_KEY = "soma.notifications.prefs";

/** Fires after prefs change so the bell badge can re-read without navigation. */
export const NOTIFICATION_PREFS_EVENT = "soma:notification-prefs";

export function loadNotificationPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<NotificationPrefs>) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveNotificationPrefs(prefs: NotificationPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    if (typeof window !== "undefined") window.dispatchEvent(new Event(NOTIFICATION_PREFS_EVENT));
  } catch {
    /* storage unavailable — selection just won't persist this session */
  }
}

/** Drop feed items the user muted via {@link NotificationPrefs}. */
export function filterByPrefs(
  items: NotificationItem[],
  prefs: NotificationPrefs,
): NotificationItem[] {
  return items.filter((i) => {
    if (i.kind === "medication") return prefs.medication;
    if (i.kind === "retest") {
      if (!prefs.retest) return false;
      // "Upcoming" = anchored but not yet due. Overdue/due-today always pass.
      if (!prefs.retestUpcoming && !i.noAnchor && i.overdueDays < 0) return false;
    }
    return true;
  });
}
