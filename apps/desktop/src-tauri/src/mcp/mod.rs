// MCP module — Lane H (Sprint 3).
//
// Provides Tauri-backed spawning of MCP server processes via
// `tauri_plugin_shell`.  Output (stdout/stderr) and lifecycle events are
// streamed to the renderer on the `mcp.output` and `mcp.status` event topics.
//
// Commands registered in `lib.rs`:
//   mcp::commands::mcp_start
//   mcp::commands::mcp_stop
//   mcp::commands::mcp_status
//
// Managed state registered in `lib.rs`:
//   .manage(mcp::MCPState::default())
//
// Module declaration in `lib.rs`:
//   pub mod mcp;

pub mod commands;
pub mod host;

pub use host::MCPHost;

use std::sync::Arc;
use tokio::sync::Mutex;

/// Tauri managed state wrapping the MCP host behind a `tokio::sync::Mutex`.
///
/// An async Mutex is used (rather than `std::sync::Mutex`) because the Tauri
/// command dispatcher is async and the host's `spawn` call may be held across
/// await points in the background task launcher.  The lock is held only for
/// the duration of each command handler.
pub struct MCPState(pub Arc<Mutex<MCPHost>>);

impl Default for MCPState {
    fn default() -> Self {
        Self(Arc::new(Mutex::new(MCPHost::default())))
    }
}
