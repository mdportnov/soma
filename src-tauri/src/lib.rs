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
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            keychain_set,
            keychain_get,
            keychain_delete
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
