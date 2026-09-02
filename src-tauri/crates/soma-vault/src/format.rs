//! The `.vault` container format — the **single** implementation.
//!
//! Both the running app (`soma_lib::vault`) and the offline recovery CLI
//! (`soma-recover`) parse and produce vault bytes through this module. A second
//! parser written "just for recovery" is how a rescue tool ends up disagreeing
//! with the writer at the worst possible moment, so there isn't one.
//!
//! Layout (format v2):
//! `MAGIC(8) | format_version(1) | mode(1) | argon2 m/t/p (3 × u32 LE) | salt(16) | nonce(12) | AES-256-GCM ciphertext`
//!
//! In keychain mode the salt is random but unused (the keychain bytes *are* the
//! key); in passphrase mode the salt feeds Argon2id. Format v1 files lack the
//! Argon2 parameter fields and are read with the pinned legacy parameters in
//! [`crate::kdf`].
//!
//! The plaintext is either a raw SQLite image (`soma.db.vault`) or a
//! [`crate::archive`] of the attachment files (`attachments.vault`); the header
//! does not distinguish them, so the caller says which it expects — or uses
//! [`Payload::detect`] when it does not care.

use aes_gcm::aead::{Aead, Generate, KeyInit};
use aes_gcm::Aes256Gcm;

use crate::archive;
use crate::kdf;

pub const MAGIC: &[u8; 8] = b"SOMAVLT1";
/// Current on-disk format. v1 had no Argon2 parameter fields (it relied on the
/// crate default); v2 stores m/t/p so a future argon2 default change can't
/// orphan a file. v1 files are still read, keyed with the pinned legacy params.
pub const FORMAT_VERSION: u8 = 2;
pub const MODE_KEYCHAIN: u8 = 0;
pub const MODE_PASSPHRASE: u8 = 1;
/// v1: MAGIC(8) | version(1) | mode(1) | salt(16) | nonce(12).
pub const HEADER_LEN_V1: usize = 8 + 1 + 1 + 16 + 12;
/// v2: adds m_cost/t_cost/p_cost (3 × u32 LE) between mode and salt.
pub const HEADER_LEN_V2: usize = 8 + 1 + 1 + 12 + 16 + 12;
pub const SQLITE_MAGIC: &[u8; 16] = b"SQLite format 3\0";

/// Everything that can go wrong reading a vault, kept as distinct variants so
/// callers can act on the difference — the startup gate must tell "this is not
/// a vault at all" from "this is your vault and the key is wrong", and only the
/// second one is a reason to stop the app and ask for help.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum VaultError {
    /// The file does not carry the Soma vault magic.
    NotAVault,
    /// A vault written by a newer Soma than this build understands.
    NewerFormat(u8),
    /// Magic matched but the header is truncated or its fields are nonsense.
    CorruptHeader(String),
    /// AES-GCM authentication failed: wrong key/passphrase, or damaged bytes.
    WrongKey {
        mode: u8,
    },
    /// Decrypted fine, but the plaintext is not the payload the caller wanted.
    UnexpectedPayload(&'static str),
    /// Key derivation failed (bad Argon2 parameters).
    Kdf(String),
    /// The keychain refused or has no entry — see [`crate::keychain`].
    Keychain(String),
    Io(String),
}

impl std::fmt::Display for VaultError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotAVault => write!(f, "This file is not a Soma vault"),
            Self::NewerFormat(v) => write!(
                f,
                "This vault was created by a newer version of Soma (format v{v}) — update Soma to open it"
            ),
            Self::CorruptHeader(d) => write!(f, "The vault header is damaged: {d}"),
            Self::WrongKey { mode } if *mode == MODE_PASSPHRASE => write!(
                f,
                "Wrong passphrase, or the vault is damaged — the contents did not authenticate"
            ),
            Self::WrongKey { .. } => write!(
                f,
                "This key does not open this vault, or the vault is damaged — the contents did not authenticate"
            ),
            Self::UnexpectedPayload(what) => {
                write!(f, "The vault opened, but its contents are not {what}")
            }
            Self::Kdf(d) => write!(f, "Key derivation failed: {d}"),
            Self::Keychain(d) => write!(f, "{d}"),
            Self::Io(d) => write!(f, "{d}"),
        }
    }
}

impl std::error::Error for VaultError {}

/// Bridges to the `Result<_, String>` convention the Tauri commands use.
impl From<VaultError> for String {
    fn from(e: VaultError) -> String {
        e.to_string()
    }
}

pub type Result<T> = std::result::Result<T, VaultError>;

/// Argon2id cost parameters carried in a v2 header (pinned legacy values for v1).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct KdfParams {
    pub m_cost: u32,
    pub t_cost: u32,
    pub p_cost: u32,
}

impl KdfParams {
    /// The parameters v1 files were (implicitly) written with; also what new
    /// files are written with today.
    pub const PINNED: KdfParams = KdfParams {
        m_cost: kdf::M_COST_KIB,
        t_cost: kdf::T_COST,
        p_cost: kdf::P_COST,
    };
}

/// How the AES key is obtained when writing a vault.
pub enum KeySource<'a> {
    /// Keychain mode: the 32-byte key is used directly (the salt is unused).
    Raw(&'a [u8; 32]),
    /// Passphrase mode: the key is derived from the passphrase and the header
    /// salt via Argon2id with the pinned parameters.
    Passphrase(&'a str),
}

/// Parsed vault header fields needed to derive the key and decrypt.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Header {
    pub format_version: u8,
    pub mode: u8,
    pub params: KdfParams,
    pub salt: [u8; 16],
    pub nonce: [u8; 12],
    /// Byte offset where the ciphertext starts (differs between v1 and v2).
    pub body_offset: usize,
}

impl Header {
    /// "keychain" | "passphrase" — an unknown byte is reported as keychain,
    /// matching the writer, which only ever emits the two known values.
    pub fn mode_name(&self) -> &'static str {
        if self.mode == MODE_PASSPHRASE {
            "passphrase"
        } else {
            "keychain"
        }
    }
}

pub fn parse_header(raw: &[u8]) -> Result<Header> {
    if raw.len() < 10 || &raw[..8] != MAGIC {
        return Err(VaultError::NotAVault);
    }
    let mode = raw[9];
    match raw[8] {
        1 => {
            if raw.len() <= HEADER_LEN_V1 {
                return Err(VaultError::CorruptHeader("the file is truncated".into()));
            }
            Ok(Header {
                format_version: 1,
                mode,
                params: KdfParams::PINNED,
                salt: raw[10..26].try_into().unwrap(),
                nonce: raw[26..38].try_into().unwrap(),
                body_offset: HEADER_LEN_V1,
            })
        }
        2 => {
            if raw.len() <= HEADER_LEN_V2 {
                return Err(VaultError::CorruptHeader("the file is truncated".into()));
            }
            let m_cost = u32::from_le_bytes(raw[10..14].try_into().unwrap());
            let t_cost = u32::from_le_bytes(raw[14..18].try_into().unwrap());
            let p_cost = u32::from_le_bytes(raw[18..22].try_into().unwrap());
            kdf::validate_params(m_cost, t_cost, p_cost).map_err(VaultError::CorruptHeader)?;
            Ok(Header {
                format_version: 2,
                mode,
                params: KdfParams {
                    m_cost,
                    t_cost,
                    p_cost,
                },
                salt: raw[22..38].try_into().unwrap(),
                nonce: raw[38..50].try_into().unwrap(),
                body_offset: HEADER_LEN_V2,
            })
        }
        v => Err(VaultError::NewerFormat(v)),
    }
}

/// Resolves the passphrase-mode key against a parsed header, honoring its
/// Argon2 parameters (pinned legacy values for a v1 file, header values for v2).
pub fn derive_key_for_header(passphrase: &str, header: &Header) -> Result<[u8; 32]> {
    kdf::derive_key(
        passphrase,
        &header.salt,
        header.params.m_cost,
        header.params.t_cost,
        header.params.p_cost,
    )
    .map_err(VaultError::Kdf)
}

/// Encrypts arbitrary bytes into the current (v2) `.vault` byte layout. Pure
/// over its inputs apart from the random salt/nonce, so it is unit-tested
/// without any filesystem or keychain access. Used for both the database
/// snapshot and the attachments archive (which share the key/format).
pub fn seal(plain: &[u8], source: KeySource, mode: u8) -> Result<Vec<u8>> {
    let salt = <[u8; 16]>::generate();
    let nonce = <[u8; 12]>::generate();

    let params = KdfParams::PINNED;
    let key: [u8; 32] = match source {
        KeySource::Raw(k) => *k,
        KeySource::Passphrase(p) => kdf::derive_key_pinned(p, &salt).map_err(VaultError::Kdf)?,
    };

    let cipher = Aes256Gcm::new((&key).into());
    let ciphertext = cipher
        .encrypt((&nonce).into(), plain)
        .map_err(|e| VaultError::Io(format!("encrypt: {e}")))?;

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

/// True when `bytes` look like a SQLite database image.
pub fn is_sqlite(bytes: &[u8]) -> bool {
    bytes.len() >= SQLITE_MAGIC.len() && &bytes[..SQLITE_MAGIC.len()] == SQLITE_MAGIC
}

/// Seals a database snapshot, asserting it really is a SQLite image first.
pub fn encrypt_snapshot(plain: &[u8], source: KeySource, mode: u8) -> Result<Vec<u8>> {
    if !is_sqlite(plain) {
        return Err(VaultError::UnexpectedPayload("a SQLite database"));
    }
    seal(plain, source, mode)
}

/// Decrypts a sealed `.vault` blob with an already-resolved key. A wrong
/// key/passphrase fails the AES-GCM auth tag. Returns the raw plaintext without
/// asserting its shape (the caller knows whether it's a DB or an archive).
pub fn open(raw: &[u8], header: &Header, key: &[u8; 32]) -> Result<Vec<u8>> {
    let cipher = Aes256Gcm::new(key.into());
    cipher
        .decrypt((&header.nonce).into(), &raw[header.body_offset..])
        .map_err(|_| VaultError::WrongKey { mode: header.mode })
}

/// Decrypts a `.vault` blob, asserting the result is a SQLite database.
pub fn decrypt_snapshot(raw: &[u8], header: &Header, key: &[u8; 32]) -> Result<Vec<u8>> {
    let plain = open(raw, header, key)?;
    if !is_sqlite(&plain) {
        return Err(VaultError::UnexpectedPayload("a SQLite database"));
    }
    Ok(plain)
}

/// What a decrypted vault turned out to hold. Used by the recovery CLI, which
/// is handed a file and must work out for itself whether it is looking at the
/// database vault or the attachments vault.
pub enum Payload {
    Database(Vec<u8>),
    Attachments(Vec<archive::Entry>),
    /// Neither — a vault from a future Soma with a payload we don't know.
    Unknown(Vec<u8>),
}

impl Payload {
    pub fn detect(plain: Vec<u8>) -> Result<Payload> {
        if is_sqlite(&plain) {
            return Ok(Payload::Database(plain));
        }
        if archive::is_archive(&plain) {
            let entries = archive::unpack(&plain).map_err(VaultError::CorruptHeader)?;
            return Ok(Payload::Attachments(entries));
        }
        Ok(Payload::Unknown(plain))
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
        let salt = <[u8; 16]>::generate();
        let key = kdf::derive_key_pinned(passphrase, &salt).unwrap();
        let nonce = <[u8; 12]>::generate();
        let cipher = Aes256Gcm::new((&key).into());
        let ciphertext = cipher.encrypt((&nonce).into(), plain).unwrap();
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
    fn keychain_mode_round_trips() {
        let key = [42u8; 32];
        let plain = fake_snapshot();
        let blob = encrypt_snapshot(&plain, KeySource::Raw(&key), MODE_KEYCHAIN).unwrap();
        assert_eq!(blob[8], FORMAT_VERSION);
        let header = parse_header(&blob).unwrap();
        assert_eq!(header.mode, MODE_KEYCHAIN);
        assert_eq!(header.mode_name(), "keychain");
        assert_eq!(header.params, KdfParams::PINNED);
        let restored = decrypt_snapshot(&blob, &header, &key).unwrap();
        assert_eq!(restored, plain);
    }

    #[test]
    fn passphrase_mode_round_trips() {
        let plain = fake_snapshot();
        let pass = "correct horse battery staple";
        let blob = encrypt_snapshot(&plain, KeySource::Passphrase(pass), MODE_PASSPHRASE).unwrap();
        let header = parse_header(&blob).unwrap();
        assert_eq!(header.mode_name(), "passphrase");
        let key = derive_key_for_header(pass, &header).unwrap();
        assert_eq!(decrypt_snapshot(&blob, &header, &key).unwrap(), plain);
    }

    #[test]
    fn wrong_passphrase_is_rejected_with_a_passphrase_worded_error() {
        let blob = encrypt_snapshot(
            &fake_snapshot(),
            KeySource::Passphrase("right"),
            MODE_PASSPHRASE,
        )
        .unwrap();
        let header = parse_header(&blob).unwrap();
        let key = derive_key_for_header("wrong", &header).unwrap();
        let err = decrypt_snapshot(&blob, &header, &key).unwrap_err();
        assert_eq!(
            err,
            VaultError::WrongKey {
                mode: MODE_PASSPHRASE
            }
        );
        assert!(err.to_string().contains("Wrong passphrase"));
    }

    /// A keychain-mode vault must not tell the user to check their passphrase —
    /// there isn't one. The wording is the whole point of carrying the mode.
    #[test]
    fn wrong_keychain_key_is_rejected_with_a_key_worded_error() {
        let blob =
            encrypt_snapshot(&fake_snapshot(), KeySource::Raw(&[1u8; 32]), MODE_KEYCHAIN).unwrap();
        let header = parse_header(&blob).unwrap();
        let err = decrypt_snapshot(&blob, &header, &[2u8; 32]).unwrap_err();
        assert!(err.to_string().contains("does not open this vault"));
        assert!(!err.to_string().contains("passphrase"));
    }

    /// A v1 file (written before params were stored in the header) must still
    /// decrypt — the whole point of pinning the legacy Argon2 parameters.
    #[test]
    fn legacy_v1_file_still_decrypts() {
        let plain = fake_snapshot();
        let pass = "an old vault from before v2";
        let blob = v1_passphrase_blob(&plain, pass);
        let header = parse_header(&blob).unwrap();
        assert_eq!(header.format_version, 1);
        assert_eq!(header.body_offset, HEADER_LEN_V1);
        assert_eq!(header.params, KdfParams::PINNED);
        let key = derive_key_for_header(pass, &header).unwrap();
        assert_eq!(decrypt_snapshot(&blob, &header, &key).unwrap(), plain);
    }

    #[test]
    fn v1_and_v2_headers_are_told_apart_by_body_offset() {
        let pass = "x";
        let v1 = v1_passphrase_blob(&fake_snapshot(), pass);
        let v2 = encrypt_snapshot(
            &fake_snapshot(),
            KeySource::Passphrase(pass),
            MODE_PASSPHRASE,
        )
        .unwrap();
        assert_eq!(parse_header(&v1).unwrap().body_offset, HEADER_LEN_V1);
        assert_eq!(parse_header(&v2).unwrap().body_offset, HEADER_LEN_V2);
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
        blob[10..14].copy_from_slice(&0u32.to_le_bytes());
        assert!(matches!(
            parse_header(&blob),
            Err(VaultError::CorruptHeader(_))
        ));
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
        let err = encrypt_snapshot(b"not a database", KeySource::Raw(&[1u8; 32]), MODE_KEYCHAIN)
            .unwrap_err();
        assert_eq!(err, VaultError::UnexpectedPayload("a SQLite database"));
    }

    #[test]
    fn rejects_a_file_without_the_vault_magic() {
        assert_eq!(
            parse_header(b"definitely not a soma vault, just random bytes here").unwrap_err(),
            VaultError::NotAVault
        );
    }

    /// A future format must be named as such, not passed off as corruption —
    /// "your data is damaged" and "your app is old" call for opposite reactions.
    #[test]
    fn a_future_format_version_is_reported_as_such() {
        let mut blob =
            encrypt_snapshot(&fake_snapshot(), KeySource::Raw(&[1u8; 32]), MODE_KEYCHAIN).unwrap();
        blob[8] = 99;
        let err = parse_header(&blob).unwrap_err();
        assert_eq!(err, VaultError::NewerFormat(99));
        assert!(err.to_string().contains("newer version"));
    }

    #[test]
    fn a_truncated_vault_is_reported_as_a_damaged_header() {
        let blob =
            encrypt_snapshot(&fake_snapshot(), KeySource::Raw(&[1u8; 32]), MODE_KEYCHAIN).unwrap();
        assert!(matches!(
            parse_header(&blob[..HEADER_LEN_V2]),
            Err(VaultError::CorruptHeader(_))
        ));
    }

    #[test]
    fn fresh_salt_and_nonce_per_encryption() {
        let key = [3u8; 32];
        let a = encrypt_snapshot(&fake_snapshot(), KeySource::Raw(&key), MODE_KEYCHAIN).unwrap();
        let b = encrypt_snapshot(&fake_snapshot(), KeySource::Raw(&key), MODE_KEYCHAIN).unwrap();
        assert_ne!(a[22..HEADER_LEN_V2], b[22..HEADER_LEN_V2]);
        assert_ne!(a[HEADER_LEN_V2..], b[HEADER_LEN_V2..]);
    }

    #[test]
    fn payload_detection_tells_a_database_from_an_attachment_archive() {
        let db = Payload::detect(fake_snapshot()).unwrap();
        assert!(matches!(db, Payload::Database(_)));

        let packed = archive::pack(&[archive::Entry {
            name: "attachments/a.pdf".into(),
            data: b"%PDF-1.4".to_vec(),
        }]);
        match Payload::detect(packed).unwrap() {
            Payload::Attachments(entries) => {
                assert_eq!(entries.len(), 1);
                assert_eq!(entries[0].data, b"%PDF-1.4");
            }
            _ => panic!("expected an attachments archive"),
        }

        assert!(matches!(
            Payload::detect(b"neither of the two".to_vec()).unwrap(),
            Payload::Unknown(_)
        ));
    }
}
