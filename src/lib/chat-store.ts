import type { ChatMessage } from "@/ai/types";

/**
 * Local persistence for the AI-assistant conversation, keyed per profile, so
 * navigating away and back doesn't lose the thread. Best-effort: a corrupt or
 * unavailable store degrades to an empty history rather than throwing.
 */
const KEY_PREFIX = "soma.chat.";

/** Cap on stored/sent turns — bounds localStorage size and keeps the request
 *  from eventually overflowing the model's context window. Oldest drop first. */
export const MAX_CHAT_MESSAGES = 40;

function key(profileId: number): string {
  return `${KEY_PREFIX}${profileId}`;
}

export function loadChat(profileId: number): ChatMessage[] {
  try {
    const raw = localStorage.getItem(key(profileId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (m): m is ChatMessage =>
          m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
      )
      .slice(-MAX_CHAT_MESSAGES);
  } catch (e) {
    console.error("loadChat failed", e);
    return [];
  }
}

export function saveChat(profileId: number, messages: ChatMessage[]): void {
  try {
    localStorage.setItem(key(profileId), JSON.stringify(messages.slice(-MAX_CHAT_MESSAGES)));
  } catch (e) {
    console.error("saveChat failed", e);
  }
}

export function clearChat(profileId: number): void {
  try {
    localStorage.removeItem(key(profileId));
  } catch (e) {
    console.error("clearChat failed", e);
  }
}
