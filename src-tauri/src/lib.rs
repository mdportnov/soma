mod archive;
mod backup;
mod fsutil;
mod kdf;
mod mcp;
mod transaction;
mod vault;

use keyring::Entry;

/// Keychain service name; one entry per AI provider.
const KEYCHAIN_SERVICE: &str = "com.soma.health";

fn entry_for(provider: &str) -> Result<Entry, String> {
    Entry::new(KEYCHAIN_SERVICE, &format!("ai-key-{provider}")).map_err(|e| e.to_string())
}

/// Stores an AI provider API key in the OS keychain (never in SQLite/config).
#[tauri::command]
fn keychain_set(provider: String, key: String) -> Result<(), String> {
    entry_for(&provider)?
        .set_password(&key)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn keychain_get(provider: String) -> Result<Option<String>, String> {
    match entry_for(&provider)?.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn keychain_delete(provider: String) -> Result<(), String> {
    match entry_for(&provider)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[derive(serde::Serialize)]
struct KeychainStatus {
    /// True when the OS keychain can actually store/read secrets.
    available: bool,
    /// Human-readable backend name for the UI.
    backend: &'static str,
    /// Error detail when unavailable (Linux without a running Secret Service, etc.).
    error: Option<String>,
}

/// Live, never-cached probe of the OS keychain. Read-only: it looks up a
/// throwaway entry and treats "no such entry" as success (the backend
/// answered). Any other error — most commonly no Secret Service daemon on
/// Linux — means API keys and the backup passphrase cannot be stored. The UI
/// calls this on mount and on an explicit re-check, so installing a keyring
/// service and re-checking reflects immediately, with no stale state.
#[tauri::command]
fn keychain_status() -> KeychainStatus {
    let backend = if cfg!(target_os = "macos") {
        "macOS Keychain"
    } else if cfg!(windows) {
        "Windows Credential Manager"
    } else {
        "Secret Service"
    };
    match probe_keychain() {
        Ok(()) => KeychainStatus {
            available: true,
            backend,
            error: None,
        },
        Err(e) => KeychainStatus {
            available: false,
            backend,
            error: Some(e),
        },
    }
}

fn probe_keychain() -> Result<(), String> {
    match entry_for("__availability_probe__")?.get_password() {
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[derive(serde::Serialize)]
struct McpServerInfo {
    /// Absolute path to the bundled `soma-mcp` stdio binary.
    path: String,
    /// Whether that binary is present on disk (false before the sidecar is built).
    exists: bool,
}

/// Resolves the path to the bundled MCP server binary so the Settings UI can
/// generate copy-paste config for external AI clients (Claude Code, Codex,
/// Gemini, Cursor). Tauri places `externalBin` next to the main executable.
#[tauri::command]
fn mcp_server_path() -> Result<McpServerInfo, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe
        .parent()
        .ok_or_else(|| "could not resolve executable directory".to_string())?;
    let bin_name = if cfg!(windows) {
        "soma-mcp.exe"
    } else {
        "soma-mcp"
    };
    let path = dir.join(bin_name);
    Ok(McpServerInfo {
        exists: path.exists(),
        path: path.to_string_lossy().into_owned(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("soma".into()),
                    }),
                ])
                // Rotate at 10 MB; keep one previous file alongside the live one.
                .max_file_size(10 * 1024 * 1024)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            keychain_set,
            keychain_get,
            keychain_delete,
            keychain_status,
            mcp_server_path,
            mcp::mcp_clients_status,
            mcp::mcp_install,
            transaction::execute_transaction,
            backup::detect_backup_providers,
            backup::verify_backup_dir,
            backup::backup_passphrase_set,
            backup::backup_passphrase_exists,
            backup::backup_passphrase_delete,
            backup::backup_snapshot_target,
            backup::create_backup,
            backup::inspect_backup,
            backup::discard_restore_staging,
            backup::restore_backup,
            vault::vault_state,
            vault::vault_snapshot_target,
            vault::vault_enable_keychain,
            vault::vault_enable_passphrase,
            vault::vault_unlock_keychain,
            vault::vault_unlock_passphrase,
            vault::vault_verify_passphrase,
            vault::vault_lock_keychain,
            vault::vault_lock_passphrase,
            vault::vault_disable
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
