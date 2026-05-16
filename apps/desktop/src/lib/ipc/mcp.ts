/**
 * MCP IPC layer — Lane H (Sprint 3).
 *
 * Typed wrappers around `invoke()` for every `mcp_*` Tauri command, plus
 * helpers for subscribing to the `mcp.output` and `mcp.status` Tauri events
 * emitted by the Rust MCP host in `src-tauri/src/mcp/`.
 *
 * Event contract (cross-lane locked):
 *   mcp.output  — { serverId, stream: "stdout"|"stderr", data: string }
 *   mcp.status  — { serverId, status: "running"|"stopped"|"crashed", exitCode?: number }
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * Status snapshot for a single MCP server.
 * Mirrors the Rust `MCPServerStatus` struct in `mcp/host.rs`.
 */
export interface MCPServerStatus {
  serverId: string;
  /** "running" | "stopped" | "crashed" */
  status: string;
}

/**
 * Payload emitted on the `mcp.output` Tauri event.
 * Mirrors the Rust `MCPOutputPayload` struct in `mcp/host.rs`.
 */
export interface MCPOutputPayload {
  serverId: string;
  /** Which stream the data came from. */
  stream: 'stdout' | 'stderr';
  /** UTF-8 text chunk (line or partial line from the child process). */
  data: string;
}

/**
 * Payload emitted on the `mcp.status` Tauri event.
 * Mirrors the Rust `MCPStatusPayload` struct in `mcp/host.rs`.
 */
export interface MCPStatusPayload {
  serverId: string;
  status: 'running' | 'stopped' | 'crashed';
  /** Present only on `Terminated` events. */
  exitCode?: number | null;
}

// ── Commands ───────────────────────────────────────────────────────────────────

/**
 * Start an MCP server process.
 *
 * Idempotent: if the server identified by `serverId` is already running the
 * backend returns `Ok(())` without spawning a second copy.
 *
 * The backend emits `mcp.status { status:"running" }` immediately after a
 * successful spawn.
 */
export function mcpStart(
  serverId: string,
  command: string,
  args: string[],
  env: Record<string, string>,
): Promise<void> {
  return invoke<void>('mcp_start', { serverId, command, args, env });
}

/**
 * Stop a running MCP server by sending SIGKILL.
 *
 * The Rust backend emits `mcp.status { status:"stopped" }` once the process
 * terminates.  Subscribe via `subscribeToMcpStatus` to react to the change.
 */
export function mcpStop(serverId: string): Promise<void> {
  return invoke<void>('mcp_stop', { serverId });
}

/**
 * Return the current status of all tracked MCP servers.
 *
 * Includes servers that have stopped or crashed (not just running ones) so
 * the UI can merge this data with the persisted config for a complete picture.
 */
export function mcpStatus(): Promise<MCPServerStatus[]> {
  return invoke<MCPServerStatus[]>('mcp_status');
}

// ── Event subscriptions ────────────────────────────────────────────────────────

/**
 * Subscribe to stdout/stderr output from all running MCP servers.
 *
 * If you only care about a specific server, filter by `payload.serverId` in
 * your handler.
 *
 * Returns an unlisten function; call it on component unmount to avoid leaks.
 *
 * Example:
 * ```ts
 * const unlisten = await subscribeToMcpOutput((payload) => {
 *   if (payload.serverId === myId) console.log(payload.data);
 * });
 * // on cleanup:
 * unlisten();
 * ```
 */
export function subscribeToMcpOutput(
  handler: (payload: MCPOutputPayload) => void,
): Promise<UnlistenFn> {
  return listen<MCPOutputPayload>('mcp.output', (event) => handler(event.payload));
}

/**
 * Subscribe to MCP server lifecycle status changes.
 *
 * Emitted whenever a server transitions between `running`, `stopped`, and
 * `crashed`.  Use this to keep the UI status badges in sync without polling.
 *
 * Returns an unlisten function; call it on component unmount.
 *
 * Example:
 * ```ts
 * const unlisten = await subscribeToMcpStatus((payload) => {
 *   store.updateStatus(payload.serverId, payload.status);
 * });
 * unlisten(); // on cleanup
 * ```
 */
export function subscribeToMcpStatus(
  handler: (payload: MCPStatusPayload) => void,
): Promise<UnlistenFn> {
  return listen<MCPStatusPayload>('mcp.status', (event) => handler(event.payload));
}
