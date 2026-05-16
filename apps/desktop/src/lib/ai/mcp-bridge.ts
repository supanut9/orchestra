/**
 * mcp-bridge.ts
 *
 * Workspace-aware MCP config reader/writer + server lifecycle manager.
 *
 * Config storage: reads/writes `<workspace>/.orchestra/mcp.json` via the
 * Tauri fs plugin (browser-safe; no Node.js).
 *
 * Server lifecycle: delegates to the Rust MCP host via typed IPC calls
 * (`mcp_start`, `mcp_stop`) defined in `src-tauri/src/mcp/commands.rs`.
 * Live status is merged from the `mcp_status` IPC result so the UI always
 * reflects what is actually running, not just what we last told it to do.
 *
 * What is NOT yet implemented (Sprint 4):
 *   - Real MCP JSON-RPC protocol over stdio (tools/list, tools/call, …)
 *   - `listTools` still returns `[]`; the real implementation will send
 *     MCP `initialize` + `tools/list` requests over the child's stdin and
 *     read the response from stdout.
 */

import type { MCPServerConfig, MCPServer, MCPTool } from '@orchestra/mcp-client';
import type { MCPConfig } from '@orchestra/mcp-client';
import { parseConfig } from '@orchestra/mcp-client';
import { mcpStart, mcpStop, mcpStatus } from '@/lib/ipc/mcp';

const CONFIG_SUBPATH = '.orchestra/mcp.json';

let cachedWorkspace: string | null = null;
let cachedConfig: MCPConfig | null = null;

function configPath(workspacePath: string): string {
  return `${workspacePath}/${CONFIG_SUBPATH}`;
}

async function loadConfig(workspacePath: string): Promise<MCPConfig> {
  if (cachedConfig && cachedWorkspace === workspacePath) {
    return cachedConfig;
  }
  cachedWorkspace = workspacePath;
  try {
    const { readTextFile } = await import('@tauri-apps/plugin-fs');
    const raw = await readTextFile(configPath(workspacePath));
    cachedConfig = parseConfig(JSON.parse(raw));
  } catch {
    cachedConfig = { servers: {} };
  }
  return cachedConfig;
}

async function persist(workspacePath: string, config: MCPConfig): Promise<void> {
  try {
    const { writeTextFile, mkdir } = await import('@tauri-apps/plugin-fs');
    await mkdir(`${workspacePath}/.orchestra`, { recursive: true }).catch(() => {});
    await writeTextFile(configPath(workspacePath), JSON.stringify(config, null, 2));
    cachedConfig = config;
  } catch (err) {
    console.warn('[mcp-bridge] failed to write config:', err);
  }
}

// ── Public interface ───────────────────────────────────────────────────────────

/**
 * Extended server view returned by `getStatus` — includes optional tool list
 * (populated lazily when the user selects a server in the UI).
 */
export interface MCPServerStatus extends MCPServer {
  tools?: MCPTool[];
}

/**
 * Return the merged server list for a workspace.
 *
 * Reads the persisted config from `.orchestra/mcp.json` for the full server
 * catalogue, then merges live runtime status from the Rust MCP host so status
 * badges reflect the actual process state rather than the last known state.
 *
 * Servers that appear in the config but have no running entry in the Rust host
 * default to `'stopped'`.
 */
export async function getStatus(workspacePath: string | null | undefined): Promise<MCPServer[]> {
  if (!workspacePath) return [];
  const config = await loadConfig(workspacePath);

  // Fetch live runtime status from the Rust host and build a lookup map.
  let liveStatus: Map<string, string> = new Map();
  try {
    const statuses = await mcpStatus();
    for (const s of statuses) {
      liveStatus.set(s.serverId, s.status);
    }
  } catch (err) {
    // If the IPC call fails (e.g. during dev without a real backend) fall back
    // to treating everything as stopped.
    console.warn('[mcp-bridge] mcpStatus IPC call failed:', err);
  }

  return Object.entries(config.servers).map(([id, cfg]) => {
    const rawStatus = liveStatus.get(id) ?? 'stopped';
    // Map the Rust status strings to the MCPServerStatus union type.
    // 'crashed' → 'error' to match the MCPServerStatus type from @orchestra/mcp-client.
    const status: MCPServer['status'] =
      rawStatus === 'running' ? 'running' : rawStatus === 'crashed' ? 'error' : 'stopped';

    return { id, config: cfg, status };
  });
}

/**
 * Start an MCP server.
 *
 * Looks up the server config for `serverId` in the workspace config, then
 * calls the Rust `mcp_start` command to spawn the process.  The Rust backend
 * will emit `mcp.status { status:"running" }` on the event bus once the
 * process is live; subscribe via `subscribeToMcpStatus` if you need a
 * push notification.
 *
 * Throws if the server ID is not found in the config or if the spawn fails.
 */
export async function startServer(workspacePath: string, serverId: string): Promise<void> {
  const config = await loadConfig(workspacePath);
  const serverCfg = config.servers[serverId];

  if (!serverCfg) {
    throw new Error(`[mcp-bridge] server '${serverId}' not found in config`);
  }

  await mcpStart(serverId, serverCfg.command, serverCfg.args ?? [], serverCfg.env ?? {});
}

/**
 * Stop a running MCP server.
 *
 * Delegates to `mcp_stop` which sends SIGKILL to the child process.  The Rust
 * backend emits `mcp.status { status:"stopped" }` on the event bus after the
 * process terminates.
 *
 * Throws if the Rust host cannot find or kill the process.
 */
export async function stopServer(_workspacePath: string, serverId: string): Promise<void> {
  await mcpStop(serverId);
}

/**
 * Restart an MCP server: stop (best-effort) then start.
 *
 * A stop error is swallowed so that we can still attempt the re-spawn even if
 * the process had already terminated on its own.
 */
export async function restartServer(workspacePath: string, serverId: string): Promise<void> {
  try {
    await stopServer(workspacePath, serverId);
  } catch {
    // Ignore — process may already be dead.
  }
  await startServer(workspacePath, serverId);
}

/**
 * Return the tool list for a running MCP server.
 *
 * Sprint 4 — real implementation will send `initialize` + `tools/list`
 * JSON-RPC requests over the child's stdin and parse the response from
 * stdout.  Until then this always returns an empty array.
 */
export async function listTools(_workspacePath: string, _serverId: string): Promise<MCPTool[]> {
  // TODO (Sprint 4): wire MCP JSON-RPC protocol over stdio.
  return [];
}

// ── Config CRUD ────────────────────────────────────────────────────────────────

export async function addServer(
  workspacePath: string,
  id: string,
  config: MCPServerConfig,
): Promise<void> {
  const existing = await loadConfig(workspacePath);
  const next: MCPConfig = {
    servers: { ...existing.servers, [id]: config },
  };
  await persist(workspacePath, next);
}

export async function removeServer(workspacePath: string, id: string): Promise<void> {
  const existing = await loadConfig(workspacePath);
  const { [id]: _removed, ...rest } = existing.servers;
  const next: MCPConfig = { servers: rest };

  // Best-effort stop: if the server is running, kill it before removing the
  // config entry.  Ignore errors (it may already be stopped).
  try {
    await mcpStop(id);
  } catch {
    // Ignore.
  }

  await persist(workspacePath, next);
}

export async function saveConfig(workspacePath: string): Promise<void> {
  if (cachedConfig && cachedWorkspace === workspacePath) {
    await persist(workspacePath, cachedConfig);
  }
}

export function getRawConfig(): MCPConfig | null {
  return cachedConfig;
}

export function invalidate(): void {
  cachedWorkspace = null;
  cachedConfig = null;
}
