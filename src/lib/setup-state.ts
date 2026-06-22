/**
 * Setup state — one source of truth for "is feature X configured yet", so every
 * nudge that asks the user to finish setup (the sidebar AI marker, the dashboard
 * getting-started checklist, the assistant stub) agrees and goes quiet together
 * the moment the feature is ready. Today it tracks AI configuration; it's shaped
 * to grow (encryption, backup, MCP) without scattering more ad-hoc checks.
 */

import { getConfiguredProvider } from "@/ai";

export type SetupStatus = {
  /** A usable AI provider + model + key are all present. */
  aiConfigured: boolean;
};

/** Fires after setup-relevant settings change so live nudges refresh at once. */
export const SETUP_STATE_EVENT = "soma:setup-state";

export async function getSetupStatus(): Promise<SetupStatus> {
  return { aiConfigured: !!(await getConfiguredProvider()) };
}

export async function isAiConfigured(): Promise<boolean> {
  return !!(await getConfiguredProvider());
}

/** Announce that setup state may have changed (e.g. an API key was saved). */
export function notifySetupChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SETUP_STATE_EVENT));
}
