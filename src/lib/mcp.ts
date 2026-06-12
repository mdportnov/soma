import { invoke } from "@tauri-apps/api/core";

export type McpServerInfo = {
  /** Absolute path to the bundled `soma-mcp` stdio binary. */
  path: string;
  /** False before the sidecar binary has been built/bundled. */
  exists: boolean;
};

export function getMcpServerInfo(): Promise<McpServerInfo> {
  return invoke<McpServerInfo>("mcp_server_path");
}

/** One supported AI client and whether Soma is already wired into it. */
export type McpClientStatus = {
  id: string;
  label: string;
  configPath: string;
  /** The client looks installed on this machine. */
  detected: boolean;
  /** `soma` is already registered and points at the current binary. */
  configured: boolean;
};

export function mcpClientsStatus(serverPath: string): Promise<McpClientStatus[]> {
  return invoke<McpClientStatus[]>("mcp_clients_status", { serverPath });
}

export type McpInstallResult = { configPath: string; action: "created" | "updated" };

/** Writes the Soma server into the given client's own config file. */
export function mcpInstall(client: string, serverPath: string): Promise<McpInstallResult> {
  return invoke<McpInstallResult>("mcp_install", { client, serverPath });
}

export type McpClientId = "claude" | "codex" | "gemini" | "cursor";

export type McpSnippet = {
  id: McpClientId;
  /** Display name of the client. */
  label: string;
  /** Where the snippet goes, e.g. `~/.codex/config.toml`. */
  location: string;
  /** Syntax for the code block (`json` | `toml` | `shell`). */
  lang: "json" | "toml" | "shell";
  /** The config text to copy. */
  code: string;
  /** Optional one-liner shown above the block (e.g. a CLI shortcut). */
  cli?: string;
};

/** JSON-encode the path so backslashes (Windows) and quotes are escaped. */
function q(path: string): string {
  return JSON.stringify(path);
}

/**
 * Builds copy-paste MCP config for each supported client. The Soma server is a
 * local stdio process that reads soma.db directly — no token, no network — so
 * every client just needs the absolute path to the bundled binary.
 */
export function buildMcpSnippets(serverPath: string): McpSnippet[] {
  const mcpServersJson = JSON.stringify({ mcpServers: { soma: { command: serverPath } } }, null, 2);

  return [
    {
      id: "claude",
      label: "Claude Code / Desktop",
      location: "claude_desktop_config.json · project .mcp.json",
      lang: "json",
      code: mcpServersJson,
      cli: `claude mcp add soma -- ${q(serverPath)}`,
    },
    {
      id: "codex",
      label: "Codex CLI",
      location: "~/.codex/config.toml",
      lang: "toml",
      code: `[mcp_servers.soma]\ncommand = ${q(serverPath)}`,
    },
    {
      id: "gemini",
      label: "Gemini CLI",
      location: "~/.gemini/settings.json",
      lang: "json",
      code: mcpServersJson,
    },
    {
      id: "cursor",
      label: "Cursor / VS Code",
      location: "~/.cursor/mcp.json · .vscode/mcp.json",
      lang: "json",
      code: mcpServersJson,
    },
  ];
}
