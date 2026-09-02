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

/**
 * Russian date formats carry an era marker — `ru-RU` renders a year as
 * "2 сент. 2026 г." The app never shows anything but the common era, so the
 * suffix is pure noise. Only the trailing " г."/" г" is dropped; the month
 * abbreviation ("сент.") keeps its own period. A no-op for every other locale.
 */
export function stripEraSuffix(formatted: string): string {
  return formatted.replace(/[\s\u00a0\u202f]+г\.?$/u, "");
}

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
};

/**
 * Same as {@link formatDate} but for callers that carry their own locale —
 * PDF and HTML exports render under the locale the export was requested in,
 * not under whatever `<html lang>` happens to say.
 */
export function formatDateIn(
  iso: string | null | undefined,
  locale: string,
  options: Intl.DateTimeFormatOptions = DATE_FORMAT,
): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return formatDateObject(d, locale, options);
}

/**
 * Locale-formatted label for an already-parsed `Date` — chart axis ticks build
 * their own cursors and never go through an ISO string.
 */
export function formatDateObject(
  date: Date,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return stripEraSuffix(date.toLocaleDateString(locale, options));
}

export function formatDate(iso: string | null | undefined): string {
  return formatDateIn(iso, uiLocale());
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
