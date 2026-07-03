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
//! Vault file layout (`.vault`, format v2):
//! `MAGIC(8) | format_version(1) | mode(1) | argon2 m_cost/t_cost/p_cost (3 × u32 LE) | salt(16) | nonce(12) | AES-256-GCM ciphertext`
//! For keychain mode the salt is random but unused (the key is the keychain
//! bytes directly); for passphrase mode the salt feeds Argon2id. v1 files lack
//! the Argon2 parameter fields and are still read, using the pinned legacy
//! parameters in [`crate::kdf`].
//!
//! The frontend always hands Rust a clean `VACUUM INTO` snapshot to encrypt, so
//! the vault is a consistent database image with no separate WAL to replay.

use std::fs;
use std::path::PathBuf;

use aes_gcm::aead::rand_core::RngCore;
use aes_gcm::aead::{Aead, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Nonce};
use keyring::Entry;
use serde::Serialize;
use tauri::Manager;

use crate::fsutil::atomic_write;
use crate::kdf;

const KEYCHAIN_SERVICE: &str = "com.soma.health";
/// Keychain entry holding the hex-encoded 32-byte data key (keychain mode only).
const KEY_USER: &str = "db-encryption-key";

const MAGIC: &[u8; 8] = b"SOMAVLT1";
/// Current on-disk format. v1 had no Argon2 parameter fields (it relied on the
/// crate default); v2 stores m/t/p so a future argon2 default change can't
/// orphan a file. v1 files are still read, keyed with the pinned legacy params.
const FORMAT_VERSION: u8 = 2;
const MODE_KEYCHAIN: u8 = 0;
const MODE_PASSPHRASE: u8 = 1;
/// v1: MAGIC(8) | version(1) | mode(1) | salt(16) | nonce(12).
const HEADER_LEN_V1: usize = 8 + 1 + 1 + 16 + 12;
/// v2: adds m_cost/t_cost/p_cost (3 × u32 LE) between mode and salt.
const HEADER_LEN_V2: usize = 8 + 1 + 1 + 12 + 16 + 12;
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

/// Argon2id cost parameters carried in a v2 header (pinned legacy values for v1).
#[derive(Clone, Copy)]
struct KdfParams {
    m_cost: u32,
    t_cost: u32,
    p_cost: u32,
}

impl KdfParams {
    /// The parameters v1 files were (implicitly) written with; also what new
    /// files are written with today.
    const PINNED: KdfParams = KdfParams {
        m_cost: kdf::M_COST_KIB,
        t_cost: kdf::T_COST,
        p_cost: kdf::P_COST,
    };
}

/// How the AES key is obtained when writing a vault.
enum KeySource<'a> {
    /// Keychain mode: the 32-byte key is used directly (the salt is unused).
    Raw(&'a [u8; 32]),
    /// Passphrase mode: the key is derived from the passphrase and the header
    /// salt via Argon2id with the pinned parameters.
    Passphrase(&'a str),
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

/// Encrypts a plaintext SQLite snapshot into the current (v2) `.vault` byte
/// layout. Pure over its inputs apart from the random salt/nonce, so it is
/// unit-tested without any filesystem or keychain access.
fn encrypt_snapshot(plain: &[u8], source: KeySource, mode: u8) -> Result<Vec<u8>, String> {
    if plain.len() < SQLITE_MAGIC.len() || &plain[..SQLITE_MAGIC.len()] != SQLITE_MAGIC {
        return Err("Snapshot is not a valid SQLite database".into());
    }
    let mut salt = [0u8; 16];
    let mut nonce = [0u8; 12];
    OsRng.fill_bytes(&mut salt);
    OsRng.fill_bytes(&mut nonce);

    let params = KdfParams::PINNED;
    let key: [u8; 32] = match source {
        KeySource::Raw(k) => *k,
        KeySource::Passphrase(p) => kdf::derive_key_pinned(p, &salt)?,
    };

    let cipher = Aes256Gcm::new((&key).into());
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce), plain)
        .map_err(|e| format!("encrypt: {e}"))?;

    let mut out = Vec::with_capacity(HEADER_LEN_V2 + ciphertext.len());
    out.extend_from_slice(MAGIC);
    out.push(FORMAT_VERSION);
    out.push(mode);
    out.extend_from_slice(&params.m_cost.to_le_bytes());
    out.extend_from_slice(&params.t_cost.to_le_bytes());
    out.extend_from_slice(&params.p_cost.to_le_bytes());
    out.extend_from_slice(&salt);
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

/// Parsed vault header fields needed to derive the key and decrypt.
#[derive(Debug)]
struct Header {
    mode: u8,
    m_cost: u32,
    t_cost: u32,
    p_cost: u32,
    salt: [u8; 16],
    nonce: [u8; 12],
    /// Byte offset where the ciphertext starts (differs between v1 and v2).
    body_offset: usize,
}

fn parse_header(raw: &[u8]) -> Result<Header, String> {
    if raw.len() < 10 || &raw[..8] != MAGIC {
        return Err("Not a Soma vault file".into());
    }
    let mode = raw[9];
    match raw[8] {
        1 => {
            if raw.len() <= HEADER_LEN_V1 {
                return Err("Not a Soma vault file".into());
            }
            let salt: [u8; 16] = raw[10..26].try_into().unwrap();
            let nonce: [u8; 12] = raw[26..38].try_into().unwrap();
            Ok(Header {
                mode,
                m_cost: KdfParams::PINNED.m_cost,
                t_cost: KdfParams::PINNED.t_cost,
                p_cost: KdfParams::PINNED.p_cost,
                salt,
                nonce,
                body_offset: HEADER_LEN_V1,
            })
        }
        2 => {
            if raw.len() <= HEADER_LEN_V2 {
                return Err("Not a Soma vault file".into());
            }
            let m_cost = u32::from_le_bytes(raw[10..14].try_into().unwrap());
            let t_cost = u32::from_le_bytes(raw[14..18].try_into().unwrap());
            let p_cost = u32::from_le_bytes(raw[18..22].try_into().unwrap());
            kdf::validate_params(m_cost, t_cost, p_cost)?;
            let salt: [u8; 16] = raw[22..38].try_into().unwrap();
            let nonce: [u8; 12] = raw[38..50].try_into().unwrap();
            Ok(Header {
                mode,
                m_cost,
                t_cost,
                p_cost,
                salt,
                nonce,
                body_offset: HEADER_LEN_V2,
            })
        }
        _ => Err("This vault was created by a newer version of Soma".into()),
    }
}

/// Resolves the passphrase-mode key against a parsed header, honoring its
/// Argon2 parameters (pinned legacy values for a v1 file, header values for v2).
fn derive_key_for_header(passphrase: &str, header: &Header) -> Result<[u8; 32], String> {
    kdf::derive_key(
        passphrase,
        &header.salt,
        header.m_cost,
        header.t_cost,
        header.p_cost,
    )
}

/// Decrypts a `.vault` blob with an already-resolved key, asserting the result
/// is a SQLite database. A wrong key/passphrase fails the AES-GCM auth tag.
fn decrypt_snapshot(raw: &[u8], header: &Header, key: &[u8; 32]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new(key.into());
    let plain = cipher
        .decrypt(Nonce::from_slice(&header.nonce), &raw[header.body_offset..])
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
    source: KeySource,
    mode: u8,
) -> Result<(), String> {
    let plain = fs::read(snapshot_path).map_err(|e| format!("read snapshot: {e}"))?;
    let out = encrypt_snapshot(&plain, source, mode)?;
    // Atomic write: the plaintext DB is only removed by the caller after this
    // returns, so a crash mid-write can never leave a truncated vault AND no
    // plaintext. The old vault survives until the new one is durably in place.
    atomic_write(&vault_path(app)?, &out)?;
    let _ = fs::remove_file(snapshot_path);
    Ok(())
}

/// Turns on keychain-mode encryption: mints/loads the keychain key and writes an
/// initial vault from the snapshot. The app keeps running on the plaintext DB;
/// the plaintext is only removed on the next clean exit (lock).
#[tauri::command]
pub fn vault_enable_keychain(app: tauri::AppHandle, snapshot_path: String) -> Result<(), String> {
    let key = ensure_keychain_key()?;
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
    write_vault_from_snapshot(
        &app,
        &snapshot_path,
        KeySource::Passphrase(&passphrase),
        MODE_PASSPHRASE,
    )
}

// ── unlock (startup) ──────────────────────────────────────────────────────────

fn write_plaintext_db(app: &tauri::AppHandle, plain: &[u8]) -> Result<(), String> {
    let db = db_path(app)?;
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
    let key = derive_key_for_header(&passphrase, &header)?;
    let plain = decrypt_snapshot(&raw, &header, &key)?;
    write_plaintext_db(&app, &plain)
}

/// Verifies a passphrase against the vault WITHOUT writing `soma.db`. Used on an
/// unclean-exit relaunch where a newer plaintext database already exists (a
/// crash left it behind): the user re-enters the passphrase so the session can
/// re-lock on the next clean exit, but the stale vault must NOT overwrite the
/// newer live data. A wrong passphrase fails the AES-GCM auth tag.
#[tauri::command]
pub fn vault_verify_passphrase(app: tauri::AppHandle, passphrase: String) -> Result<(), String> {
    let raw = fs::read(vault_path(&app)?).map_err(|e| format!("read vault: {e}"))?;
    let header = parse_header(&raw)?;
    let key = derive_key_for_header(&passphrase, &header)?;
    decrypt_snapshot(&raw, &header, &key)?;
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
    Ok(())
}

/// Encrypts the clean snapshot into the vault and removes the plaintext DB
/// (keychain mode). The frontend calls this on close, after closing its SQLite
/// connection, having first vacuumed a snapshot to `snapshot_path`.
#[tauri::command]
pub fn vault_lock_keychain(app: tauri::AppHandle, snapshot_path: String) -> Result<(), String> {
    let key = read_keychain_key()?;
    write_vault_from_snapshot(&app, &snapshot_path, KeySource::Raw(&key), MODE_KEYCHAIN)?;
    remove_plaintext(&app)
}

/// Passphrase-mode counterpart of [`vault_lock_keychain`].
#[tauri::command]
pub fn vault_lock_passphrase(
    app: tauri::AppHandle,
    snapshot_path: String,
    passphrase: String,
) -> Result<(), String> {
    write_vault_from_snapshot(
        &app,
        &snapshot_path,
        KeySource::Passphrase(&passphrase),
        MODE_PASSPHRASE,
    )?;
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

    /// Builds a legacy v1 blob (no Argon2 params in the header) the way pre-v2
    /// builds did, to prove such files still decrypt under the pinned params.
    fn v1_passphrase_blob(plain: &[u8], passphrase: &str) -> Vec<u8> {
        let mut salt = [0u8; 16];
        OsRng.fill_bytes(&mut salt);
        let key = kdf::derive_key_pinned(passphrase, &salt).unwrap();
        let mut nonce = [0u8; 12];
        OsRng.fill_bytes(&mut nonce);
        let cipher = Aes256Gcm::new((&key).into());
        let ciphertext = cipher.encrypt(Nonce::from_slice(&nonce), plain).unwrap();
        let mut out = Vec::new();
        out.extend_from_slice(MAGIC);
        out.push(1); // v1
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
        let blob = encrypt_snapshot(&plain, KeySource::Raw(&key), MODE_KEYCHAIN).unwrap();
        assert_eq!(blob[8], FORMAT_VERSION);
        let header = parse_header(&blob).unwrap();
        assert_eq!(header.mode, MODE_KEYCHAIN);
        let restored = decrypt_snapshot(&blob, &header, &key).unwrap();
        assert_eq!(restored, plain);
    }

    #[test]
    fn passphrase_mode_round_trips() {
        let plain = fake_snapshot();
        let pass = "correct horse battery staple";
        let blob = encrypt_snapshot(&plain, KeySource::Passphrase(pass), MODE_PASSPHRASE).unwrap();
        let header = parse_header(&blob).unwrap();
        assert_eq!(header.mode, MODE_PASSPHRASE);
        let key = derive_key_for_header(pass, &header).unwrap();
        let restored = decrypt_snapshot(&blob, &header, &key).unwrap();
        assert_eq!(restored, plain);
    }

    #[test]
    fn wrong_passphrase_is_rejected() {
        let blob = encrypt_snapshot(
            &fake_snapshot(),
            KeySource::Passphrase("right"),
            MODE_PASSPHRASE,
        )
        .unwrap();
        let header = parse_header(&blob).unwrap();
        let key = derive_key_for_header("wrong", &header).unwrap();
        assert!(decrypt_snapshot(&blob, &header, &key).is_err());
    }

    /// A v1 file (written before params were stored in the header) must still
    /// decrypt — the whole point of pinning the legacy Argon2 parameters.
    #[test]
    fn legacy_v1_file_still_decrypts() {
        let plain = fake_snapshot();
        let pass = "an old vault from before v2";
        let blob = v1_passphrase_blob(&plain, pass);
        let header = parse_header(&blob).unwrap();
        assert_eq!(header.body_offset, HEADER_LEN_V1);
        let key = derive_key_for_header(pass, &header).unwrap();
        let restored = decrypt_snapshot(&blob, &header, &key).unwrap();
        assert_eq!(restored, plain);
    }

    /// A v2 header carrying corrupt Argon2 parameters is rejected rather than
    /// attempting an absurd derivation.
    #[test]
    fn corrupt_v2_params_are_rejected() {
        let mut blob = encrypt_snapshot(
            &fake_snapshot(),
            KeySource::Passphrase("x"),
            MODE_PASSPHRASE,
        )
        .unwrap();
        // Zero out the m_cost field (bytes 10..14) — below the valid range.
        blob[10..14].copy_from_slice(&0u32.to_le_bytes());
        assert!(parse_header(&blob).is_err());
    }

    #[test]
    fn tampered_ciphertext_fails_authentication() {
        let key = [9u8; 32];
        let mut blob =
            encrypt_snapshot(&fake_snapshot(), KeySource::Raw(&key), MODE_KEYCHAIN).unwrap();
        let last = blob.len() - 1;
        blob[last] ^= 0xFF;
        let header = parse_header(&blob).unwrap();
        assert!(decrypt_snapshot(&blob, &header, &key).is_err());
    }

    #[test]
    fn refuses_to_encrypt_non_sqlite_input() {
        let key = [1u8; 32];
        let err =
            encrypt_snapshot(b"not a database", KeySource::Raw(&key), MODE_KEYCHAIN).unwrap_err();
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
        let a = encrypt_snapshot(&fake_snapshot(), KeySource::Raw(&key), MODE_KEYCHAIN).unwrap();
        let b = encrypt_snapshot(&fake_snapshot(), KeySource::Raw(&key), MODE_KEYCHAIN).unwrap();
        // The salt+nonce region (after the fixed params) must differ each time.
        assert_ne!(a[22..HEADER_LEN_V2], b[22..HEADER_LEN_V2]);
        assert_ne!(a[HEADER_LEN_V2..], b[HEADER_LEN_V2..]);
    }
}
