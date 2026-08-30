import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Locale for date/number formatting, derived from the active UI language (which
 * the i18n provider mirrors onto `<html lang>`). Kept here — not tied to React —
 * so plain formatting helpers localize without threading context everywhere.
 */
export function uiLocale(): string {
  const lang = typeof document !== "undefined" ? document.documentElement.lang : "";
  return lang === "ru" ? "ru-RU" : "en-GB";
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(uiLocale(), {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Clock time for an ISO instant (chat messages, log lines). Same-day items only
 * need the time; the date belongs to whatever groups them.
 */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(uiLocale(), { hour: "2-digit", minute: "2-digit" });
}

export function formatValue(v: number | null | undefined, digits = 2): string {
  if (v == null) return "—";
  return Number.isInteger(v) ? String(v) : v.toFixed(digits).replace(/\.?0+$/, "");
}
