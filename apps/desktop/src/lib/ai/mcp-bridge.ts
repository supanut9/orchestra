/**
 * mcp-bridge.ts
 *
 * Workspace-aware MCP config reader/writer. Uses Tauri's fs plugin to access
 * `<workspace>/.orchestra/mcp.json` so the bridge stays browser-safe (the
 * Node-only `@orchestra/mcp-client` `MCPManager` is not bundled into the
 * renderer).
 *
 * Server lifecycle (start/stop/restart, listTools) returns mock data here —
 * real Tauri-backed spawning of MCP server processes lands in Sprint 3 once
 * the Rust backend has an MCP host module.
 */

import type { MCPServerConfig, MCPServer, MCPTool } from '@orchestra/mcp-client';
import type { MCPConfig } from '@orchestra/mcp-client';
import { parseConfig } from '@orchestra/mcp-client';

const CONFIG_SUBPATH = '.orchestra/mcp.json';

let cachedWorkspace: string | null = null;
let cachedConfig: MCPConfig | null = null;
let runtimeState: Map<string, MCPServer['status']> = new Map();

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

export interface MCPServerStatus extends MCPServer {
  tools?: MCPTool[];
}

export async function getStatus(workspacePath: string | null | undefined): Promise<MCPServer[]> {
  if (!workspacePath) return [];
  const config = await loadConfig(workspacePath);
  return Object.entries(config.servers).map(([id, cfg]) => ({
    id,
    config: cfg,
    status: runtimeState.get(id) ?? 'stopped',
  }));
}

export async function startServer(_workspacePath: string, serverId: string): Promise<void> {
  runtimeState.set(serverId, 'running');
}

export async function stopServer(_workspacePath: string, serverId: string): Promise<void> {
  runtimeState.set(serverId, 'stopped');
}

export async function restartServer(workspacePath: string, serverId: string): Promise<void> {
  await stopServer(workspacePath, serverId);
  await startServer(workspacePath, serverId);
}

export async function listTools(_workspacePath: string, _serverId: string): Promise<MCPTool[]> {
  // Real implementation will spawn the server and call MCP `tools/list` over
  // stdio. Sprint 3.
  return [];
}

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
  runtimeState.delete(id);
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
  runtimeState = new Map();
}
