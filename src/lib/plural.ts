import type { Lang } from "./i18n";

/**
 * The three plural buckets the dictionaries carry. Russian genuinely needs all
 * three (1 запись / 2 записи / 5 записей); English collapses `few` into `many`
 * and simply repeats the same string, so callers can stay language-agnostic.
 */
export type PluralForm = "one" | "few" | "many";

/**
 * Picks the plural bucket for `n`. Russian follows the standard CLDR rules,
 * which key off the last digit and the 11–14 exception. Negative and
 * fractional counts are not expected here (they are row counts), so `n` is
 * normalised to a non-negative integer before the rules run.
 */
export function pluralForm(lang: Lang, n: number): PluralForm {
  const abs = Math.abs(Math.trunc(n));
  if (lang !== "ru") return abs === 1 ? "one" : "many";
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return "one";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "few";
  return "many";
}
