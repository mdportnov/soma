/**
 * Dismissible UI hints — first-run coachmarks and onboarding nudges the user can
 * close for good. Mirrors the notifications dismiss store (see notifications.ts)
 * but lives in its own namespace, so clearing one never touches the other.
 *
 * State is in localStorage, not the DB: it's per-device UI chrome, intentionally
 * outside encrypted backups. A restored profile re-shows first-run hints, which
 * is the right behavior on a fresh device.
 */

const DISMISSED_KEY = "soma.hints.dismissed";

export function loadDismissedHints(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function persist(ids: Set<string>): void {
  try {
    // Bound growth — hint ids are few and stable, but never let it grow forever.
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids].slice(-200)));
  } catch {
    /* storage unavailable — hints simply won't persist this session */
  }
}

export function dismissHint(id: string): void {
  const ids = loadDismissedHints();
  ids.add(id);
  persist(ids);
}

export function restoreHint(id: string): void {
  const ids = loadDismissedHints();
  ids.delete(id);
  persist(ids);
}

export function isHintDismissed(id: string): boolean {
  return loadDismissedHints().has(id);
}

/** Forget every dismissed hint so first-run coachmarks reappear. */
export function clearDismissedHints(): void {
  persist(new Set());
}
