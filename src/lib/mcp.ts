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
  /** The registered entry has `SOMA_MCP_ALLOW_WRITES=1` set — write tools are live. */
  writesEnabled: boolean;
};

export function mcpClientsStatus(serverPath: string): Promise<McpClientStatus[]> {
  return invoke<McpClientStatus[]>("mcp_clients_status", { serverPath });
}

export type McpInstallResult = { configPath: string; action: "created" | "updated" };

/** Writes the Soma server into the given client's own config file. */
export function mcpInstall(
  client: string,
  serverPath: string,
  writesEnabled: boolean,
): Promise<McpInstallResult> {
  return invoke<McpInstallResult>("mcp_install", { client, serverPath, writesEnabled });
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

/** Env var that opts the MCP server in to write tools (see `mcp/src/guard.ts`). */
export const ALLOW_WRITES_ENV = "SOMA_MCP_ALLOW_WRITES";

/**
 * Builds copy-paste MCP config for each supported client. The Soma server is a
 * local stdio process that reads soma.db directly — no token, no network — so
 * every client just needs the absolute path to the bundled binary. When
 * `writesEnabled` is set, the snippet also carries the env var that unlocks
 * the write tools (add medication, log symptom, …) for that client.
 */
export function buildMcpSnippets(serverPath: string, writesEnabled: boolean): McpSnippet[] {
  const entry: Record<string, unknown> = { command: serverPath };
  if (writesEnabled) entry.env = { [ALLOW_WRITES_ENV]: "1" };
  const mcpServersJson = JSON.stringify({ mcpServers: { soma: entry } }, null, 2);

  const tomlEnv = writesEnabled ? `\n\n[mcp_servers.soma.env]\n${ALLOW_WRITES_ENV} = "1"` : "";

  return [
    {
      id: "claude",
      label: "Claude Code / Desktop",
      location: "claude_desktop_config.json · project .mcp.json",
      lang: "json",
      code: mcpServersJson,
      cli: writesEnabled
        ? `claude mcp add soma --env ${ALLOW_WRITES_ENV}=1 -- ${q(serverPath)}`
        : `claude mcp add soma -- ${q(serverPath)}`,
    },
    {
      id: "codex",
      label: "Codex CLI",
      location: "~/.codex/config.toml",
      lang: "toml",
      code: `[mcp_servers.soma]\ncommand = ${q(serverPath)}${tomlEnv}`,
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
