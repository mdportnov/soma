import { invoke } from "@tauri-apps/api/core";
import { closeDatabase, vacuumInto } from "@/db/client";
import { schemaVersion } from "@/db/migrate";

/**
 * Cloud backups, the local-first way: Soma writes encrypted snapshots into a
 * folder that the user's own cloud client (iCloud Drive, Google Drive,
 * Dropbox, OneDrive) already syncs. No cloud APIs, no accounts, no servers.
 * Encryption, folder detection and the actual file I/O live in Rust
 * (src-tauri/src/backup.rs); this module owns settings and scheduling.
 */

export type ProviderId = "icloud" | "google-drive" | "dropbox" | "onedrive";

export type DetectedProvider = {
  id: ProviderId;
  label: string;
  /** Resolved sync folder; null when this provider is not present. */
  path: string | null;
};

export type Detection = { platform: string; providers: DetectedProvider[] };

export type BackupFrequency = "weekly" | "monthly" | "quarterly";

export const FREQUENCY_DAYS: Record<BackupFrequency, number> = {
  weekly: 7,
  monthly: 30,
  quarterly: 90,
};

export const FREQUENCY_LABELS: Record<BackupFrequency, string> = {
  weekly: "Every week",
  monthly: "Every month",
  quarterly: "Every 3 months",
};

export type BackupSettings = {
  enabled: boolean;
  /** Chosen destination root (the `Soma Backups` subfolder is created inside). */
  destDir: string;
  /** Which detected provider the folder belongs to, or "custom". */
  provider: ProviderId | "custom";
  frequency: BackupFrequency;
  lastBackupAt: string | null;
  lastResult: { ok: boolean; message: string; at: string } | null;
};

const SETTINGS_KEY = "soma.backup.settings";

const DEFAULTS: BackupSettings = {
  enabled: false,
  destDir: "",
  provider: "custom",
  frequency: "weekly",
  lastBackupAt: null,
  lastResult: null,
};

export function loadBackupSettings(): BackupSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveBackupSettings(settings: BackupSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// ── Rust command wrappers ───────────────────────────────────────────────────

export function detectProviders(): Promise<Detection> {
  return invoke<Detection>("detect_backup_providers");
}

export function verifyBackupDir(path: string): Promise<{ exists: boolean; writable: boolean }> {
  return invoke("verify_backup_dir", { path });
}

export function setPassphrase(passphrase: string): Promise<void> {
  return invoke("backup_passphrase_set", { passphrase });
}

export function passphraseExists(): Promise<boolean> {
  return invoke("backup_passphrase_exists");
}

export function deletePassphrase(): Promise<void> {
  return invoke("backup_passphrase_delete");
}

export type BackupInfo = {
  fileName: string;
  path: string;
  sizeBytes: number;
  createdAt: string;
};

export type RestoreMeta = {
  schemaVersion: number;
  sizeBytes: number;
  fileModifiedAt: string | null;
};

/** Snapshot the live DB and write an encrypted backup into the configured folder. */
export async function runBackup(): Promise<BackupInfo> {
  // Serialize: a manual "Back up now" and the scheduler's catch-up run can fire
  // together and both vacuum into the same snapshot path, racing to a corrupt
  // file. Coalesce overlapping calls onto a single in-flight run.
  if (inFlightBackup) return inFlightBackup;
  inFlightBackup = (async () => {
    const settings = loadBackupSettings();
    if (!settings.enabled || !settings.destDir) {
      throw new Error("Backups are not configured");
    }
    const snapshotPath = await invoke<string>("backup_snapshot_target");
    await vacuumInto(snapshotPath);
    const info = await invoke<BackupInfo>("create_backup", {
      snapshotPath,
      destDir: settings.destDir,
      schemaVersion,
    });
    saveBackupSettings({
      ...loadBackupSettings(),
      lastBackupAt: info.createdAt,
      lastResult: { ok: true, message: `${info.fileName} written`, at: info.createdAt },
    });
    return info;
  })();
  try {
    return await inFlightBackup;
  } finally {
    inFlightBackup = null;
  }
}

let inFlightBackup: Promise<BackupInfo> | null = null;

/** Decrypt + validate a backup file into staging; nothing is replaced yet. */
export function inspectBackup(path: string, passphrase: string): Promise<RestoreMeta> {
  return invoke<RestoreMeta>("inspect_backup", { path, passphrase });
}

export function discardRestoreStaging(): Promise<void> {
  return invoke("discard_restore_staging");
}

/**
 * Point of no return: closes the DB, swaps in the staged backup and restarts
 * the app. A timestamped safety copy of the current DB is kept by the Rust side.
 */
export async function applyRestore(): Promise<never> {
  await closeDatabase();
  await invoke("restore_backup");
  // restore_backup restarts the process; this line is never reached.
  throw new Error("unreachable");
}

/** Current app schema version (compared against the backup header on restore). */
export const currentSchemaVersion = schemaVersion;

// ── scheduler ───────────────────────────────────────────────────────────────

function isDue(settings: BackupSettings, now: Date): boolean {
  if (!settings.enabled || !settings.destDir) return false;
  if (!settings.lastBackupAt) return true;
  const elapsedDays = (now.getTime() - Date.parse(settings.lastBackupAt)) / 86_400_000;
  return elapsedDays >= FREQUENCY_DAYS[settings.frequency];
}

async function runIfDue(): Promise<void> {
  const settings = loadBackupSettings();
  if (!isDue(settings, new Date())) return;
  try {
    await runBackup();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    saveBackupSettings({
      ...loadBackupSettings(),
      lastResult: { ok: false, message, at: new Date().toISOString() },
    });
    console.error("Scheduled backup failed:", message);
  }
}

let schedulerStarted = false;

/**
 * Called once after DB init: runs a catch-up backup if one is overdue and
 * re-checks every 6 hours while the app stays open.
 */
export function initBackupScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;
  void runIfDue();
  setInterval(() => void runIfDue(), 6 * 60 * 60 * 1000);
}
