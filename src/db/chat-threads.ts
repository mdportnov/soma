/**
 * Pure helpers behind the multi-thread chat: titling, previews and record
 * references. No DB, no clock — `chat-repos.ts` feeds them rows and the UI
 * feeds them text, so every rule here is unit-testable in isolation.
 */

/** Longest auto-derived title, in characters, before a word-boundary cut. */
export const THREAD_TITLE_MAX = 48;

/** Longest transcript preview shown in the thread list. */
export const THREAD_PREVIEW_MAX = 96;

/** Collapses whitespace (newlines from a multi-line question included). */
function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Cuts `text` to at most `max` characters, preferring a word boundary so the
 * result never ends mid-word, and marks the cut with an ellipsis. A single
 * word longer than `max` is hard-cut — there is no boundary to prefer.
 */
export function truncateAtWord(text: string, max: number): string {
  const clean = collapse(text);
  if (clean.length <= max) return clean;
  const head = clean.slice(0, max);
  const boundary = head.lastIndexOf(" ");
  const cut = boundary >= Math.floor(max / 2) ? head.slice(0, boundary) : head;
  return `${cut.replace(/[\s,;:.!?…-]+$/u, "")}…`;
}

/**
 * Title derived from the first user message of a thread. Leading chat filler
 * ("hi", "please", "привет") is dropped so the list reads like a table of
 * contents rather than a list of greetings; a trailing question mark is kept
 * because "What changed since June?" is a better title than "What changed
 * since June". Returns null when nothing title-worthy remains (an empty or
 * emoji-only message), so the caller can fall back to a localized default.
 */
export function deriveThreadTitle(firstUserMessage: string): string | null {
  let text = collapse(firstUserMessage);
  // Strip a short greeting/politeness prefix only when something follows it.
  const filler =
    /^(?:(?:hi|hello|hey|please|pls|привет|здравствуйте|здравствуй|пожалуйста|скажи|подскажи)[,!.\s]+)+/iu;
  const stripped = text.replace(filler, "");
  if (stripped.length >= 3) text = stripped;
  text = text.replace(/^[\s"'«»“”([\-–—]+/u, "").replace(/["'«»“”]+$/u, "");
  if (!/[\p{L}\p{N}]/u.test(text)) return null;
  const title = truncateAtWord(text, THREAD_TITLE_MAX);
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/** Single-line transcript preview for the thread list. */
export function messagePreview(content: string): string {
  return truncateAtWord(content, THREAD_PREVIEW_MAX);
}

export type RecordRef = { entityType: string; entityId: number };

/**
 * Extracts the `[record:entity:id]` evidence tokens from an assistant answer,
 * de-duplicated in order of first appearance. The engine already removed
 * tokens the model did not earn through a tool result, so whatever survives
 * here is a record the answer genuinely relied on.
 */
export function parseRecordRefs(content: string): RecordRef[] {
  const seen = new Set<string>();
  const refs: RecordRef[] = [];
  for (const match of content.matchAll(/\[record:([a-z_]+):(\d+)\]/g)) {
    const entityType = match[1];
    const entityId = Number(match[2]);
    const key = `${entityType}:${entityId}`;
    if (!Number.isSafeInteger(entityId) || entityId < 1 || seen.has(key)) continue;
    seen.add(key);
    refs.push({ entityType, entityId });
  }
  return refs;
}

/**
 * Escapes the LIKE wildcards in a user search string so "50%" matches the
 * literal characters. The caller wraps the result in `%…%` and passes
 * `ESCAPE '\'`.
 */
export function escapeLike(query: string): string {
  return query.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
