//! The OS-keychain side of keychain-mode vaults.
//!
//! Keychain mode stores a random 32-byte data key as hex under
//! `com.soma.health / db-encryption-key`. The distinction this module exists to
//! preserve is between **absent** and **unreadable**:
//!
//! - absent (`KeyStatus::Missing`) — encryption was never enabled, or the key
//!   was deleted. There is nothing to recover with.
//! - unreadable (`KeyStatus::Unavailable`) — the key is *there* and the OS
//!   refused to hand it over. On macOS this is the routine consequence of Soma
//!   being ad-hoc signed: the keychain ACL is bound to the code signature, and
//!   every rebuild produces a different signature, so a freshly installed
//!   update is a stranger to its own key.
//!
//! Collapsing those two into one boolean is what let a recoverable situation
//! look like a first run. They stay separate all the way to the UI.

use keyring::Entry;

pub const SERVICE: &str = "com.soma.health";
/// Keychain entry holding the hex-encoded 32-byte data key (keychain mode only).
pub const KEY_USER: &str = "db-encryption-key";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum KeyStatus {
    /// The key was read successfully.
    Present,
    /// The keychain answered, and there is no such entry.
    Missing,
    /// The keychain refused. The key may well still be there.
    Unavailable(String),
}

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, KEY_USER).map_err(|e| e.to_string())
}

/// Read-only status probe. Never creates anything.
pub fn status() -> KeyStatus {
    let entry = match entry() {
        Ok(e) => e,
        Err(e) => return KeyStatus::Unavailable(e),
    };
    match entry.get_password() {
        Ok(_) => KeyStatus::Present,
        Err(keyring::Error::NoEntry) => KeyStatus::Missing,
        Err(e) => KeyStatus::Unavailable(e.to_string()),
    }
}

/// Reads the 32-byte data key. The error text distinguishes "no key" from "the
/// OS would not give it to us", because only the second one is worth retrying.
pub fn read_key() -> Result<[u8; 32], String> {
    let hex = match entry()?.get_password() {
        Ok(h) => h,
        Err(keyring::Error::NoEntry) => {
            return Err("No database key in the keychain".into());
        }
        Err(e) => {
            return Err(format!(
                "The keychain refused to release the database key: {e}"
            ))
        }
    };
    parse_key(&hex)
}

/// Reads the key, or mints and stores a fresh random one. Only ever called when
/// *enabling* encryption — never on the unlock path, where silently minting a
/// new key would turn "we can't read your key" into "your vault is now junk".
pub fn ensure_key(fresh: [u8; 32]) -> Result<[u8; 32], String> {
    let entry = entry()?;
    match entry.get_password() {
        Ok(hex) => parse_key(&hex),
        Err(keyring::Error::NoEntry) => {
            entry
                .set_password(&to_hex(&fresh))
                .map_err(|e| e.to_string())?;
            Ok(fresh)
        }
        Err(e) => Err(e.to_string()),
    }
}

pub fn delete_key() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Parses the hex form the key is stored (and passed on the CLI) in.
pub fn parse_key(hex: &str) -> Result<[u8; 32], String> {
    let bytes = from_hex(hex.trim())?;
    bytes
        .try_into()
        .map_err(|_| "the key must be exactly 32 bytes (64 hex characters)".to_string())
}

// ── hex (avoid pulling a base64 dependency for the keychain-stored key) ──────

pub fn to_hex(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{b:02x}"));
    }
    s
}

pub fn from_hex(s: &str) -> Result<Vec<u8>, String> {
    if s.is_empty() || s.len() % 2 != 0 {
        return Err("invalid key encoding: expected an even number of hex characters".into());
    }
    (0..s.len())
        .step_by(2)
        .map(|i| {
            u8::from_str_radix(&s[i..i + 2], 16)
                .map_err(|_| "invalid key encoding: not hexadecimal".to_string())
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hex_round_trips() {
        let bytes = [0u8, 1, 15, 16, 255, 128, 64];
        assert_eq!(from_hex(&to_hex(&bytes)).unwrap(), bytes);
    }

    #[test]
    fn rejects_malformed_hex() {
        assert!(from_hex("abc").is_err());
        assert!(from_hex("zz").is_err());
        assert!(from_hex("").is_err());
    }

    #[test]
    fn parses_a_64_character_key_and_rejects_other_lengths() {
        let key = [7u8; 32];
        assert_eq!(parse_key(&to_hex(&key)).unwrap(), key);
        assert_eq!(parse_key(&format!("  {}\n", to_hex(&key))).unwrap(), key);
        assert!(parse_key(&to_hex(&[7u8; 16])).unwrap_err().contains("32"));
    }
}
