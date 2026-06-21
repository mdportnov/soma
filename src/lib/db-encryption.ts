import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { closeDatabase, vacuumInto } from "@/db/client";

/**
 * Optional at-rest database encryption (frontend side).
 *
 * The Rust `vault` module keeps `soma.db` encrypted on disk whenever the app is
 * closed and decrypts it on launch. This module owns the non-secret settings,
 * the snapshot/lock/unlock orchestration, and the lock-on-exit window hook.
 * Two modes:
 *  - "keychain": a random data key in the OS keychain → auto-unlock at launch.
 *  - "passphrase": key derived from a passphrase typed each launch → nothing
 *    persisted; the passphrase is held in memory for the session so the app can
 *    re-encrypt on exit.
 */

export type EncryptionMode = "keychain" | "passphrase";

export type EncryptionSettings = {
  enabled: boolean;
  mode: EncryptionMode;
};

const SETTINGS_KEY = "soma.dbEncryption";
const DEFAULTS: EncryptionSettings = { enabled: false, mode: "keychain" };

export function loadEncryptionSettings(): EncryptionSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveEncryptionSettings(settings: EncryptionSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// ── on-disk vault state (read by the startup gate) ──────────────────────────

export type VaultState = {
  vaultExists: boolean;
  plaintextExists: boolean;
  mode: EncryptionMode | null;
  keychainKeyPresent: boolean;
};

export function vaultState(): Promise<VaultState> {
  return invoke<VaultState>("vault_state");
}

// ── session passphrase (in memory only; never persisted) ────────────────────

let sessionPassphrase: string | null = null;

export function hasSessionPassphrase(): boolean {
  return sessionPassphrase != null;
}

function snapshotTarget(): Promise<string> {
  return invoke<string>("vault_snapshot_target");
}

/** Writes a clean VACUUM snapshot to the staging path the Rust side expects. */
async function freshSnapshot(): Promise<string> {
  const path = await snapshotTarget();
  await vacuumInto(path);
  return path;
}

// ── enable / disable ─────────────────────────────────────────────────────────

/** Turns on keychain-mode encryption and writes the initial vault. */
export async function enableKeychainEncryption(): Promise<void> {
  const snapshotPath = await freshSnapshot();
  await invoke("vault_enable_keychain", { snapshotPath });
  sessionPassphrase = null;
  saveEncryptionSettings({ enabled: true, mode: "keychain" });
}

/** Turns on passphrase-mode encryption; keeps the passphrase for the session. */
export async function enablePassphraseEncryption(passphrase: string): Promise<void> {
  const snapshotPath = await freshSnapshot();
  await invoke("vault_enable_passphrase", { snapshotPath, passphrase });
  sessionPassphrase = passphrase;
  saveEncryptionSettings({ enabled: true, mode: "passphrase" });
}

/** Turns off encryption: removes the vault + keychain key. Plaintext DB stays. */
export async function disableEncryption(): Promise<void> {
  await invoke("vault_disable");
  sessionPassphrase = null;
  const prev = loadEncryptionSettings();
  saveEncryptionSettings({ enabled: false, mode: prev.mode });
}

// ── unlock (startup, before the DB is opened) ───────────────────────────────

export async function unlockKeychain(): Promise<void> {
  await invoke("vault_unlock_keychain");
}

/** Decrypts the vault into `soma.db` and arms the session passphrase. */
export async function unlockPassphrase(passphrase: string): Promise<void> {
  await invoke("vault_unlock_passphrase", { passphrase });
  sessionPassphrase = passphrase;
}

/**
 * Verifies a passphrase without overwriting `soma.db` — used on an unclean-exit
 * relaunch where a newer plaintext DB already exists, so the session can re-arm
 * to re-lock on the next clean exit without clobbering live data.
 */
export async function verifyPassphrase(passphrase: string): Promise<void> {
  await invoke("vault_verify_passphrase", { passphrase });
  sessionPassphrase = passphrase;
}

// ── lock (clean exit) ────────────────────────────────────────────────────────

/**
 * Encrypts the live DB into the vault and removes the plaintext. Vacuums a clean
 * snapshot first (connection still open), then closes the DB so the file can be
 * swapped. No-op when encryption is off.
 */
export async function lockNow(): Promise<void> {
  const settings = loadEncryptionSettings();
  if (!settings.enabled) return;
  const snapshotPath = await freshSnapshot();
  await closeDatabase();
  if (settings.mode === "passphrase") {
    if (!sessionPassphrase) {
      throw new Error("No session passphrase — cannot re-encrypt on exit");
    }
    await invoke("vault_lock_passphrase", { snapshotPath, passphrase: sessionPassphrase });
  } else {
    await invoke("vault_lock_keychain", { snapshotPath });
  }
}

// ── lock-on-exit hook ─────────────────────────────────────────────────────────

let closeHookRegistered = false;

/**
 * Intercepts the window close so an encrypted database is re-locked before the
 * process exits. Registered once for the app's lifetime; the handler reads the
 * current settings at close time, so enabling encryption mid-session still locks
 * on exit. When encryption is off the close proceeds normally. If locking fails
 * we still destroy the window (the plaintext is re-locked on the next launch),
 * so the user is never trapped.
 */
export async function initVaultCloseHook(): Promise<void> {
  if (closeHookRegistered) return;
  closeHookRegistered = true;
  const win = getCurrentWindow();
  await win.onCloseRequested(async (event) => {
    if (!loadEncryptionSettings().enabled) return; // normal close
    event.preventDefault();
    try {
      await lockNow();
    } catch (e) {
      console.error("Failed to lock the database on exit:", e);
    } finally {
      await win.destroy();
    }
  });
}
