//! Where Soma keeps its data, resolved without Tauri.
//!
//! The recovery CLI has to find the same directory the app uses, but it must
//! not depend on Tauri to do it. These rules mirror Tauri v2's
//! `AppHandle::path().app_config_dir()` — `dirs::config_dir()` joined with the
//! bundle identifier — for the three desktop platforms Soma ships on. The app
//! itself still asks Tauri; this is only the outside view, and
//! `app_config_dir_matches_the_running_app` in the app crate keeps the two
//! honest.

use std::path::PathBuf;

pub const IDENTIFIER: &str = "com.soma.health";

pub const VAULT_FILE: &str = "soma.db.vault";
pub const DB_FILE: &str = "soma.db";
pub const ATTACHMENTS_DIR: &str = "attachments";
pub const ATTACHMENTS_VAULT: &str = "attachments.vault";

fn home() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .filter(|h| !h.is_empty())
        .map(PathBuf::from)
}

fn config_root() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        home().map(|h| h.join("Library").join("Application Support"))
    }
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("APPDATA")
            .filter(|v| !v.is_empty())
            .map(PathBuf::from)
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::env::var_os("XDG_CONFIG_HOME")
            .filter(|v| !v.is_empty())
            .map(PathBuf::from)
            .or_else(|| home().map(|h| h.join(".config")))
    }
}

/// The directory holding `soma.db`, `soma.db.vault` and `attachments/`.
pub fn app_config_dir() -> Result<PathBuf, String> {
    config_root()
        .map(|r| r.join(IDENTIFIER))
        .ok_or_else(|| "could not resolve the user's configuration directory".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_app_directory_is_named_after_the_bundle_identifier() {
        let dir = app_config_dir().unwrap();
        assert_eq!(dir.file_name().unwrap(), IDENTIFIER);
        assert!(dir.is_absolute());
    }
}
