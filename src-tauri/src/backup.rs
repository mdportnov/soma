//! Encrypted backups into a cloud-synced folder.
//!
//! Soma never talks to any cloud API. A backup is an encrypted snapshot of the
//! SQLite database written into a folder that the user's own cloud client
//! (iCloud Drive, Google Drive, Dropbox, OneDrive) already keeps in sync.
//! The live database never leaves the device; only `.somabk` snapshots do.
//!
//! File format (`.somabk`):
//! `MAGIC(8) | format_version(1) | schema_version(4, LE) | salt(16) | nonce(12) | AES-256-GCM ciphertext`
//! The key is derived from the user passphrase with Argon2id. Without the
//! passphrase a backup cannot be decrypted — by anyone, including us.

use std::fs;
use std::path::{Path, PathBuf};

use aes_gcm::aead::rand_core::RngCore;
use aes_gcm::aead::{Aead, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Nonce};
use argon2::Argon2;
use chrono::Local;
use keyring::Entry;
use serde::Serialize;
use tauri::Manager;

const KEYCHAIN_SERVICE: &str = "com.soma.health";
const PASSPHRASE_USER: &str = "backup-passphrase";

const MAGIC: &[u8; 8] = b"SOMABK1\0";
const FORMAT_VERSION: u8 = 1;
const HEADER_LEN: usize = 8 + 1 + 4 + 16 + 12;
const SQLITE_MAGIC: &[u8; 16] = b"SQLite format 3\0";

const SUBDIR: &str = "Soma Backups";
const PREFIX: &str = "soma-backup-";
const EXT: &str = "somabk";
const KEEP: usize = 12;

const SNAPSHOT_STAGING: &str = "backup-snapshot-staging.db";
const RESTORE_STAGING: &str = "restore-staging.db";
const DB_FILE: &str = "soma.db";

fn pass_entry() -> Result<Entry, String> {
    Entry::new(KEYCHAIN_SERVICE, PASSPHRASE_USER).map_err(|e| e.to_string())
}

fn derive_key(passphrase: &str, salt: &[u8]) -> Result<[u8; 32], String> {
    let mut key = [0u8; 32];
    Argon2::default()
        .hash_password_into(passphrase.as_bytes(), salt, &mut key)
        .map_err(|e| e.to_string())?;
    Ok(key)
}

/// Packs a plaintext SQLite snapshot into the encrypted `.somabk` byte layout
/// (`MAGIC | format | schema_version | salt | nonce | AES-256-GCM ciphertext`).
/// Pure over its inputs apart from the per-call random salt/nonce, so the format
/// is exercised by `cargo test` without touching the filesystem or keychain.
fn encrypt_snapshot(
    plain: &[u8],
    passphrase: &str,
    schema_version: u32,
) -> Result<Vec<u8>, String> {
    if plain.len() < SQLITE_MAGIC.len() || &plain[..SQLITE_MAGIC.len()] != SQLITE_MAGIC {
        return Err("Snapshot is not a valid SQLite database".into());
    }

    let mut salt = [0u8; 16];
    let mut nonce = [0u8; 12];
    OsRng.fill_bytes(&mut salt);
    OsRng.fill_bytes(&mut nonce);
    let key = derive_key(passphrase, &salt)?;
    let cipher = Aes256Gcm::new((&key).into());
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce), plain)
        .map_err(|e| format!("encrypt: {e}"))?;

    let mut out = Vec::with_capacity(HEADER_LEN + ciphertext.len());
    out.extend_from_slice(MAGIC);
    out.push(FORMAT_VERSION);
    out.extend_from_slice(&schema_version.to_le_bytes());
    out.extend_from_slice(&salt);
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

/// Reverses [`encrypt_snapshot`]: validates the header, decrypts, and asserts the
/// plaintext is a SQLite database, returning `(schema_version, plaintext)`. A
/// wrong passphrase or any tampering fails the AES-GCM authentication tag.
fn decrypt_snapshot(raw: &[u8], passphrase: &str) -> Result<(u32, Vec<u8>), String> {
    if raw.len() <= HEADER_LEN || &raw[..8] != MAGIC {
        return Err("Not a Soma backup file".into());
    }
    if raw[8] != FORMAT_VERSION {
        return Err("This backup was created by a newer version of Soma".into());
    }
    let schema_version = u32::from_le_bytes(raw[9..13].try_into().unwrap());
    let salt = &raw[13..29];
    let nonce = &raw[29..41];

    let key = derive_key(passphrase, salt)?;
    let cipher = Aes256Gcm::new((&key).into());
    let plain = cipher
        .decrypt(Nonce::from_slice(nonce), &raw[HEADER_LEN..])
        .map_err(|_| "Wrong passphrase, or the file is corrupted".to_string())?;
    if plain.len() < SQLITE_MAGIC.len() || &plain[..SQLITE_MAGIC.len()] != SQLITE_MAGIC {
        return Err("Decrypted data is not a SQLite database".into());
    }
    Ok((schema_version, plain))
}

fn config_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_config_dir().map_err(|e| e.to_string())
}

// ── provider detection ──────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Provider {
    id: &'static str,
    label: &'static str,
    /// Resolved sync folder, or `None` when the provider was not found.
    path: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Detection {
    platform: &'static str,
    providers: Vec<Provider>,
}

fn existing(path: PathBuf) -> Option<String> {
    path.is_dir().then(|| path.to_string_lossy().into_owned())
}

/// Dropbox writes its actual sync folder into `info.json`; this is the most
/// reliable detection on every platform (the folder is user-relocatable).
fn dropbox_from_info_json(info: &Path) -> Option<String> {
    let raw = fs::read_to_string(info).ok()?;
    let json: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let obj = json.as_object()?;
    for account in ["personal", "business"] {
        if let Some(path) = obj
            .get(account)
            .and_then(|a| a.get("path"))
            .and_then(|p| p.as_str())
        {
            if Path::new(path).is_dir() {
                return Some(path.to_string());
            }
        }
    }
    None
}

/// Scans `~/Library/CloudStorage` (macOS) for an entry with the given prefix.
#[cfg(target_os = "macos")]
fn cloud_storage_entry(home: &Path, prefix: &str) -> Option<PathBuf> {
    let dir = home.join("Library/CloudStorage");
    let entries = fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let name = entry.file_name();
        if name.to_string_lossy().starts_with(prefix) && entry.path().is_dir() {
            return Some(entry.path());
        }
    }
    None
}

#[tauri::command]
pub fn detect_backup_providers(app: tauri::AppHandle) -> Result<Detection, String> {
    let home = app.path().home_dir().map_err(|e| e.to_string())?;

    let icloud: Option<String>;
    let google: Option<String>;
    let dropbox: Option<String>;
    let onedrive: Option<String>;

    #[cfg(target_os = "macos")]
    {
        icloud = existing(home.join("Library/Mobile Documents/com~apple~CloudDocs"));
        // New Drive client mounts under CloudStorage; back up into "My Drive"
        // (the only part the client actually syncs). Legacy client used ~/Google Drive.
        google = cloud_storage_entry(&home, "GoogleDrive-")
            .map(|p| {
                let my_drive = p.join("My Drive");
                if my_drive.is_dir() {
                    my_drive
                } else {
                    p
                }
            })
            .and_then(existing)
            .or_else(|| existing(home.join("Google Drive")));
        dropbox = dropbox_from_info_json(&home.join(".dropbox/info.json"))
            .or_else(|| cloud_storage_entry(&home, "Dropbox").and_then(existing))
            .or_else(|| existing(home.join("Dropbox")));
        onedrive = cloud_storage_entry(&home, "OneDrive")
            .and_then(existing)
            .or_else(|| existing(home.join("OneDrive")));
    }

    #[cfg(target_os = "windows")]
    {
        icloud = None; // iCloud Drive backup target is macOS-only.
        google = None; // The Windows Drive client mounts a virtual drive letter; no stable folder.
        dropbox = std::env::var("APPDATA")
            .ok()
            .and_then(|a| dropbox_from_info_json(&Path::new(&a).join("Dropbox/info.json")))
            .or_else(|| existing(home.join("Dropbox")));
        onedrive = std::env::var("OneDrive")
            .ok()
            .map(PathBuf::from)
            .and_then(existing)
            .or_else(|| existing(home.join("OneDrive")));
    }

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        icloud = None;
        google = None;
        dropbox = dropbox_from_info_json(&home.join(".dropbox/info.json"))
            .or_else(|| existing(home.join("Dropbox")));
        onedrive = None;
    }

    Ok(Detection {
        platform: std::env::consts::OS,
        providers: vec![
            Provider {
                id: "icloud",
                label: "iCloud Drive",
                path: icloud,
            },
            Provider {
                id: "google-drive",
                label: "Google Drive",
                path: google,
            },
            Provider {
                id: "dropbox",
                label: "Dropbox",
                path: dropbox,
            },
            Provider {
                id: "onedrive",
                label: "OneDrive",
                path: onedrive,
            },
        ],
    })
}

// ── destination verification ────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirCheck {
    exists: bool,
    writable: bool,
}

/// Verifies a (possibly hand-entered) destination: it must exist and be
/// writable. We probe with a real write because cloud folders are a common
/// place for permission surprises.
#[tauri::command]
pub fn verify_backup_dir(path: String) -> Result<DirCheck, String> {
    let dir = Path::new(&path);
    if !dir.is_dir() {
        return Ok(DirCheck {
            exists: false,
            writable: false,
        });
    }
    let probe = dir.join(".soma-write-probe");
    let writable = fs::write(&probe, b"probe").is_ok();
    let _ = fs::remove_file(&probe);
    Ok(DirCheck {
        exists: true,
        writable,
    })
}

// ── passphrase (OS keychain, same store as AI keys) ─────────────────────────

#[tauri::command]
pub fn backup_passphrase_set(passphrase: String) -> Result<(), String> {
    if passphrase.len() < 8 {
        return Err("Passphrase must be at least 8 characters".into());
    }
    pass_entry()?
        .set_password(&passphrase)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn backup_passphrase_exists() -> Result<bool, String> {
    match pass_entry()?.get_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn backup_passphrase_delete() -> Result<(), String> {
    match pass_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

// ── backup ──────────────────────────────────────────────────────────────────

/// Returns the path the frontend should `VACUUM INTO`, clearing any stale
/// snapshot from an interrupted previous run.
#[tauri::command]
pub fn backup_snapshot_target(app: tauri::AppHandle) -> Result<String, String> {
    let path = config_dir(&app)?.join(SNAPSHOT_STAGING);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(path.to_string_lossy().into_owned())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    file_name: String,
    path: String,
    size_bytes: u64,
    created_at: String,
}

const README: &str = "\
This folder contains automatic backups created by Soma (personal health dashboard).

* Each .somabk file is a complete, encrypted snapshot of the Soma database.
* Files are encrypted with a passphrase only the owner knows (Argon2id + AES-256-GCM).
  Without that passphrase the files cannot be read - by anyone.
* This is a backup destination only: the live data stays on the owner's device,
  and Soma never reads or syncs anything from this folder by itself.
* Old snapshots are rotated automatically; the newest files are the ones that matter.
* To restore: open Soma -> Settings -> Backups -> Restore from backup.

It is safe to leave this folder alone. Deleting it only deletes the backups.
";

#[tauri::command]
pub fn create_backup(
    snapshot_path: String,
    dest_dir: String,
    schema_version: u32,
) -> Result<BackupInfo, String> {
    let passphrase = match pass_entry()?.get_password() {
        Ok(p) => p,
        Err(keyring::Error::NoEntry) => {
            return Err("No backup passphrase in the keychain — set up backups again".into())
        }
        Err(e) => return Err(e.to_string()),
    };

    let plain = fs::read(&snapshot_path).map_err(|e| format!("read snapshot: {e}"))?;
    let out = encrypt_snapshot(&plain, &passphrase, schema_version)?;

    let dir = Path::new(&dest_dir).join(SUBDIR);
    fs::create_dir_all(&dir).map_err(|e| format!("create backup folder: {e}"))?;

    let readme = dir.join("README.txt");
    if !readme.exists() {
        let _ = fs::write(&readme, README);
    }

    let now = Local::now();
    let file_name = format!("{PREFIX}{}.{EXT}", now.format("%Y%m%d-%H%M%S"));
    let target = dir.join(&file_name);
    fs::write(&target, &out).map_err(|e| format!("write backup: {e}"))?;
    let _ = fs::remove_file(&snapshot_path);

    rotate(&dir);

    Ok(BackupInfo {
        file_name,
        path: target.to_string_lossy().into_owned(),
        size_bytes: out.len() as u64,
        created_at: now.to_rfc3339(),
    })
}

/// Keeps the newest `KEEP` snapshots. Only files matching our own naming
/// pattern are ever deleted — anything else in the folder is left untouched.
fn rotate(dir: &Path) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut backups: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .map(|n| {
                    let n = n.to_string_lossy();
                    n.starts_with(PREFIX) && n.ends_with(&format!(".{EXT}"))
                })
                .unwrap_or(false)
        })
        .collect();
    // Timestamped names sort chronologically.
    backups.sort();
    while backups.len() > KEEP {
        let _ = fs::remove_file(backups.remove(0));
    }
}

// ── restore ─────────────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreMeta {
    schema_version: u32,
    size_bytes: u64,
    file_modified_at: Option<String>,
}

/// Decrypts and validates a backup into a staging file, returning its
/// metadata. Nothing is replaced until `restore_backup` is called.
#[tauri::command]
pub fn inspect_backup(
    app: tauri::AppHandle,
    path: String,
    passphrase: String,
) -> Result<RestoreMeta, String> {
    let raw = fs::read(&path).map_err(|e| format!("read file: {e}"))?;
    let (schema_version, plain) = decrypt_snapshot(&raw, &passphrase)?;

    let staging = config_dir(&app)?.join(RESTORE_STAGING);
    fs::write(&staging, &plain).map_err(|e| format!("write staging: {e}"))?;

    let file_modified_at = fs::metadata(&path)
        .and_then(|m| m.modified())
        .ok()
        .map(|t| chrono::DateTime::<Local>::from(t).to_rfc3339());

    Ok(RestoreMeta {
        schema_version,
        size_bytes: plain.len() as u64,
        file_modified_at,
    })
}

#[tauri::command]
pub fn discard_restore_staging(app: tauri::AppHandle) -> Result<(), String> {
    let staging = config_dir(&app)?.join(RESTORE_STAGING);
    if staging.exists() {
        fs::remove_file(&staging).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Swaps the live database for the staged one and restarts the app.
/// The frontend MUST close its SQLite connection before calling this.
/// A timestamped safety copy of the current database is kept next to it.
#[tauri::command]
pub fn restore_backup(app: tauri::AppHandle) -> Result<(), String> {
    let cfg = config_dir(&app)?;
    let staging = cfg.join(RESTORE_STAGING);
    if !staging.exists() {
        return Err("Nothing staged — inspect a backup file first".into());
    }
    let db = cfg.join(DB_FILE);

    if db.exists() {
        let safety = cfg.join(format!(
            "soma-pre-restore-{}.db",
            Local::now().format("%Y%m%d-%H%M%S")
        ));
        fs::copy(&db, &safety).map_err(|e| format!("safety copy: {e}"))?;
    }
    // Stale WAL/SHM from the old database must not be replayed into the new one.
    let _ = fs::remove_file(cfg.join(format!("{DB_FILE}-wal")));
    let _ = fs::remove_file(cfg.join(format!("{DB_FILE}-shm")));

    fs::rename(&staging, &db).map_err(|e| format!("swap database: {e}"))?;

    app.restart();
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A minimal byte blob that passes the SQLite-magic check — stands in for a
    /// real database snapshot without needing a live SQLite file.
    fn fake_snapshot() -> Vec<u8> {
        let mut v = SQLITE_MAGIC.to_vec();
        v.extend_from_slice(b"-- soma backup round-trip test payload --");
        v
    }

    #[test]
    fn round_trips_and_preserves_schema_version() {
        let plain = fake_snapshot();
        let blob = encrypt_snapshot(&plain, "correct horse battery staple", 42).unwrap();
        let (schema_version, restored) = decrypt_snapshot(&blob, "correct horse battery staple")
            .expect("decrypt with the right passphrase");
        assert_eq!(
            schema_version, 42,
            "schema version must survive the round-trip"
        );
        assert_eq!(
            restored, plain,
            "restored bytes must match the original snapshot"
        );
    }

    #[test]
    fn wrong_passphrase_is_rejected() {
        let blob = encrypt_snapshot(&fake_snapshot(), "right-passphrase", 1).unwrap();
        assert!(decrypt_snapshot(&blob, "wrong-passphrase").is_err());
    }

    #[test]
    fn tampered_ciphertext_fails_authentication() {
        let mut blob = encrypt_snapshot(&fake_snapshot(), "pass1234", 1).unwrap();
        let last = blob.len() - 1;
        blob[last] ^= 0xFF; // flip a ciphertext/tag byte → AES-GCM auth must fail
        assert!(decrypt_snapshot(&blob, "pass1234").is_err());
    }

    #[test]
    fn refuses_to_encrypt_non_sqlite_input() {
        let err = encrypt_snapshot(b"this is not a database", "pass1234", 1).unwrap_err();
        assert!(err.contains("SQLite"));
    }

    #[test]
    fn rejects_a_file_without_the_soma_magic() {
        let not_a_backup =
            b"definitely not a soma backup file, just some random bytes here".to_vec();
        let err = decrypt_snapshot(&not_a_backup, "pass1234").unwrap_err();
        assert!(err.contains("Soma"));
    }

    #[test]
    fn rejects_a_newer_format_version() {
        let mut blob = encrypt_snapshot(&fake_snapshot(), "pass1234", 1).unwrap();
        blob[8] = FORMAT_VERSION + 1; // pretend a future Soma wrote it
        assert!(decrypt_snapshot(&blob, "pass1234").is_err());
    }

    #[test]
    fn each_backup_uses_a_fresh_salt_and_nonce() {
        let a = encrypt_snapshot(&fake_snapshot(), "pass1234", 1).unwrap();
        let b = encrypt_snapshot(&fake_snapshot(), "pass1234", 1).unwrap();
        // salt(16) + nonce(12) occupy bytes 13..41 and are random per backup,
        // so identical plaintext never produces identical ciphertext.
        assert_ne!(a[13..HEADER_LEN], b[13..HEADER_LEN]);
        assert_ne!(a[HEADER_LEN..], b[HEADER_LEN..]);
    }
}
