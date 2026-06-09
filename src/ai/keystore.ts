import { invoke } from "@tauri-apps/api/core";

/**
 * API keys live in the OS keychain via the Rust `keyring` crate —
 * never in SQLite, never in a plain config file (§5, §8).
 */

export async function setApiKey(providerId: string, key: string): Promise<void> {
  await invoke("keychain_set", { provider: providerId, key });
}

export async function getApiKey(providerId: string): Promise<string | null> {
  return invoke<string | null>("keychain_get", { provider: providerId });
}

export async function deleteApiKey(providerId: string): Promise<void> {
  await invoke("keychain_delete", { provider: providerId });
}
