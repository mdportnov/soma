//! Argon2id key derivation with parameters pinned in code.
//!
//! Both the vault (`vault.rs`) and backup (`backup.rs`) formats derive their
//! AES key from a passphrase with Argon2id. The argon2 crate's defaults can
//! change between releases, which would silently make every existing file
//! undecryptable, so the parameters are pinned here. Format-v1 files carry no
//! parameters in their header and depend on these exact values forever;
//! format-v2 files store the parameters they were written with in the header.

use argon2::{Algorithm, Argon2, Params, Version};

/// Pinned to `Params::DEFAULT` of argon2 0.5 (19 MiB, 2 passes, 1 lane).
/// v1 files were written with these then-implicit defaults, so they must never
/// change; to tune the cost for new files, add new write-time constants and
/// keep these as the legacy pins.
pub const M_COST_KIB: u32 = 19_456;
pub const T_COST: u32 = 2;
pub const P_COST: u32 = 1;

/// Sanity bounds for parameters read from a v2 header: generous enough for any
/// future tuning, tight enough that a corrupt header cannot demand gigabytes
/// of memory or hours of hashing.
const M_COST_RANGE: std::ops::RangeInclusive<u32> = 8..=4_000_000;
const T_COST_RANGE: std::ops::RangeInclusive<u32> = 1..=64;
const P_COST_RANGE: std::ops::RangeInclusive<u32> = 1..=64;

pub fn validate_params(m_cost: u32, t_cost: u32, p_cost: u32) -> Result<(), String> {
    if !M_COST_RANGE.contains(&m_cost)
        || !T_COST_RANGE.contains(&t_cost)
        || !P_COST_RANGE.contains(&p_cost)
    {
        return Err(format!(
            "Invalid key-derivation parameters in the file header (m={m_cost} KiB, t={t_cost}, p={p_cost}) — the file is corrupted"
        ));
    }
    Ok(())
}

pub fn derive_key(
    passphrase: &str,
    salt: &[u8],
    m_cost: u32,
    t_cost: u32,
    p_cost: u32,
) -> Result<[u8; 32], String> {
    let params = Params::new(m_cost, t_cost, p_cost, Some(32)).map_err(|e| e.to_string())?;
    let mut key = [0u8; 32];
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(passphrase.as_bytes(), salt, &mut key)
        .map_err(|e| e.to_string())?;
    Ok(key)
}

/// Derives with the pinned parameters — the write path for new files.
pub fn derive_key_pinned(passphrase: &str, salt: &[u8]) -> Result<[u8; 32], String> {
    derive_key(passphrase, salt, M_COST_KIB, T_COST, P_COST)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// v1 files were written with `Argon2::default()`, so the pins are only
    /// correct if they equal the crate defaults for the version in Cargo.lock.
    /// If this fails after an argon2 upgrade, do NOT change the pinned
    /// constants — v1 files depend on them; introduce separate write-time
    /// constants instead.
    #[test]
    fn pinned_params_match_the_crate_defaults_v1_files_were_written_with() {
        assert_eq!(Params::DEFAULT.m_cost(), M_COST_KIB);
        assert_eq!(Params::DEFAULT.t_cost(), T_COST);
        assert_eq!(Params::DEFAULT.p_cost(), P_COST);
    }

    #[test]
    fn pinned_derivation_matches_the_legacy_default_derivation() {
        let salt = [5u8; 16];
        let mut legacy = [0u8; 32];
        Argon2::default()
            .hash_password_into(b"pass1234", &salt, &mut legacy)
            .unwrap();
        assert_eq!(derive_key_pinned("pass1234", &salt).unwrap(), legacy);
    }

    #[test]
    fn absurd_params_are_rejected() {
        assert!(validate_params(u32::MAX, 2, 1).is_err());
        assert!(validate_params(0, 2, 1).is_err());
        assert!(validate_params(19_456, 0, 1).is_err());
        assert!(validate_params(19_456, 65, 1).is_err());
        assert!(validate_params(19_456, 2, 0).is_err());
        assert!(validate_params(19_456, 2, 1000).is_err());
        assert!(validate_params(M_COST_KIB, T_COST, P_COST).is_ok());
    }
}
