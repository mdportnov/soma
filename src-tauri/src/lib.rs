mod backup;

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
            backup::detect_backup_providers,
            backup::verify_backup_dir,
            backup::backup_passphrase_set,
            backup::backup_passphrase_exists,
            backup::backup_passphrase_delete,
            backup::backup_snapshot_target,
            backup::create_backup,
            backup::inspect_backup,
            backup::discard_restore_staging,
            backup::restore_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
