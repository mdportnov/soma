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

/** Whether the OS keychain can actually store secrets right now (live probe). */
export type KeychainStatus = {
  available: boolean;
  /** Backend name for the UI: "macOS Keychain" / "Windows Credential Manager" / "Secret Service". */
  backend: string;
  error: string | null;
};

/**
 * Live, never-cached check that the OS keychain is reachable. On Linux this is
 * the freedesktop Secret Service, which needs a running keyring daemon
 * (gnome-keyring / KWallet); when absent, storing API keys / the backup
 * passphrase fails. Re-call this to re-probe after the user installs one.
 */
export function getKeychainStatus(): Promise<KeychainStatus> {
  return invoke<KeychainStatus>("keychain_status");
}
