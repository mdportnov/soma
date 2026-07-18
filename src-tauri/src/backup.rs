//! Encrypted backups into a cloud-synced folder.
//!
//! Soma never talks to any cloud API. A backup is an encrypted snapshot of the
//! SQLite database written into a folder that the user's own cloud client
//! (iCloud Drive, Google Drive, Dropbox, OneDrive) already keeps in sync.
//! The live database never leaves the device; only `.somabk` snapshots do.
//!
//! File format (`.somabk`, v3):
//! `MAGIC(8) | format_version(1) | schema_version(4, LE) | argon2 m/t/p (3 × u32 LE) | salt(16) | nonce(12) | AES-256-GCM ciphertext`
//! The key is derived from the user passphrase with Argon2id. Without the
//! passphrase a backup cannot be decrypted — by anyone, including us. Legacy
//! files are still read: v1 (no stored Argon2 parameters, keyed with the pinned
//! defaults in [`crate::kdf`]) and v2 (a raw SQLite image). v3 shares v2's
//! header but its payload is an [`crate::archive`] of the database *and* the
//! attachment files, so a backup is a complete copy rather than just the DB
//! with dangling file paths.

use std::fs;
use std::path::{Path, PathBuf};

use aes_gcm::aead::{Aead, Generate, KeyInit};
use aes_gcm::Aes256Gcm;
use chrono::Local;
use keyring::Entry;
use serde::Serialize;
use tauri::Manager;

use crate::fsutil::atomic_write;
use crate::kdf;

const KEYCHAIN_SERVICE: &str = "com.soma.health";
const PASSPHRASE_USER: &str = "backup-passphrase";

const MAGIC: &[u8; 8] = b"SOMABK1\0";
/// On-disk formats. v1 stored no Argon2 parameters; v2 adds m/t/p and holds a
/// raw SQLite image; v3 shares v2's header but its payload is an archive of the
/// database plus attachment files. v1/v2 are still read.
/// v2 = raw SQLite payload. Production now writes v3, but tests still build v2
/// blobs to prove they're still readable.
#[cfg(test)]
const FORMAT_VERSION_DB: u8 = 2;
const FORMAT_VERSION_ARCHIVE: u8 = 3;
/// v1: MAGIC(8) | version(1) | schema_version(4) | salt(16) | nonce(12).
const HEADER_LEN_V1: usize = 8 + 1 + 4 + 16 + 12;
/// v2/v3: add m_cost/t_cost/p_cost (3 × u32 LE) between schema_version and salt.
const HEADER_LEN_V2: usize = 8 + 1 + 4 + 12 + 16 + 12;
const SQLITE_MAGIC: &[u8; 16] = b"SQLite format 3\0";

const SUBDIR: &str = "Soma Backups";
const PREFIX: &str = "soma-backup-";
const EXT: &str = "somabk";
const KEEP: usize = 12;

const SNAPSHOT_STAGING: &str = "backup-snapshot-staging.db";
const RESTORE_STAGING: &str = "restore-staging.db";
/// Folder where a restore stages the backup's attachment files before the swap.
const RESTORE_ATTACHMENTS_STAGING: &str = "restore-attachments-staging";
const DB_FILE: &str = "soma.db";
/// Directory (under the app config dir) holding imported attachment files.
const ATTACHMENTS_DIR: &str = "attachments";
/// Reserved archive entry name for the database image.
const DB_ENTRY: &str = "soma.db";

fn pass_entry() -> Result<Entry, String> {
    Entry::new(KEYCHAIN_SERVICE, PASSPHRASE_USER).map_err(|e| e.to_string())
}

/// Encrypts `plain` into the `.somabk` byte layout with the given format
/// version (`MAGIC | format | schema_version | m/t/p | salt | nonce | AES-256-GCM
/// ciphertext`). v2 and v3 share this header; only the payload differs (v2 = a
/// raw SQLite image, v3 = an [`crate::archive`] of the DB + attachment files).
/// Pure apart from the per-call random salt/nonce.
fn seal(
    plain: &[u8],
    passphrase: &str,
    schema_version: u32,
    version: u8,
) -> Result<Vec<u8>, String> {
    let salt = <[u8; 16]>::generate();
    let nonce = <[u8; 12]>::generate();
    let key = kdf::derive_key_pinned(passphrase, &salt)?;
    let cipher = Aes256Gcm::new((&key).into());
    let ciphertext = cipher
        .encrypt((&nonce).into(), plain)
        .map_err(|e| format!("encrypt: {e}"))?;

    let mut out = Vec::with_capacity(HEADER_LEN_V2 + ciphertext.len());
    out.extend_from_slice(MAGIC);
    out.push(version);
    out.extend_from_slice(&schema_version.to_le_bytes());
    out.extend_from_slice(&kdf::M_COST_KIB.to_le_bytes());
    out.extend_from_slice(&kdf::T_COST.to_le_bytes());
    out.extend_from_slice(&kdf::P_COST.to_le_bytes());
    out.extend_from_slice(&salt);
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

/// Encrypts a raw SQLite snapshot as a v2 backup. Retained to exercise reading
/// the v2 format (production now writes v3 archives via `encrypt_archive`).
#[cfg(test)]
fn encrypt_snapshot(
    plain: &[u8],
    passphrase: &str,
    schema_version: u32,
) -> Result<Vec<u8>, String> {
    if plain.len() < SQLITE_MAGIC.len() || &plain[..SQLITE_MAGIC.len()] != SQLITE_MAGIC {
        return Err("Snapshot is not a valid SQLite database".into());
    }
    seal(plain, passphrase, schema_version, FORMAT_VERSION_DB)
}

/// Encrypts a DB-plus-attachments archive as a v3 backup.
fn encrypt_archive(
    archive: &[u8],
    passphrase: &str,
    schema_version: u32,
) -> Result<Vec<u8>, String> {
    if !crate::archive::is_archive(archive) {
        return Err("Backup payload is not a Soma archive".into());
    }
    seal(archive, passphrase, schema_version, FORMAT_VERSION_ARCHIVE)
}

/// Decrypts a backup header + body, returning `(schema_version, format_version,
/// payload)`. Accepts v1 (legacy, pinned Argon2 params), v2 (raw DB) and v3
/// (archive). A wrong passphrase or tampering fails the AES-GCM auth tag.
fn open_backup(raw: &[u8], passphrase: &str) -> Result<(u32, u8, Vec<u8>), String> {
    if raw.len() < 13 || &raw[..8] != MAGIC {
        return Err("Not a Soma backup file".into());
    }
    let version = raw[8];
    let schema_version = u32::from_le_bytes(raw[9..13].try_into().unwrap());

    let (m_cost, t_cost, p_cost, salt, nonce, body_offset) = match version {
        1 => {
            if raw.len() <= HEADER_LEN_V1 {
                return Err("Not a Soma backup file".into());
            }
            (
                kdf::M_COST_KIB,
                kdf::T_COST,
                kdf::P_COST,
                &raw[13..29],
                &raw[29..41],
                HEADER_LEN_V1,
            )
        }
        2 | 3 => {
            if raw.len() <= HEADER_LEN_V2 {
                return Err("Not a Soma backup file".into());
            }
            let m = u32::from_le_bytes(raw[13..17].try_into().unwrap());
            let t = u32::from_le_bytes(raw[17..21].try_into().unwrap());
            let p = u32::from_le_bytes(raw[21..25].try_into().unwrap());
            kdf::validate_params(m, t, p)?;
            (m, t, p, &raw[25..41], &raw[41..53], HEADER_LEN_V2)
        }
        _ => return Err("This backup was created by a newer version of Soma".into()),
    };

    let nonce: &[u8; 12] = nonce
        .try_into()
        .map_err(|_| "Backup nonce has the wrong length")?;
    let key = kdf::derive_key(passphrase, salt, m_cost, t_cost, p_cost)?;
    let cipher = Aes256Gcm::new((&key).into());
    let payload = cipher
        .decrypt(nonce.into(), &raw[body_offset..])
        .map_err(|_| "Wrong passphrase, or the file is corrupted".to_string())?;
    Ok((schema_version, version, payload))
}

/// Full decrypt: returns `(schema_version, database_bytes, attachment_entries)`.
/// v1/v2 yield the DB with no attachments; v3 unpacks both from the archive.
fn decrypt_backup(
    raw: &[u8],
    passphrase: &str,
) -> Result<(u32, Vec<u8>, Vec<crate::archive::Entry>), String> {
    let (schema_version, version, payload) = open_backup(raw, passphrase)?;
    let (db, attachments) = if version == FORMAT_VERSION_ARCHIVE {
        let entries = crate::archive::unpack(&payload)?;
        let mut db = None;
        let mut attachments = Vec::new();
        for e in entries {
            if e.name == DB_ENTRY {
                db = Some(e.data);
            } else {
                attachments.push(e);
            }
        }
        (
            db.ok_or("Backup archive is missing the database")?,
            attachments,
        )
    } else {
        (payload, Vec::new())
    };
    if db.len() < SQLITE_MAGIC.len() || &db[..SQLITE_MAGIC.len()] != SQLITE_MAGIC {
        return Err("Decrypted data is not a SQLite database".into());
    }
    Ok((schema_version, db, attachments))
}

/// Convenience for tests — drops any attachments.
#[cfg(test)]
fn decrypt_snapshot(raw: &[u8], passphrase: &str) -> Result<(u32, Vec<u8>), String> {
    let (schema_version, db, _) = decrypt_backup(raw, passphrase)?;
    Ok((schema_version, db))
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

/// Reads every regular file in a directory as archive entries under `prefix/`.
fn read_dir_entries(dir: &Path, prefix: &str) -> Result<Vec<crate::archive::Entry>, String> {
    let mut entries = Vec::new();
    if !dir.is_dir() {
        return Ok(entries);
    }
    for e in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let path = e.map_err(|e| e.to_string())?.path();
        if path.is_file() {
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .ok_or("attachment has a non-UTF-8 name")?
                .to_string();
            let data = fs::read(&path).map_err(|e| format!("read attachment: {e}"))?;
            entries.push(crate::archive::Entry {
                name: format!("{prefix}/{name}"),
                data,
            });
        }
    }
    Ok(entries)
}

#[tauri::command]
pub fn create_backup(
    app: tauri::AppHandle,
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

    // On any failure below, remove the plaintext staging snapshot so it can't
    // linger on disk (it was previously only cleared on the next backup run).
    let finish = |result: Result<BackupInfo, String>| -> Result<BackupInfo, String> {
        let _ = fs::remove_file(&snapshot_path);
        result
    };

    let plain = match fs::read(&snapshot_path) {
        Ok(p) => p,
        Err(e) => return finish(Err(format!("read snapshot: {e}"))),
    };
    // Bundle the database and every attachment file into one archive so a backup
    // is a complete, portable copy — not just the DB with dangling file paths.
    let attachments_dir = match config_dir(&app) {
        Ok(d) => d.join(ATTACHMENTS_DIR),
        Err(e) => return finish(Err(e)),
    };
    let mut entries = vec![crate::archive::Entry {
        name: DB_ENTRY.to_string(),
        data: plain,
    }];
    match read_dir_entries(&attachments_dir, ATTACHMENTS_DIR) {
        Ok(mut a) => entries.append(&mut a),
        Err(e) => return finish(Err(e)),
    }
    let archive_bytes = crate::archive::pack(&entries);
    let out = match encrypt_archive(&archive_bytes, &passphrase, schema_version) {
        Ok(o) => o,
        Err(e) => return finish(Err(e)),
    };

    let dir = Path::new(&dest_dir).join(SUBDIR);
    if let Err(e) = fs::create_dir_all(&dir) {
        return finish(Err(format!("create backup folder: {e}")));
    }

    let readme = dir.join("README.txt");
    if !readme.exists() {
        let _ = fs::write(&readme, README);
    }

    let now = Local::now();
    let file_name = format!("{PREFIX}{}.{EXT}", now.format("%Y%m%d-%H%M%S"));
    let target = dir.join(&file_name);
    // Atomic write so a crash or disk-full mid-write can't leave a truncated
    // snapshot that rotation would keep as the "newest" (and only) backup.
    if let Err(e) = atomic_write(&target, &out) {
        return finish(Err(e));
    }
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
    let (schema_version, plain, attachments) = decrypt_backup(&raw, &passphrase)?;

    let cfg = config_dir(&app)?;
    let staging = cfg.join(RESTORE_STAGING);
    atomic_write(&staging, &plain)?;

    // Stage the backup's attachment files; restore moves them into place.
    let att_staging = cfg.join(RESTORE_ATTACHMENTS_STAGING);
    let _ = fs::remove_dir_all(&att_staging);
    if !attachments.is_empty() {
        fs::create_dir_all(&att_staging).map_err(|e| e.to_string())?;
        for e in &attachments {
            let name = e.name.trim_start_matches(&format!("{ATTACHMENTS_DIR}/"));
            // Reject a tampered archive trying to escape the attachments dir.
            if name.is_empty() || name.contains('/') || name.contains('\\') || name.contains("..") {
                continue;
            }
            atomic_write(&att_staging.join(name), &e.data)?;
        }
    }

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
    let cfg = config_dir(&app)?;
    let staging = cfg.join(RESTORE_STAGING);
    if staging.exists() {
        fs::remove_file(&staging).map_err(|e| e.to_string())?;
    }
    let _ = fs::remove_dir_all(cfg.join(RESTORE_ATTACHMENTS_STAGING));
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

    // Move the staged attachment files into place so the restored records'
    // documents are present (best-effort — the DB swap already succeeded).
    let att_staging = cfg.join(RESTORE_ATTACHMENTS_STAGING);
    if att_staging.is_dir() {
        let attachments = cfg.join(ATTACHMENTS_DIR);
        let _ = fs::create_dir_all(&attachments);
        if let Ok(read) = fs::read_dir(&att_staging) {
            for entry in read.flatten() {
                let from = entry.path();
                if let Some(name) = from.file_name() {
                    let to = attachments.join(name);
                    // rename is atomic on the same volume; fall back to copy.
                    if fs::rename(&from, &to).is_err() {
                        let _ = fs::copy(&from, &to);
                    }
                }
            }
        }
        let _ = fs::remove_dir_all(&att_staging);
    }

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
        blob[8] = FORMAT_VERSION_ARCHIVE + 1; // pretend a future Soma wrote it
        assert!(decrypt_snapshot(&blob, "pass1234").is_err());
    }

    /// A v3 backup round-trips the database and its attachments.
    #[test]
    fn v3_archive_round_trips_db_and_attachments() {
        let db = fake_snapshot();
        let entries = vec![
            crate::archive::Entry {
                name: DB_ENTRY.to_string(),
                data: db.clone(),
            },
            crate::archive::Entry {
                name: format!("{ATTACHMENTS_DIR}/report.pdf"),
                data: b"%PDF-1.7 fake".to_vec(),
            },
        ];
        let archive = crate::archive::pack(&entries);
        let blob = encrypt_archive(&archive, "pass1234", 7).unwrap();
        let (schema_version, restored_db, attachments) = decrypt_backup(&blob, "pass1234").unwrap();
        assert_eq!(schema_version, 7);
        assert_eq!(restored_db, db);
        assert_eq!(attachments.len(), 1);
        assert_eq!(attachments[0].name, format!("{ATTACHMENTS_DIR}/report.pdf"));
        assert_eq!(attachments[0].data, b"%PDF-1.7 fake");
    }

    /// A legacy v1 backup (no Argon2 params in the header) must still decrypt
    /// under the pinned legacy parameters — the point of the v2 change.
    #[test]
    fn legacy_v1_backup_still_decrypts() {
        let plain = fake_snapshot();
        let pass = "an old backup from before v2";
        let salt = <[u8; 16]>::generate();
        let nonce = <[u8; 12]>::generate();
        let key = kdf::derive_key_pinned(pass, &salt).unwrap();
        let cipher = Aes256Gcm::new((&key).into());
        let ciphertext = cipher.encrypt((&nonce).into(), plain.as_slice()).unwrap();
        let mut blob = Vec::new();
        blob.extend_from_slice(MAGIC);
        blob.push(1); // v1
        blob.extend_from_slice(&99u32.to_le_bytes());
        blob.extend_from_slice(&salt);
        blob.extend_from_slice(&nonce);
        blob.extend_from_slice(&ciphertext);

        let (schema_version, restored) = decrypt_snapshot(&blob, pass).unwrap();
        assert_eq!(schema_version, 99);
        assert_eq!(restored, plain);
    }

    /// A v2 header with corrupt Argon2 params is rejected before any derivation.
    #[test]
    fn corrupt_v2_params_are_rejected() {
        let mut blob = encrypt_snapshot(&fake_snapshot(), "pass1234", 1).unwrap();
        blob[13..17].copy_from_slice(&0u32.to_le_bytes()); // zero m_cost
        assert!(decrypt_snapshot(&blob, "pass1234").is_err());
    }

    #[test]
    fn each_backup_uses_a_fresh_salt_and_nonce() {
        let a = encrypt_snapshot(&fake_snapshot(), "pass1234", 1).unwrap();
        let b = encrypt_snapshot(&fake_snapshot(), "pass1234", 1).unwrap();
        // salt(16) + nonce(12) occupy bytes 25..53 and are random per backup,
        // so identical plaintext never produces identical ciphertext.
        assert_ne!(a[25..HEADER_LEN_V2], b[25..HEADER_LEN_V2]);
        assert_ne!(a[HEADER_LEN_V2..], b[HEADER_LEN_V2..]);
    }
}
