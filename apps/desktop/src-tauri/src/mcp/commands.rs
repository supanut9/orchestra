// Tauri commands for the MCP host — Lane H (Sprint 3).
//
// Naming convention: `mcp_<verb>` maps 1-to-1 to the TypeScript wrappers in
// `src/lib/ipc/mcp.ts`.
//
// All commands are async-free at the IPC boundary: they acquire the async
// `Mutex` guard via `tokio::sync::Mutex::lock()` and call synchronous host
// methods.  The Tokio runtime provided by Tauri ensures these are safe to
// call from the webview thread.

use std::collections::HashMap;
use tauri::{AppHandle, State};

use super::{MCPState, host::{MCPServerConfig, MCPServerStatus}};

// ── mcp_start ─────────────────────────────────────────────────────────────────

/// Start an MCP server process.
///
/// Idempotent: if the server is already running this is a no-op.
///
/// TypeScript signature:
/// ```ts
/// invoke<void>('mcp_start', { serverId, command, args, env })
/// ```
#[tauri::command]
pub async fn mcp_start(
    server_id: String,
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    state: State<'_, MCPState>,
    app: AppHandle,
) -> Result<(), String> {
    let host = state.0.lock().await;

    let config = MCPServerConfig { command, args, env };

    host.spawn(server_id, config, app)
}

// ── mcp_stop ──────────────────────────────────────────────────────────────────

/// Stop a running MCP server by sending SIGKILL.
///
/// The background event task will pick up the `Terminated` event and emit
/// `mcp.status { status:"stopped" }` on the Tauri event bus.
///
/// TypeScript signature:
/// ```ts
/// invoke<void>('mcp_stop', { serverId })
/// ```
#[tauri::command]
pub async fn mcp_stop(
    server_id: String,
    state: State<'_, MCPState>,
) -> Result<(), String> {
    let host = state.0.lock().await;
    host.stop(&server_id)
}

// ── mcp_status ────────────────────────────────────────────────────────────────

/// Return the status of all tracked MCP servers.
///
/// Includes servers that have stopped or crashed so the UI can show history.
///
/// TypeScript signature:
/// ```ts
/// invoke<MCPServerStatus[]>('mcp_status')
/// ```
#[tauri::command]
pub async fn mcp_status(state: State<'_, MCPState>) -> Result<Vec<MCPServerStatus>, String> {
    let host = state.0.lock().await;
    Ok(host.list_running())
}
