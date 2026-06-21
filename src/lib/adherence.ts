/**
 * Pure medication-adherence math over a `medication_log` history.
 *
 * Kept free of any DB/Tauri import so it is unit-testable directly. Works on the
 * calendar-day level (one intake per day): a day counts as adhered when it has at
 * least one `taken: true` entry. `takenAt` may be a full ISO timestamp or a bare
 * `YYYY-MM-DD` — only its date portion is used.
 */

export type AdherenceEntry = { takenAt: string; taken: boolean };

export type AdherenceStats = {
  /** Size of the trailing window the percentage is computed over. */
  windowDays: number;
  /** Distinct adhered days within the window. */
  takenDays: number;
  /** takenDays / windowDays, 0–100, rounded. */
  adherencePct: number;
  /**
   * Consecutive adhered days ending today — or ending yesterday when today is
   * not yet logged, so an un-taken-today med doesn't read as a broken streak.
   */
  streak: number;
};

const dayOf = (e: AdherenceEntry): string => e.takenAt.slice(0, 10);

/** Add `delta` days to a `YYYY-MM-DD` string, returning `YYYY-MM-DD` (UTC). */
function shiftDay(isoDay: string, delta: number): string {
  const d = new Date(`${isoDay}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function adherenceStats(
  entries: AdherenceEntry[],
  windowDays = 30,
  today: Date = new Date(),
): AdherenceStats {
  const todayDay = today.toISOString().slice(0, 10);
  const adheredDays = new Set(entries.filter((e) => e.taken).map(dayOf));

  let takenDays = 0;
  for (let i = 0; i < windowDays; i++) {
    if (adheredDays.has(shiftDay(todayDay, -i))) takenDays++;
  }
  const adherencePct = windowDays > 0 ? Math.round((takenDays / windowDays) * 100) : 0;

  // Start at today, or grant a one-day grace from yesterday when today is blank.
  const start = adheredDays.has(todayDay) ? 0 : 1;
  let streak = 0;
  for (let i = start; adheredDays.has(shiftDay(todayDay, -i)); i++) streak++;

  return { windowDays, takenDays, adherencePct, streak };
}

/** True when an adhered (`taken: true`) entry already exists for `day` (YYYY-MM-DD). */
export function hasIntakeOn(entries: AdherenceEntry[], day: string): boolean {
  return entries.some((e) => e.taken && dayOf(e) === day);
}
