/**
 * mcp-bridge.ts
 *
 * Workspace-aware lifecycle wrapper around @orchestra/mcp-client's MCPManager.
 * Config path: <workspace>/.orchestra/mcp.json
 *
 * Lazy init: the manager is only created on first use, and re-created when the
 * workspace changes. Persistence uses @tauri-apps/plugin-fs writeTextFile so
 * the config survives restarts and is editable outside the app.
 *
 * In tests (no Tauri runtime) the fs write silently falls back to a no-op.
 */

import type { MCPServerConfig, MCPServer, MCPTool } from '@orchestra/mcp-client';
import type { MCPConfig } from '@orchestra/mcp-client';

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let currentWorkspacePath: string | null = null;
let managerInstance: any | null = null; // MCPManager — dynamic import to avoid ESM issues
let configCache: MCPConfig | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function configPath(workspacePath: string): string {
  return `${workspacePath}/.orchestra/mcp.json`;
}

async function getManager(workspacePath: string): Promise<any> {
  if (managerInstance && currentWorkspacePath === workspacePath) {
    return managerInstance;
  }

  // Workspace changed — tear down old instance
  if (managerInstance) {
    managerInstance = null;
    configCache = null;
  }

  currentWorkspacePath = workspacePath;

  const { MCPManager } = await import('@orchestra/mcp-client');
  const mgr = new MCPManager();

  try {
    const cfg = await mgr.loadConfig(configPath(workspacePath));
    configCache = cfg;
  } catch (err) {
    // Config file might not exist yet — start empty
    configCache = { servers: {} };
    console.info('[mcp-bridge] No mcp.json found, starting with empty config:', err);
  }

  managerInstance = mgr;
  return mgr;
}

async function writeConfig(workspacePath: string, config: MCPConfig): Promise<void> {
  const json = JSON.stringify(config, null, 2);
  try {
    const { writeTextFile, mkdir } = await import('@tauri-apps/plugin-fs');
    const dir = `${workspacePath}/.orchestra`;
    await mkdir(dir, { recursive: true }).catch(() => {});
    await writeTextFile(configPath(workspacePath), json);
  } catch (err) {
    console.warn(
      '[mcp-bridge] writeTextFile unavailable (non-Tauri env), skipping disk write:',
      err,
    );
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface MCPServerStatus extends MCPServer {
  tools?: MCPTool[];
}

/** Return current server list with statuses. Null when no workspace is open. */
export async function getStatus(workspacePath: string | null | undefined): Promise<MCPServer[]> {
  if (!workspacePath) return [];
  try {
    const mgr = await getManager(workspacePath);
    return mgr.listServers();
  } catch (err) {
    console.warn('[mcp-bridge] getStatus failed:', err);
    return [];
  }
}

/** Start a server. Throws on unknown id. */
export async function startServer(workspacePath: string, serverId: string): Promise<void> {
  const mgr = await getManager(workspacePath);
  await mgr.start(serverId);
}

/** Stop a server. Throws on unknown id. */
export async function stopServer(workspacePath: string, serverId: string): Promise<void> {
  const mgr = await getManager(workspacePath);
  await mgr.stop(serverId);
}

/** Restart a server. */
export async function restartServer(workspacePath: string, serverId: string): Promise<void> {
  const mgr = await getManager(workspacePath);
  await mgr.restart(serverId);
}

/** List tools exposed by a server. */
export async function listTools(workspacePath: string, serverId: string): Promise<MCPTool[]> {
  const mgr = await getManager(workspacePath);
  return mgr.listTools(serverId);
}

/** Add a new server to the config and persist. */
export async function addServer(
  workspacePath: string,
  id: string,
  serverConfig: MCPServerConfig,
): Promise<void> {
  await getManager(workspacePath);
  if (!configCache) configCache = { servers: {} };
  configCache = {
    ...configCache,
    servers: { ...configCache.servers, [id]: serverConfig },
  };
  await saveConfig(workspacePath);
  // Reload so the manager picks up the new entry
  managerInstance = null;
  await getManager(workspacePath);
}

/** Remove a server from the config and persist. */
export async function removeServer(workspacePath: string, id: string): Promise<void> {
  await getManager(workspacePath);
  if (!configCache) return;
  const { [id]: _removed, ...rest } = configCache.servers;
  configCache = { ...configCache, servers: rest };
  await saveConfig(workspacePath);
  managerInstance = null;
  await getManager(workspacePath);
}

/** Persist the current in-memory config to disk. */
export async function saveConfig(workspacePath: string): Promise<void> {
  if (!configCache) return;
  await writeConfig(workspacePath, configCache);
}

/** Get the raw config (for serialization/display). */
export function getRawConfig(): MCPConfig | null {
  return configCache;
}

/** Force re-open on next call (e.g. after external file edit). */
export function invalidate(): void {
  managerInstance = null;
  configCache = null;
  currentWorkspacePath = null;
}
