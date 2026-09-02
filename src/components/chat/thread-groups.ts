import type { ChatThreadSummary } from "@/db/chat-repos";

/**
 * Pure helpers for the thread list: which date bucket a thread falls into and
 * how its "last activity" reads. Kept out of the component so the bucketing
 * rules (and their midnight edges) are unit-testable.
 */

export type ThreadGroupKey = "today" | "yesterday" | "lastWeek" | "earlier";

export const GROUP_ORDER: ThreadGroupKey[] = ["today", "yesterday", "lastWeek", "earlier"];

/** Calendar days between two ISO instants/dates, in the local calendar. */
function calendarDaysAgo(iso: string, now: Date): number {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return Number.POSITIVE_INFINITY;
  const a = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function threadGroupKey(updatedAt: string, now = new Date()): ThreadGroupKey {
  const days = calendarDaysAgo(updatedAt, now);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days <= 7) return "lastWeek";
  return "earlier";
}

/** Threads bucketed in display order; empty buckets are omitted. */
export function groupThreads(
  threads: ChatThreadSummary[],
  now = new Date(),
): { key: ThreadGroupKey; threads: ChatThreadSummary[] }[] {
  const buckets = new Map<ThreadGroupKey, ChatThreadSummary[]>();
  for (const thread of threads) {
    const key = threadGroupKey(thread.updatedAt, now);
    buckets.set(key, [...(buckets.get(key) ?? []), thread]);
  }
  return GROUP_ORDER.filter((key) => buckets.has(key)).map((key) => ({
    key,
    threads: buckets.get(key)!,
  }));
}

/**
 * "5 min ago" / "yesterday" / "12 Aug": relative within a week, a plain date
 * beyond it — a thread list is scanned for recency, not read for timestamps.
 */
export function relativeActivity(
  iso: string,
  locale: string,
  now = new Date(),
  formatDate: (iso: string) => string = (value) => value.slice(0, 10),
): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const diffMinutes = Math.round((now.getTime() - then.getTime()) / 60_000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (Math.abs(diffMinutes) < 1) return rtf.format(0, "second");
  if (Math.abs(diffMinutes) < 60) return rtf.format(-diffMinutes, "minute");
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24 && calendarDaysAgo(iso, now) === 0) {
    return rtf.format(-diffHours, "hour");
  }
  const days = calendarDaysAgo(iso, now);
  if (days <= 7) return rtf.format(-days, "day");
  return formatDate(iso);
}
