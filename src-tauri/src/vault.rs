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
//! Vault file layout (`.vault`):
//! `MAGIC(8) | format_version(1) | mode(1) | salt(16) | nonce(12) | AES-256-GCM ciphertext`
//! For keychain mode the salt is random but unused (the key is the keychain
//! bytes directly); for passphrase mode the salt feeds Argon2id.
//!
//! The frontend always hands Rust a clean `VACUUM INTO` snapshot to encrypt, so
//! the vault is a consistent database image with no separate WAL to replay.

use std::fs;
use std::path::PathBuf;

use aes_gcm::aead::rand_core::RngCore;
use aes_gcm::aead::{Aead, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Nonce};
use argon2::Argon2;
use keyring::Entry;
use serde::Serialize;
use tauri::Manager;

const KEYCHAIN_SERVICE: &str = "com.soma.health";
/// Keychain entry holding the hex-encoded 32-byte data key (keychain mode only).
const KEY_USER: &str = "db-encryption-key";

const MAGIC: &[u8; 8] = b"SOMAVLT1";
const FORMAT_VERSION: u8 = 1;
const MODE_KEYCHAIN: u8 = 0;
const MODE_PASSPHRASE: u8 = 1;
const HEADER_LEN: usize = 8 + 1 + 1 + 16 + 12;
const SQLITE_MAGIC: &[u8; 16] = b"SQLite format 3\0";

const VAULT_FILE: &str = "soma.db.vault";
const DB_FILE: &str = "soma.db";
const SNAPSHOT_STAGING: &str = "vault-snapshot-staging.db";

fn key_entry() -> Result<Entry, String> {
    Entry::new(KEYCHAIN_SERVICE, KEY_USER).map_err(|e| e.to_string())
}

fn config_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_config_dir().map_err(|e| e.to_string())
}

fn vault_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(config_dir(app)?.join(VAULT_FILE))
}

fn db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(config_dir(app)?.join(DB_FILE))
}

// ── hex (avoid pulling a base64 dependency for the keychain-stored key) ──────

fn to_hex(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{b:02x}"));
    }
    s
}

fn from_hex(s: &str) -> Result<Vec<u8>, String> {
    if s.len() % 2 != 0 {
        return Err("invalid key encoding".into());
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).map_err(|e| e.to_string()))
        .collect()
}

// ── crypto ───────────────────────────────────────────────────────────────────

fn derive_key_passphrase(passphrase: &str, salt: &[u8]) -> Result<[u8; 32], String> {
    let mut key = [0u8; 32];
    Argon2::default()
        .hash_password_into(passphrase.as_bytes(), salt, &mut key)
        .map_err(|e| e.to_string())?;
    Ok(key)
}

/// Reads the keychain data key, or creates and stores a fresh random one.
fn ensure_keychain_key() -> Result<[u8; 32], String> {
    let entry = key_entry()?;
    match entry.get_password() {
        Ok(hex) => {
            let bytes = from_hex(&hex)?;
            let arr: [u8; 32] = bytes
                .try_into()
                .map_err(|_| "stored key has the wrong length".to_string())?;
            Ok(arr)
        }
        Err(keyring::Error::NoEntry) => {
            let mut key = [0u8; 32];
            OsRng.fill_bytes(&mut key);
            entry
                .set_password(&to_hex(&key))
                .map_err(|e| e.to_string())?;
            Ok(key)
        }
        Err(e) => Err(e.to_string()),
    }
}

fn read_keychain_key() -> Result<[u8; 32], String> {
    let hex = match key_entry()?.get_password() {
        Ok(h) => h,
        Err(keyring::Error::NoEntry) => return Err("No database key in the keychain".into()),
        Err(e) => return Err(e.to_string()),
    };
    from_hex(&hex)?
        .try_into()
        .map_err(|_| "stored key has the wrong length".to_string())
}

/// Encrypts a plaintext SQLite snapshot into the `.vault` byte layout. Pure over
/// its inputs apart from the random salt/nonce, so it is unit-tested without any
/// filesystem or keychain access.
fn encrypt_snapshot(plain: &[u8], key: &[u8; 32], mode: u8) -> Result<Vec<u8>, String> {
    if plain.len() < SQLITE_MAGIC.len() || &plain[..SQLITE_MAGIC.len()] != SQLITE_MAGIC {
        return Err("Snapshot is not a valid SQLite database".into());
    }
    let mut salt = [0u8; 16];
    let mut nonce = [0u8; 12];
    OsRng.fill_bytes(&mut salt);
    OsRng.fill_bytes(&mut nonce);

    let cipher = Aes256Gcm::new(key.into());
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce), plain)
        .map_err(|e| format!("encrypt: {e}"))?;

    let mut out = Vec::with_capacity(HEADER_LEN + ciphertext.len());
    out.extend_from_slice(MAGIC);
    out.push(FORMAT_VERSION);
    out.push(mode);
    out.extend_from_slice(&salt);
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

/// Parsed vault header fields needed to derive the key and decrypt.
struct Header {
    mode: u8,
    salt: [u8; 16],
    nonce: [u8; 12],
}

fn parse_header(raw: &[u8]) -> Result<Header, String> {
    if raw.len() <= HEADER_LEN || &raw[..8] != MAGIC {
        return Err("Not a Soma vault file".into());
    }
    if raw[8] != FORMAT_VERSION {
        return Err("This vault was created by a newer version of Soma".into());
    }
    let mode = raw[9];
    let salt: [u8; 16] = raw[10..26].try_into().unwrap();
    let nonce: [u8; 12] = raw[26..38].try_into().unwrap();
    Ok(Header { mode, salt, nonce })
}

/// Decrypts a `.vault` blob with an already-resolved key, asserting the result
/// is a SQLite database. A wrong key/passphrase fails the AES-GCM auth tag.
fn decrypt_snapshot(raw: &[u8], header: &Header, key: &[u8; 32]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new(key.into());
    let plain = cipher
        .decrypt(Nonce::from_slice(&header.nonce), &raw[HEADER_LEN..])
        .map_err(|_| "Wrong passphrase, or the vault is corrupted".to_string())?;
    if plain.len() < SQLITE_MAGIC.len() || &plain[..SQLITE_MAGIC.len()] != SQLITE_MAGIC {
        return Err("Decrypted data is not a SQLite database".into());
    }
    Ok(plain)
}

// ── state ─────────────────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultState {
    /// A `soma.db.vault` file exists (encryption has been enabled).
    vault_exists: bool,
    /// A plaintext `soma.db` exists (live data, or a crash left it behind).
    plaintext_exists: bool,
    /// Unlock mode read from the vault header: "keychain" | "passphrase" | null.
    mode: Option<&'static str>,
    /// The keychain data key is present (keychain mode readiness).
    keychain_key_present: bool,
}

/// Snapshot of on-disk vault state, read by the frontend startup gate to decide
/// whether (and how) to unlock before the SQLite plugin opens the database.
#[tauri::command]
pub fn vault_state(app: tauri::AppHandle) -> Result<VaultState, String> {
    let vault = vault_path(&app)?;
    let db = db_path(&app)?;
    let mode = if vault.exists() {
        match fs::read(&vault) {
            Ok(raw) => parse_header(&raw).ok().map(|h| match h.mode {
                MODE_PASSPHRASE => "passphrase",
                _ => "keychain",
            }),
            Err(_) => None,
        }
    } else {
        None
    };
    let keychain_key_present = matches!(
        key_entry().and_then(|e| match e.get_password() {
            Ok(_) => Ok(true),
            Err(keyring::Error::NoEntry) => Ok(false),
            Err(e) => Err(e.to_string()),
        }),
        Ok(true)
    );
    Ok(VaultState {
        vault_exists: vault.exists(),
        plaintext_exists: db.exists(),
        mode,
        keychain_key_present,
    })
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
    key: &[u8; 32],
    mode: u8,
) -> Result<(), String> {
    let plain = fs::read(snapshot_path).map_err(|e| format!("read snapshot: {e}"))?;
    let out = encrypt_snapshot(&plain, key, mode)?;
    let vault = vault_path(app)?;
    fs::write(&vault, &out).map_err(|e| format!("write vault: {e}"))?;
    let _ = fs::remove_file(snapshot_path);
    Ok(())
}

/// Turns on keychain-mode encryption: mints/loads the keychain key and writes an
/// initial vault from the snapshot. The app keeps running on the plaintext DB;
/// the plaintext is only removed on the next clean exit (lock).
#[tauri::command]
pub fn vault_enable_keychain(app: tauri::AppHandle, snapshot_path: String) -> Result<(), String> {
    let key = ensure_keychain_key()?;
    write_vault_from_snapshot(&app, &snapshot_path, &key, MODE_KEYCHAIN)
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
    // The per-vault Argon2 salt is generated inside encrypt_snapshot and stored
    // in the header, so derive against that exact salt by encrypting in one step.
    let mut salt = [0u8; 16];
    OsRng.fill_bytes(&mut salt);
    let key = derive_key_passphrase(&passphrase, &salt)?;
    // encrypt_snapshot makes its own salt; to keep the header/salt consistent we
    // encrypt with a key derived from that same salt. Re-implement inline:
    let plain = fs::read(&snapshot_path).map_err(|e| format!("read snapshot: {e}"))?;
    if plain.len() < SQLITE_MAGIC.len() || &plain[..SQLITE_MAGIC.len()] != SQLITE_MAGIC {
        return Err("Snapshot is not a valid SQLite database".into());
    }
    let mut nonce = [0u8; 12];
    OsRng.fill_bytes(&mut nonce);
    let cipher = Aes256Gcm::new((&key).into());
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce), plain.as_slice())
        .map_err(|e| format!("encrypt: {e}"))?;
    let mut out = Vec::with_capacity(HEADER_LEN + ciphertext.len());
    out.extend_from_slice(MAGIC);
    out.push(FORMAT_VERSION);
    out.push(MODE_PASSPHRASE);
    out.extend_from_slice(&salt);
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ciphertext);
    fs::write(vault_path(&app)?, &out).map_err(|e| format!("write vault: {e}"))?;
    let _ = fs::remove_file(&snapshot_path);
    Ok(())
}

// ── unlock (startup) ──────────────────────────────────────────────────────────

fn write_plaintext_db(app: &tauri::AppHandle, plain: &[u8]) -> Result<(), String> {
    let db = db_path(app)?;
    // A stale WAL/SHM from a previous run must not be replayed onto the fresh DB.
    let cfg = config_dir(app)?;
    let _ = fs::remove_file(cfg.join(format!("{DB_FILE}-wal")));
    let _ = fs::remove_file(cfg.join(format!("{DB_FILE}-shm")));
    fs::write(&db, plain).map_err(|e| format!("write database: {e}"))
}

/// Decrypts the vault into the live `soma.db` using the keychain key. Called at
/// startup (keychain mode) before the SQLite plugin opens the database.
#[tauri::command]
pub fn vault_unlock_keychain(app: tauri::AppHandle) -> Result<(), String> {
    let raw = fs::read(vault_path(&app)?).map_err(|e| format!("read vault: {e}"))?;
    let header = parse_header(&raw)?;
    let key = read_keychain_key()?;
    let plain = decrypt_snapshot(&raw, &header, &key)?;
    write_plaintext_db(&app, &plain)
}

/// Decrypts the vault into `soma.db` using a passphrase. A wrong passphrase is
/// reported as an error the unlock screen surfaces ("wrong passphrase").
#[tauri::command]
pub fn vault_unlock_passphrase(app: tauri::AppHandle, passphrase: String) -> Result<(), String> {
    let raw = fs::read(vault_path(&app)?).map_err(|e| format!("read vault: {e}"))?;
    let header = parse_header(&raw)?;
    let key = derive_key_passphrase(&passphrase, &header.salt)?;
    let plain = decrypt_snapshot(&raw, &header, &key)?;
    write_plaintext_db(&app, &plain)
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
    Ok(())
}

/// Encrypts the clean snapshot into the vault and removes the plaintext DB
/// (keychain mode). The frontend calls this on close, after closing its SQLite
/// connection, having first vacuumed a snapshot to `snapshot_path`.
#[tauri::command]
pub fn vault_lock_keychain(app: tauri::AppHandle, snapshot_path: String) -> Result<(), String> {
    let key = read_keychain_key()?;
    write_vault_from_snapshot(&app, &snapshot_path, &key, MODE_KEYCHAIN)?;
    remove_plaintext(&app)
}

/// Passphrase-mode counterpart of [`vault_lock_keychain`].
#[tauri::command]
pub fn vault_lock_passphrase(
    app: tauri::AppHandle,
    snapshot_path: String,
    passphrase: String,
) -> Result<(), String> {
    let mut salt = [0u8; 16];
    OsRng.fill_bytes(&mut salt);
    let key = derive_key_passphrase(&passphrase, &salt)?;
    let plain = fs::read(&snapshot_path).map_err(|e| format!("read snapshot: {e}"))?;
    if plain.len() < SQLITE_MAGIC.len() || &plain[..SQLITE_MAGIC.len()] != SQLITE_MAGIC {
        return Err("Snapshot is not a valid SQLite database".into());
    }
    let mut nonce = [0u8; 12];
    OsRng.fill_bytes(&mut nonce);
    let cipher = Aes256Gcm::new((&key).into());
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce), plain.as_slice())
        .map_err(|e| format!("encrypt: {e}"))?;
    let mut out = Vec::with_capacity(HEADER_LEN + ciphertext.len());
    out.extend_from_slice(MAGIC);
    out.push(FORMAT_VERSION);
    out.push(MODE_PASSPHRASE);
    out.extend_from_slice(&salt);
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ciphertext);
    fs::write(vault_path(&app)?, &out).map_err(|e| format!("write vault: {e}"))?;
    let _ = fs::remove_file(&snapshot_path);
    remove_plaintext(&app)
}

// ── disable ───────────────────────────────────────────────────────────────────

/// Turns off encryption: removes the vault file and the keychain key. The live
/// plaintext `soma.db` (current while the app runs) simply stays as-is.
#[tauri::command]
pub fn vault_disable(app: tauri::AppHandle) -> Result<(), String> {
    let vault = vault_path(&app)?;
    if vault.exists() {
        fs::remove_file(&vault).map_err(|e| format!("remove vault: {e}"))?;
    }
    match key_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fake_snapshot() -> Vec<u8> {
        let mut v = SQLITE_MAGIC.to_vec();
        v.extend_from_slice(b"-- soma vault round-trip payload --");
        v
    }

    fn passphrase_blob(plain: &[u8], passphrase: &str) -> Vec<u8> {
        let mut salt = [7u8; 16];
        OsRng.fill_bytes(&mut salt);
        let key = derive_key_passphrase(passphrase, &salt).unwrap();
        let mut nonce = [0u8; 12];
        OsRng.fill_bytes(&mut nonce);
        let cipher = Aes256Gcm::new((&key).into());
        let ciphertext = cipher.encrypt(Nonce::from_slice(&nonce), plain).unwrap();
        let mut out = Vec::new();
        out.extend_from_slice(MAGIC);
        out.push(FORMAT_VERSION);
        out.push(MODE_PASSPHRASE);
        out.extend_from_slice(&salt);
        out.extend_from_slice(&nonce);
        out.extend_from_slice(&ciphertext);
        out
    }

    #[test]
    fn hex_round_trips() {
        let bytes = [0u8, 1, 15, 16, 255, 128, 64];
        assert_eq!(from_hex(&to_hex(&bytes)).unwrap(), bytes);
    }

    #[test]
    fn keychain_mode_round_trips() {
        let key = [42u8; 32];
        let plain = fake_snapshot();
        let blob = encrypt_snapshot(&plain, &key, MODE_KEYCHAIN).unwrap();
        let header = parse_header(&blob).unwrap();
        assert_eq!(header.mode, MODE_KEYCHAIN);
        let restored = decrypt_snapshot(&blob, &header, &key).unwrap();
        assert_eq!(restored, plain);
    }

    #[test]
    fn passphrase_mode_round_trips() {
        let plain = fake_snapshot();
        let blob = passphrase_blob(&plain, "correct horse battery staple");
        let header = parse_header(&blob).unwrap();
        assert_eq!(header.mode, MODE_PASSPHRASE);
        let key = derive_key_passphrase("correct horse battery staple", &header.salt).unwrap();
        let restored = decrypt_snapshot(&blob, &header, &key).unwrap();
        assert_eq!(restored, plain);
    }

    #[test]
    fn wrong_passphrase_is_rejected() {
        let blob = passphrase_blob(&fake_snapshot(), "right-passphrase");
        let header = parse_header(&blob).unwrap();
        let key = derive_key_passphrase("wrong-passphrase", &header.salt).unwrap();
        assert!(decrypt_snapshot(&blob, &header, &key).is_err());
    }

    #[test]
    fn tampered_ciphertext_fails_authentication() {
        let key = [9u8; 32];
        let mut blob = encrypt_snapshot(&fake_snapshot(), &key, MODE_KEYCHAIN).unwrap();
        let last = blob.len() - 1;
        blob[last] ^= 0xFF;
        let header = parse_header(&blob).unwrap();
        assert!(decrypt_snapshot(&blob, &header, &key).is_err());
    }

    #[test]
    fn refuses_to_encrypt_non_sqlite_input() {
        let key = [1u8; 32];
        let err = encrypt_snapshot(b"not a database", &key, MODE_KEYCHAIN).unwrap_err();
        assert!(err.contains("SQLite"));
    }

    #[test]
    fn rejects_a_file_without_the_vault_magic() {
        let err = parse_header(b"definitely not a soma vault, just random bytes here").unwrap_err();
        assert!(err.contains("vault"));
    }

    #[test]
    fn fresh_salt_and_nonce_per_encryption() {
        let key = [3u8; 32];
        let a = encrypt_snapshot(&fake_snapshot(), &key, MODE_KEYCHAIN).unwrap();
        let b = encrypt_snapshot(&fake_snapshot(), &key, MODE_KEYCHAIN).unwrap();
        assert_ne!(a[10..HEADER_LEN], b[10..HEADER_LEN]);
        assert_ne!(a[HEADER_LEN..], b[HEADER_LEN..]);
    }
}
