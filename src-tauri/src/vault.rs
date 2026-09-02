//! Optional at-rest encryption of the live database.
//!
//! Soma uses `tauri-plugin-sql` over a plain SQLite file, so the database is in
//! the clear while the app runs (as it would be with any page-level cipher held
//! in memory). What this module adds is an **encrypted-when-closed vault**: on a
//! clean exit the working `soma.db` is replaced by an encrypted `soma.db.vault`,
//! and on the next launch the vault is decrypted back into place. The plaintext
//! database therefore only exists on disk while the app is actually running.
//!
//! Two unlock modes (the user picks in Settings):
//! - **keychain**: a random 32-byte data key lives in the OS keychain; the app
//!   unlocks automatically at launch. Protects against offline disk theft.
//! - **passphrase**: the key is derived from a passphrase (Argon2id) the user
//!   types at launch; nothing is persisted. Resists a compromised keychain.
//!
//! The container format itself lives in the `soma-vault` crate, which the
//! `soma-recover` CLI also builds against — see [`soma_vault::format`]. This
//! module is only the app's side: where the files are, when they are written,
//! and what must never happen to them.
//!
//! Imported attachment files (PDFs/photos) are sealed alongside the database in
//! a sibling `attachments.vault` (an encrypted [`soma_vault::archive`] of the
//! attachments folder), so at-rest encryption covers them too instead of
//! leaving the most sensitive documents in cleartext. They are restored to
//! cleartext on unlock and re-sealed on the next lock.
//!
//! # Invariants
//!
//! These are the rules that stop an encryption feature from becoming a deletion
//! feature. Each is enforced here, not merely documented:
//!
//! 1. **Never seal over an attachments vault this session did not open.** A
//!    surviving `attachments.vault` means its contents are *not* represented in
//!    the attachments directory, so packing that directory would replace real
//!    files with whatever happens to be lying around — including nothing.
//!    [`seal_attachments`] folds the old vault back in first.
//! 2. **Never decrypt over a plaintext database.** A `soma.db` next to the
//!    vault is newer than the vault (it is what an unclean exit left behind);
//!    overwriting it with the vault silently discards a session's work.
//! 3. **Never discard the key while ciphertext still needs it.**
//!    [`vault_disable`] restores the attachments before removing the key.
//! 4. **Say so, loudly.** Every step logs. The failure that motivated all of
//!    this left not one line in the log to explain itself.

use std::fs;
use std::path::PathBuf;

use aes_gcm::aead::Generate;
use serde::Serialize;
use soma_vault::format::{self, KeySource, MODE_KEYCHAIN, MODE_PASSPHRASE};
use soma_vault::{archive, keychain, paths};
use tauri::Manager;

use crate::fsutil::atomic_write;

const VAULT_FILE: &str = paths::VAULT_FILE;
const DB_FILE: &str = paths::DB_FILE;
const SNAPSHOT_STAGING: &str = "vault-snapshot-staging.db";
/// Imported PDFs/photos live here in cleartext while the app runs; on lock they
/// are packed and encrypted into `ATTACHMENTS_VAULT` so at-rest encryption
/// covers the most sensitive documents too, not just the database.
const ATTACHMENTS_DIR: &str = paths::ATTACHMENTS_DIR;
const ATTACHMENTS_VAULT: &str = paths::ATTACHMENTS_VAULT;

fn config_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_config_dir().map_err(|e| e.to_string())
}

fn vault_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(config_dir(app)?.join(VAULT_FILE))
}

fn db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(config_dir(app)?.join(DB_FILE))
}

// ── state ─────────────────────────────────────────────────────────────────────

/// Why the keychain key could not be used. Kept distinct from "there is no key"
/// because the two call for opposite reactions: a missing key means encryption
/// was never on, while a refused one means the data is there and the OS is in
/// the way — on macOS, almost always because the app was re-signed.
#[derive(Serialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub enum KeychainKeyStatus {
    Present,
    Missing,
    Unavailable,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultState {
    /// A `soma.db.vault` file exists (encryption has been enabled).
    vault_exists: bool,
    /// A plaintext `soma.db` exists (live data, or a crash left it behind).
    plaintext_exists: bool,
    /// Size of that plaintext database, and of the vault. The gate compares
    /// them: the vault is a whole copy of the database as of the last clean
    /// exit, and AES-GCM does not compress, so a genuine live database is
    /// about the same size or larger. One that is dramatically smaller was not
    /// written by a Soma session with this data in it, and booting on it would
    /// show the user an empty app while their records sit in the vault.
    plaintext_size: u64,
    vault_size: u64,
    /// An `attachments.vault` exists — i.e. attachments are still sealed.
    attachments_vault_exists: bool,
    /// Unlock mode read from the vault header: "keychain" | "passphrase" | null.
    mode: Option<&'static str>,
    /// Whether the vault header could be read at all. False with
    /// `vault_exists` true means the file is there and unreadable — which is a
    /// reason to stop, never a reason to assume there is no encryption.
    header_readable: bool,
    /// Set when the vault exists but its header would not parse.
    header_error: Option<String>,
    /// Whether the keychain data key is present, absent, or refused.
    keychain_key_status: KeychainKeyStatus,
    /// Detail when the keychain refused (for the diagnostics panel).
    keychain_error: Option<String>,
    /// Absolute path of the directory holding all of the above, so a recovery
    /// screen can point the user at their own files instead of describing them.
    data_dir: String,
}

/// Snapshot of on-disk vault state, read by the frontend startup gate to decide
/// whether (and how) to unlock before the SQLite plugin opens the database.
///
/// Every field is reported honestly, including the ways of failing. The gate's
/// job is to refuse to boot on anything ambiguous, and it cannot do that if
/// this function launders "I could not tell" into "there is nothing here".
#[tauri::command]
pub fn vault_state(app: tauri::AppHandle) -> Result<VaultState, String> {
    let vault = vault_path(&app)?;
    let db = db_path(&app)?;
    let vault_exists = vault.exists();

    let (mode, header_readable, header_error) = if vault_exists {
        match fs::read(&vault).map_err(|e| e.to_string()) {
            Ok(raw) => match format::parse_header(&raw) {
                Ok(h) => (Some(h.mode_name()), true, None),
                Err(e) => {
                    log::error!("vault: header of {} is unreadable: {e}", vault.display());
                    (None, false, Some(e.to_string()))
                }
            },
            Err(e) => {
                log::error!("vault: cannot read {}: {e}", vault.display());
                (None, false, Some(e))
            }
        }
    } else {
        (None, true, None)
    };

    let (keychain_key_status, keychain_error) = match keychain::status() {
        keychain::KeyStatus::Present => (KeychainKeyStatus::Present, None),
        keychain::KeyStatus::Missing => (KeychainKeyStatus::Missing, None),
        keychain::KeyStatus::Unavailable(e) => {
            log::error!("vault: the keychain refused the database key: {e}");
            (KeychainKeyStatus::Unavailable, Some(e))
        }
    };

    let size_of = |p: &std::path::Path| fs::metadata(p).map(|m| m.len()).unwrap_or(0);
    let state = VaultState {
        vault_exists,
        plaintext_exists: db.exists(),
        plaintext_size: size_of(&db),
        vault_size: size_of(&vault),
        attachments_vault_exists: attachments_vault_path(&app)?.exists(),
        mode,
        header_readable,
        header_error,
        keychain_key_status,
        keychain_error,
        data_dir: config_dir(&app)?.to_string_lossy().into_owned(),
    };
    log::info!(
        "vault: state vault={} plaintext={} attachments_vault={} mode={:?} header_ok={} key={:?}",
        state.vault_exists,
        state.plaintext_exists,
        state.attachments_vault_exists,
        state.mode,
        state.header_readable,
        state.keychain_key_status,
    );
    Ok(state)
}

/// Returns the staging path the frontend should `VACUUM INTO` before locking or
/// enabling, clearing any stale snapshot from an interrupted run.
#[tauri::command]
pub fn vault_snapshot_target(app: tauri::AppHandle) -> Result<String, String> {
    let path = config_dir(&app)?.join(SNAPSHOT_STAGING);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(path.to_string_lossy().into_owned())
}

// ── enable ────────────────────────────────────────────────────────────────────

fn write_vault_from_snapshot(
    app: &tauri::AppHandle,
    snapshot_path: &str,
    source: KeySource,
    mode: u8,
) -> Result<(), String> {
    let plain = fs::read(snapshot_path).map_err(|e| format!("read snapshot: {e}"))?;
    let out = format::encrypt_snapshot(&plain, source, mode)?;
    // Atomic write: the plaintext DB is only removed by the caller after this
    // returns, so a crash mid-write can never leave a truncated vault AND no
    // plaintext. The old vault survives until the new one is durably in place.
    atomic_write(&vault_path(app)?, &out)?;
    let _ = fs::remove_file(snapshot_path);
    log::info!("vault: sealed the database ({} bytes)", out.len());
    Ok(())
}

// ── attachments (sealed alongside the DB, in a sibling file) ──────────────────

/// How to obtain the attachments-vault key.
#[derive(Clone, Copy)]
enum Unlock<'a> {
    Key(&'a [u8; 32]),
    Passphrase(&'a str),
}

impl<'a> Unlock<'a> {
    fn as_source(&self) -> KeySource<'a> {
        match self {
            Unlock::Key(k) => KeySource::Raw(k),
            Unlock::Passphrase(p) => KeySource::Passphrase(p),
        }
    }

    fn mode(&self) -> u8 {
        match self {
            Unlock::Key(_) => MODE_KEYCHAIN,
            Unlock::Passphrase(_) => MODE_PASSPHRASE,
        }
    }
}

fn attachments_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(config_dir(app)?.join(ATTACHMENTS_DIR))
}

fn attachments_vault_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(config_dir(app)?.join(ATTACHMENTS_VAULT))
}

/// Reads every regular file in the attachments dir as an archive entry.
fn read_attachment_entries(dir: &std::path::Path) -> Result<Vec<archive::Entry>, String> {
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
            // `atomic_write` stages through `<name>.tmp`; one left behind by an
            // interrupted restore is debris, not an attachment, and sealing it
            // would resurrect it on every future unlock.
            if name.ends_with(".tmp") {
                log::warn!("vault: ignoring leftover staging file {name}");
                continue;
            }
            let data = fs::read(&path).map_err(|e| format!("read attachment: {e}"))?;
            entries.push(archive::Entry {
                name: format!("{ATTACHMENTS_DIR}/{name}"),
                data,
            });
        }
    }
    Ok(entries)
}

/// Packs the attachments into an encrypted sibling vault and removes the
/// cleartext files.
///
/// Invariant 1 lives here. An `attachments.vault` still on disk at lock time
/// means this session never opened it, so the attachments directory does **not**
/// represent its contents — it is missing every file the old vault holds. The
/// old vault is therefore restored (without overwriting anything live) before
/// the directory is packed. Skipping that step is how a sealed set of documents
/// gets replaced by an empty one and deleted, which is precisely what a
/// half-finished unlock used to cause.
fn seal_attachments(app: &tauri::AppHandle, unlock: Unlock) -> Result<(), String> {
    let target = attachments_vault_path(app)?;
    if target.exists() {
        log::warn!(
            "vault: {ATTACHMENTS_VAULT} was never opened this session — folding it back in \
             before re-sealing, so its files are not lost"
        );
        restore_attachments(app, unlock, KeepExisting::Yes)?;
    }

    let dir = attachments_dir(app)?;
    let entries = read_attachment_entries(&dir)?;
    if entries.is_empty() {
        // Nothing to seal. There is also nothing to delete: the restore above
        // guarantees any previous vault has already been folded into this
        // directory, so an empty directory really does mean no attachments.
        if target.exists() {
            let _ = fs::remove_file(&target);
        }
        return Ok(());
    }
    let packed = archive::pack(&entries);
    let out = format::seal(&packed, unlock.as_source(), unlock.mode())?;
    atomic_write(&target, &out)?;
    // Only now, with the encrypted copy durably written, remove the plaintext.
    let mut removed = 0usize;
    for e in &entries {
        let name = e.name.trim_start_matches(&format!("{ATTACHMENTS_DIR}/"));
        if fs::remove_file(dir.join(name)).is_ok() {
            removed += 1;
        }
    }
    log::info!(
        "vault: sealed {} attachment(s), removed {removed} cleartext file(s)",
        entries.len()
    );
    Ok(())
}

/// Whether a restore may replace a file that is already in the attachments dir.
#[derive(PartialEq, Clone, Copy)]
enum KeepExisting {
    /// Fold-in during a lock: a live file is newer than the sealed copy.
    Yes,
    /// Startup restore: the directory should be empty, and the vault wins.
    No,
}

/// Decrypts the attachments vault back into cleartext files and removes it.
fn restore_attachments(
    app: &tauri::AppHandle,
    unlock: Unlock,
    keep_existing: KeepExisting,
) -> Result<(), String> {
    let vault = attachments_vault_path(app)?;
    if !vault.exists() {
        return Ok(());
    }
    let raw = fs::read(&vault).map_err(|e| format!("read attachments vault: {e}"))?;
    let header = format::parse_header(&raw)?;
    let key = match unlock {
        Unlock::Key(k) => *k,
        Unlock::Passphrase(p) => format::derive_key_for_header(p, &header)?,
    };
    let plain = format::open(&raw, &header, &key)?;
    let entries = archive::unpack(&plain)?;
    let dir = attachments_dir(app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let mut written = 0usize;
    for e in entries {
        let name = e.name.trim_start_matches(&format!("{ATTACHMENTS_DIR}/"));
        // Reject a tampered archive that tries to escape the attachments dir.
        if name.is_empty() || name.contains('/') || name.contains('\\') || name.contains("..") {
            log::warn!(
                "vault: skipping attachment with an unsafe name {:?}",
                e.name
            );
            continue;
        }
        let target = dir.join(name);
        if keep_existing == KeepExisting::Yes && target.exists() {
            continue;
        }
        atomic_write(&target, &e.data)?;
        written += 1;
    }
    // Only once every file is durably on disk does the ciphertext go.
    fs::remove_file(&vault).map_err(|e| format!("remove attachments vault: {e}"))?;
    log::info!("vault: restored {written} attachment(s)");
    Ok(())
}

/// Turns on keychain-mode encryption: mints/loads the keychain key and writes an
/// initial vault from the snapshot. The app keeps running on the plaintext DB;
/// the plaintext is only removed on the next clean exit (lock).
#[tauri::command]
pub fn vault_enable_keychain(app: tauri::AppHandle, snapshot_path: String) -> Result<(), String> {
    let key = keychain::ensure_key(<[u8; 32]>::generate())?;
    log::info!("vault: enabling keychain-mode encryption");
    write_vault_from_snapshot(&app, &snapshot_path, KeySource::Raw(&key), MODE_KEYCHAIN)
}

/// Turns on passphrase-mode encryption. The passphrase is never stored; the
/// frontend keeps it in memory for the session so it can re-lock on exit.
#[tauri::command]
pub fn vault_enable_passphrase(
    app: tauri::AppHandle,
    snapshot_path: String,
    passphrase: String,
) -> Result<(), String> {
    if passphrase.len() < 8 {
        return Err("Passphrase must be at least 8 characters".into());
    }
    log::info!("vault: enabling passphrase-mode encryption");
    write_vault_from_snapshot(
        &app,
        &snapshot_path,
        KeySource::Passphrase(&passphrase),
        MODE_PASSPHRASE,
    )
}

/// Hands the frontend the raw 32-byte keychain key as hex, so the user can
/// write down a recovery code while the key is still readable.
///
/// This exists because of how keychain mode actually fails: the key is bound to
/// the app's code signature, Soma is ad-hoc signed, and every update therefore
/// arrives as a different application that the OS will not hand the key to. A
/// user with this string on paper is ten seconds from their data; a user
/// without it is dependent on a keychain that has already let them down.
#[tauri::command]
pub fn vault_recovery_key() -> Result<String, String> {
    let key = keychain::read_key()?;
    Ok(keychain::to_hex(&key))
}

// ── unlock (startup) ──────────────────────────────────────────────────────────

fn write_plaintext_db(app: &tauri::AppHandle, plain: &[u8]) -> Result<(), String> {
    let db = db_path(app)?;
    // Invariant 2. A plaintext database next to the vault is newer than the
    // vault — it is what an unclean exit left behind — so decrypting over it
    // would throw away a whole session. The startup gate already avoids this;
    // refusing here too means no future caller can get it wrong.
    if db.exists() {
        return Err(format!(
            "Refusing to unlock over the existing database at {}: it is newer than the vault. \
             Move it aside first if you really mean to restore the vault.",
            db.display()
        ));
    }
    // A stale WAL/SHM from a previous run must not be replayed onto the fresh DB.
    let cfg = config_dir(app)?;
    let _ = fs::remove_file(cfg.join(format!("{DB_FILE}-wal")));
    let _ = fs::remove_file(cfg.join(format!("{DB_FILE}-shm")));
    // Atomic: a crash mid-write can't leave a half-decrypted database in place
    // of the live file — either the whole plaintext lands or nothing does.
    atomic_write(&db, plain)
}

/// Decrypts the vault into the live `soma.db` using the keychain key. Called at
/// startup (keychain mode) before the SQLite plugin opens the database.
#[tauri::command]
pub fn vault_unlock_keychain(app: tauri::AppHandle) -> Result<(), String> {
    log::info!("vault: unlocking with the keychain key");
    let raw = fs::read(vault_path(&app)?).map_err(|e| format!("read vault: {e}"))?;
    let header = format::parse_header(&raw)?;
    let key = keychain::read_key().inspect_err(|e| log::error!("vault: unlock failed: {e}"))?;
    unlock_with(&app, &raw, &header, Unlock::Key(&key))
}

/// Decrypts the vault into `soma.db` using a passphrase. A wrong passphrase is
/// reported as an error the unlock screen surfaces ("wrong passphrase").
#[tauri::command]
pub fn vault_unlock_passphrase(app: tauri::AppHandle, passphrase: String) -> Result<(), String> {
    log::info!("vault: unlocking with a passphrase");
    let raw = fs::read(vault_path(&app)?).map_err(|e| format!("read vault: {e}"))?;
    let header = format::parse_header(&raw)?;
    unlock_with(&app, &raw, &header, Unlock::Passphrase(&passphrase))
}

/// Unlocks with a hand-supplied recovery key (the hex string from
/// [`vault_recovery_key`], or read out of the keychain by other means). The
/// escape hatch inside the app, mirroring what `soma-recover` does outside it.
#[tauri::command]
pub fn vault_unlock_with_key(app: tauri::AppHandle, key_hex: String) -> Result<(), String> {
    log::info!("vault: unlocking with a supplied recovery key");
    let key = keychain::parse_key(&key_hex)?;
    let raw = fs::read(vault_path(&app)?).map_err(|e| format!("read vault: {e}"))?;
    let header = format::parse_header(&raw)?;
    unlock_with(&app, &raw, &header, Unlock::Key(&key))
}

/// The database is decrypted first and the attachments second, and a failure in
/// either leaves the vaults on disk. A partially unlocked app is recoverable;
/// a deleted ciphertext is not.
fn unlock_with(
    app: &tauri::AppHandle,
    raw: &[u8],
    header: &format::Header,
    unlock: Unlock,
) -> Result<(), String> {
    let key = match unlock {
        Unlock::Key(k) => *k,
        Unlock::Passphrase(p) => format::derive_key_for_header(p, header)?,
    };
    let plain = format::decrypt_snapshot(raw, header, &key)
        .inspect_err(|e| log::error!("vault: could not open the database vault: {e}"))?;
    write_plaintext_db(app, &plain)?;
    restore_attachments(app, unlock, KeepExisting::No)
        .inspect_err(|e| log::error!("vault: database unlocked but attachments did not: {e}"))?;
    log::info!("vault: unlocked");
    Ok(())
}

/// Moves an unexpected plaintext `soma.db` out of the way so the vault can be
/// unlocked over it, keeping the file under a timestamped name.
///
/// Nothing is ever deleted here. The file being moved aside is, by definition,
/// one Soma could not account for — which is exactly the kind of file that
/// turns out to matter after all.
#[tauri::command]
pub fn vault_quarantine_plaintext(app: tauri::AppHandle) -> Result<String, String> {
    let cfg = config_dir(&app)?;
    let db = cfg.join(DB_FILE);
    if !db.exists() {
        return Err("There is no plaintext database to move aside".into());
    }
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let target = cfg.join(format!("{DB_FILE}.set-aside-{stamp}"));
    fs::rename(&db, &target).map_err(|e| format!("move {} aside: {e}", db.display()))?;
    for suffix in ["-wal", "-shm"] {
        let side = cfg.join(format!("{DB_FILE}{suffix}"));
        if side.exists() {
            let _ = fs::rename(
                &side,
                cfg.join(format!("{DB_FILE}.set-aside-{stamp}{suffix}")),
            );
        }
    }
    log::warn!(
        "vault: moved an unexpected plaintext database to {}",
        target.display()
    );
    Ok(target.to_string_lossy().into_owned())
}

/// Restores sealed attachments without touching the database.
///
/// The case this exists for: an unclean exit left a newer plaintext `soma.db`
/// next to a still-sealed `attachments.vault`. The database must not be
/// overwritten by the older vault, but the attachments are simply *missing*
/// from the running app until they are unpacked — every PDF and scan silently
/// gone from the UI while the ciphertext sits right there. Pass the passphrase
/// in passphrase mode; omit it to use the keychain key.
#[tauri::command]
pub fn vault_restore_attachments(
    app: tauri::AppHandle,
    passphrase: Option<String>,
) -> Result<(), String> {
    match passphrase {
        Some(p) => restore_attachments(&app, Unlock::Passphrase(&p), KeepExisting::Yes),
        None => {
            let key = keychain::read_key()?;
            restore_attachments(&app, Unlock::Key(&key), KeepExisting::Yes)
        }
    }
}

/// Verifies a passphrase against the vault WITHOUT writing `soma.db`. Used on an
/// unclean-exit relaunch where a newer plaintext database already exists (a
/// crash left it behind): the user re-enters the passphrase so the session can
/// re-lock on the next clean exit, but the stale vault must NOT overwrite the
/// newer live data. A wrong passphrase fails the AES-GCM auth tag.
#[tauri::command]
pub fn vault_verify_passphrase(app: tauri::AppHandle, passphrase: String) -> Result<(), String> {
    let raw = fs::read(vault_path(&app)?).map_err(|e| format!("read vault: {e}"))?;
    let header = format::parse_header(&raw)?;
    let key = format::derive_key_for_header(&passphrase, &header)?;
    format::decrypt_snapshot(&raw, &header, &key)?;
    Ok(())
}

// ── lock (clean exit) ─────────────────────────────────────────────────────────

fn remove_plaintext(app: &tauri::AppHandle) -> Result<(), String> {
    let cfg = config_dir(app)?;
    let _ = fs::remove_file(cfg.join(format!("{DB_FILE}-wal")));
    let _ = fs::remove_file(cfg.join(format!("{DB_FILE}-shm")));
    let db = cfg.join(DB_FILE);
    if db.exists() {
        fs::remove_file(&db).map_err(|e| format!("remove plaintext db: {e}"))?;
    }
    log::info!("vault: locked; no plaintext database left on disk");
    Ok(())
}

/// Encrypts the clean snapshot into the vault and removes the plaintext DB
/// (keychain mode). The frontend calls this on close, after closing its SQLite
/// connection, having first vacuumed a snapshot to `snapshot_path`.
#[tauri::command]
pub fn vault_lock_keychain(app: tauri::AppHandle, snapshot_path: String) -> Result<(), String> {
    let key = keychain::read_key()?;
    lock_with(&app, &snapshot_path, Unlock::Key(&key))
}

/// Passphrase-mode counterpart of [`vault_lock_keychain`].
#[tauri::command]
pub fn vault_lock_passphrase(
    app: tauri::AppHandle,
    snapshot_path: String,
    passphrase: String,
) -> Result<(), String> {
    lock_with(&app, &snapshot_path, Unlock::Passphrase(&passphrase))
}

/// The plaintext database is removed **last**, and only if both the database
/// vault and the attachments vault were written. An interrupted lock therefore
/// leaves a readable `soma.db` rather than a half-sealed app.
fn lock_with(app: &tauri::AppHandle, snapshot_path: &str, unlock: Unlock) -> Result<(), String> {
    log::info!("vault: locking");
    write_vault_from_snapshot(app, snapshot_path, unlock.as_source(), unlock.mode())?;
    seal_attachments(app, unlock)
        .inspect_err(|e| log::error!("vault: attachments were not sealed: {e}"))?;
    remove_plaintext(app)
}

// ── disable ───────────────────────────────────────────────────────────────────

/// Turns off encryption: removes the vault file and the keychain key. The live
/// plaintext `soma.db` (current while the app runs) simply stays as-is.
///
/// Invariant 3: any sealed attachments are decrypted back to cleartext *before*
/// the key is destroyed. Deleting the key first would leave an
/// `attachments.vault` that nothing on earth can open.
#[tauri::command]
pub fn vault_disable(app: tauri::AppHandle) -> Result<(), String> {
    if attachments_vault_path(&app)?.exists() {
        let key = keychain::read_key().map_err(|e| {
            format!(
                "Cannot turn off encryption yet: your attachments are still sealed and the key \
                 is unavailable ({e}). Unlock them first, or encryption would be turned off with \
                 those files permanently unreadable."
            )
        })?;
        restore_attachments(&app, Unlock::Key(&key), KeepExisting::Yes)?;
    }
    let vault = vault_path(&app)?;
    if vault.exists() {
        fs::remove_file(&vault).map_err(|e| format!("remove vault: {e}"))?;
    }
    keychain::delete_key()?;
    log::info!("vault: encryption disabled");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The recovery CLI resolves Soma's data directory on its own, without
    /// Tauri. If the two ever disagree, `soma-recover` would politely report
    /// that a user with a full vault has no vault at all.
    #[test]
    fn the_standalone_path_resolver_agrees_with_the_bundle_identifier() {
        let dir = paths::app_config_dir().unwrap();
        assert_eq!(dir.file_name().unwrap(), "com.soma.health");
    }

    /// Guards the file names the app and the CLI must agree on.
    #[test]
    fn file_names_are_shared_with_the_recovery_tool() {
        assert_eq!(VAULT_FILE, "soma.db.vault");
        assert_eq!(DB_FILE, "soma.db");
        assert_eq!(ATTACHMENTS_VAULT, "attachments.vault");
        assert_eq!(ATTACHMENTS_DIR, "attachments");
    }
}
