//! One-click MCP registration: writes the Soma stdio server into each AI
//! client's own config file (Claude, Codex, Gemini, Cursor, VS Code), merging
//! into existing config without disturbing other servers. Users never copy
//! JSON by hand.

use std::fs;
use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Manager};

/// Key under which the Soma server is registered in every client.
const SERVER_KEY: &str = "soma";

/// Config schema a client expects.
#[derive(Clone, Copy)]
enum Format {
    /// `{ "mcpServers": { "soma": { "command": "…" } } }`
    JsonMcpServers,
    /// VS Code: `{ "servers": { "soma": { "type": "stdio", "command": "…" } } }`
    JsonVscode,
    /// Codex: `[mcp_servers.soma]\ncommand = "…"`
    TomlCodex,
}

struct Client {
    id: &'static str,
    label: &'static str,
    format: Format,
}

const CLIENTS: &[Client] = &[
    Client {
        id: "claude-desktop",
        label: "Claude Desktop",
        format: Format::JsonMcpServers,
    },
    Client {
        id: "claude-code",
        label: "Claude Code",
        format: Format::JsonMcpServers,
    },
    Client {
        id: "codex",
        label: "Codex CLI",
        format: Format::TomlCodex,
    },
    Client {
        id: "gemini",
        label: "Gemini CLI",
        format: Format::JsonMcpServers,
    },
    Client {
        id: "cursor",
        label: "Cursor",
        format: Format::JsonMcpServers,
    },
    Client {
        id: "vscode",
        label: "VS Code",
        format: Format::JsonVscode,
    },
];

fn client(id: &str) -> Result<&'static Client, String> {
    CLIENTS
        .iter()
        .find(|c| c.id == id)
        .ok_or_else(|| format!("unknown MCP client: {id}"))
}

fn home(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().home_dir().map_err(|e| e.to_string())
}

/// Platform config root: `~/Library/Application Support` (macOS),
/// `~/.config` (Linux), `%APPDATA%` (Windows).
fn config_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().config_dir().map_err(|e| e.to_string())
}

/// Absolute path to a client's config file.
fn config_path(app: &AppHandle, c: &Client) -> Result<PathBuf, String> {
    let h = home(app)?;
    Ok(match c.id {
        "claude-desktop" => config_root(app)?
            .join("Claude")
            .join("claude_desktop_config.json"),
        "claude-code" => h.join(".claude.json"),
        "codex" => h.join(".codex").join("config.toml"),
        "gemini" => h.join(".gemini").join("settings.json"),
        "cursor" => h.join(".cursor").join("mcp.json"),
        "vscode" => config_root(app)?.join("Code").join("User").join("mcp.json"),
        other => return Err(format!("unknown MCP client: {other}")),
    })
}

/// Heuristic: is this client plausibly installed on the machine?
fn detected(app: &AppHandle, c: &Client) -> bool {
    let h = match home(app) {
        Ok(h) => h,
        Err(_) => return false,
    };
    let root = config_root(app).ok();
    match c.id {
        "claude-desktop" => root.map(|r| r.join("Claude").exists()).unwrap_or(false),
        "claude-code" => h.join(".claude.json").exists() || h.join(".claude").exists(),
        "codex" => h.join(".codex").exists(),
        "gemini" => h.join(".gemini").exists(),
        "cursor" => {
            h.join(".cursor").exists() || PathBuf::from("/Applications/Cursor.app").exists()
        }
        "vscode" => root.map(|r| r.join("Code").exists()).unwrap_or(false),
        _ => false,
    }
}

/// Env var that opts the server in to write tools (mirrors `mcp/src/guard.ts`).
const ALLOW_WRITES_ENV: &str = "SOMA_MCP_ALLOW_WRITES";

/// Is `soma` already registered in this client pointing at `server_path`?
fn configured(app: &AppHandle, c: &Client, server_path: &str) -> bool {
    let path = match config_path(app, c) {
        Ok(p) => p,
        Err(_) => return false,
    };
    let text = match fs::read_to_string(&path) {
        Ok(t) => t,
        Err(_) => return false,
    };
    match c.format {
        Format::TomlCodex => text
            .parse::<toml_edit::DocumentMut>()
            .ok()
            .and_then(|d| {
                d.get("mcp_servers")?
                    .get(SERVER_KEY)?
                    .get("command")?
                    .as_str()
                    .map(|s| s == server_path)
            })
            .unwrap_or(false),
        Format::JsonMcpServers | Format::JsonVscode => {
            let container = match c.format {
                Format::JsonVscode => "servers",
                _ => "mcpServers",
            };
            serde_json::from_str::<serde_json::Value>(&text)
                .ok()
                .and_then(|v| {
                    v.get(container)?
                        .get(SERVER_KEY)?
                        .get("command")?
                        .as_str()
                        .map(|s| s == server_path)
                })
                .unwrap_or(false)
        }
    }
}

/// Does the already-written `soma` entry have write tools enabled
/// (`env.SOMA_MCP_ALLOW_WRITES` set to a truthy value)?
fn writes_enabled(app: &AppHandle, c: &Client) -> bool {
    let path = match config_path(app, c) {
        Ok(p) => p,
        Err(_) => return false,
    };
    let text = match fs::read_to_string(&path) {
        Ok(t) => t,
        Err(_) => return false,
    };
    let truthy = |s: &str| s == "1" || s.eq_ignore_ascii_case("true");
    match c.format {
        Format::TomlCodex => text
            .parse::<toml_edit::DocumentMut>()
            .ok()
            .and_then(|d| {
                d.get("mcp_servers")?
                    .get(SERVER_KEY)?
                    .get("env")?
                    .get(ALLOW_WRITES_ENV)?
                    .as_str()
                    .map(truthy)
            })
            .unwrap_or(false),
        Format::JsonMcpServers | Format::JsonVscode => {
            let container = match c.format {
                Format::JsonVscode => "servers",
                _ => "mcpServers",
            };
            serde_json::from_str::<serde_json::Value>(&text)
                .ok()
                .and_then(|v| {
                    v.get(container)?
                        .get(SERVER_KEY)?
                        .get("env")?
                        .get(ALLOW_WRITES_ENV)?
                        .as_str()
                        .map(truthy)
                })
                .unwrap_or(false)
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientStatus {
    id: String,
    label: String,
    config_path: String,
    detected: bool,
    configured: bool,
    writes_enabled: bool,
}

/// Status of every supported client: where its config lives, whether it looks
/// installed, and whether Soma is already wired up.
#[tauri::command]
pub fn mcp_clients_status(
    app: AppHandle,
    server_path: String,
) -> Result<Vec<ClientStatus>, String> {
    CLIENTS
        .iter()
        .map(|c| {
            Ok(ClientStatus {
                id: c.id.to_string(),
                label: c.label.to_string(),
                config_path: config_path(&app, c)?.to_string_lossy().into_owned(),
                detected: detected(&app, c),
                configured: configured(&app, c, &server_path),
                writes_enabled: writes_enabled(&app, c),
            })
        })
        .collect()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallResult {
    config_path: String,
    /// "created" if the file was new, "updated" if it already existed.
    action: String,
}

/// Registers (or refreshes) the Soma server in one client's config file.
/// `writes_enabled` sets/clears `SOMA_MCP_ALLOW_WRITES=1` in the server's env
/// so the assistant can call the write tools (add medication, log symptom,
/// etc.) without the user hand-editing the config — see `mcp/src/guard.ts`.
#[tauri::command]
pub fn mcp_install(
    app: AppHandle,
    client: String,
    server_path: String,
    writes_enabled: bool,
) -> Result<InstallResult, String> {
    let c = self::client(&client)?;
    let path = config_path(&app, c)?;
    let existed = path.exists();

    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
    }

    match c.format {
        Format::TomlCodex => write_toml(&path, &server_path, writes_enabled)?,
        Format::JsonMcpServers => {
            write_json(&path, "mcpServers", &server_path, false, writes_enabled)?
        }
        Format::JsonVscode => write_json(&path, "servers", &server_path, true, writes_enabled)?,
    }

    Ok(InstallResult {
        config_path: path.to_string_lossy().into_owned(),
        action: if existed { "updated" } else { "created" }.into(),
    })
}

fn write_json(
    path: &PathBuf,
    container: &str,
    server_path: &str,
    vscode_stdio: bool,
    writes_enabled: bool,
) -> Result<(), String> {
    let mut root: serde_json::Value = match fs::read_to_string(path) {
        Ok(t) if !t.trim().is_empty() => {
            serde_json::from_str(&t).map_err(|e| format!("parse {}: {e}", path.display()))?
        }
        _ => serde_json::json!({}),
    };
    if !root.is_object() {
        root = serde_json::json!({});
    }
    let obj = root.as_object_mut().unwrap();
    let cont = obj
        .entry(container.to_string())
        .or_insert_with(|| serde_json::json!({}));
    if !cont.is_object() {
        *cont = serde_json::json!({});
    }
    let mut entry = if vscode_stdio {
        serde_json::json!({ "type": "stdio", "command": server_path })
    } else {
        serde_json::json!({ "command": server_path })
    };
    if writes_enabled {
        let mut env = serde_json::Map::new();
        env.insert(ALLOW_WRITES_ENV.to_string(), serde_json::json!("1"));
        entry["env"] = serde_json::Value::Object(env);
    }
    cont.as_object_mut()
        .unwrap()
        .insert(SERVER_KEY.to_string(), entry);

    let text = serde_json::to_string_pretty(&root).map_err(|e| e.to_string())?;
    fs::write(path, text + "\n").map_err(|e| format!("write {}: {e}", path.display()))
}

fn write_toml(path: &PathBuf, server_path: &str, writes_enabled: bool) -> Result<(), String> {
    use toml_edit::{value, DocumentMut, Item, Table};

    let mut doc: DocumentMut = match fs::read_to_string(path) {
        Ok(t) if !t.trim().is_empty() => t
            .parse()
            .map_err(|e| format!("parse {}: {e}", path.display()))?,
        _ => DocumentMut::new(),
    };

    let servers = doc
        .entry("mcp_servers")
        .or_insert(Item::Table(Table::new()))
        .as_table_mut()
        .ok_or_else(|| "mcp_servers is not a table".to_string())?;
    servers.set_implicit(true);

    let mut soma = Table::new();
    soma["command"] = value(server_path);
    if writes_enabled {
        let mut env = Table::new();
        env[ALLOW_WRITES_ENV] = value("1");
        soma.insert("env", Item::Table(env));
    }
    servers.insert(SERVER_KEY, Item::Table(soma));

    fs::write(path, doc.to_string()).map_err(|e| format!("write {}: {e}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    fn tmp(name: &str) -> PathBuf {
        let mut p = env::temp_dir();
        p.push(format!("soma-mcp-test-{}-{name}", std::process::id()));
        p
    }

    #[test]
    fn json_merge_preserves_other_servers() {
        let path = tmp("config.json");
        fs::write(
            &path,
            r#"{ "mcpServers": { "other": { "command": "x" } }, "keepMe": 7 }"#,
        )
        .unwrap();

        write_json(&path, "mcpServers", "/bin/soma-mcp", false, false).unwrap();

        let v: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(v["keepMe"], 7);
        assert_eq!(v["mcpServers"]["other"]["command"], "x");
        assert_eq!(v["mcpServers"]["soma"]["command"], "/bin/soma-mcp");
        fs::remove_file(&path).ok();
    }

    #[test]
    fn json_vscode_uses_stdio_servers() {
        let path = tmp("vscode.json");
        write_json(&path, "servers", "/bin/soma-mcp", true, false).unwrap();
        let v: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(v["servers"]["soma"]["type"], "stdio");
        assert_eq!(v["servers"]["soma"]["command"], "/bin/soma-mcp");
        fs::remove_file(&path).ok();
    }

    #[test]
    fn toml_merge_preserves_other_servers() {
        let path = tmp("config.toml");
        fs::write(
            &path,
            "model = \"gpt-5\"\n\n[mcp_servers.other]\ncommand = \"npx\"\nargs = [\"a\"]\n",
        )
        .unwrap();

        write_toml(&path, "/bin/soma-mcp", false).unwrap();

        let doc: toml_edit::DocumentMut = fs::read_to_string(&path).unwrap().parse().unwrap();
        assert_eq!(doc["model"].as_str(), Some("gpt-5"));
        assert_eq!(doc["mcp_servers"]["other"]["command"].as_str(), Some("npx"));
        assert_eq!(
            doc["mcp_servers"]["soma"]["command"].as_str(),
            Some("/bin/soma-mcp")
        );
        fs::remove_file(&path).ok();
    }

    #[test]
    fn json_writes_enabled_sets_env() {
        let path = tmp("writes-on.json");
        write_json(&path, "mcpServers", "/bin/soma-mcp", false, true).unwrap();
        let v: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(v["mcpServers"]["soma"]["env"]["SOMA_MCP_ALLOW_WRITES"], "1");
        fs::remove_file(&path).ok();
    }

    #[test]
    fn json_writes_disabled_omits_env() {
        let path = tmp("writes-off.json");
        write_json(&path, "mcpServers", "/bin/soma-mcp", false, false).unwrap();
        let v: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert!(v["mcpServers"]["soma"].get("env").is_none());
        fs::remove_file(&path).ok();
    }

    #[test]
    fn toml_writes_enabled_sets_env() {
        let path = tmp("writes-on.toml");
        write_toml(&path, "/bin/soma-mcp", true).unwrap();
        let doc: toml_edit::DocumentMut = fs::read_to_string(&path).unwrap().parse().unwrap();
        assert_eq!(
            doc["mcp_servers"]["soma"]["env"]["SOMA_MCP_ALLOW_WRITES"].as_str(),
            Some("1")
        );
        fs::remove_file(&path).ok();
    }
}
