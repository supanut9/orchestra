// MCP process manager — Lane H (Sprint 3).
//
// Manages the lifecycle of MCP server child processes using `tauri_plugin_shell`.
// Each server is identified by a caller-supplied string ID (matches the key in
// `.orchestra/mcp.json`).  Stdout/stderr from the child are streamed to the
// Tauri event bus so the renderer can display live output:
//
//   `mcp.output`  — { serverId, stream: "stdout"|"stderr", data: string }
//   `mcp.status`  — { serverId, status: "running"|"stopped"|"crashed", exitCode?: number }
//
// Real MCP JSON-RPC protocol over stdio (tools/list, tools/call, etc.) is
// planned for Sprint 4.  For now we just spawn the process and relay I/O.

use std::collections::HashMap;

use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri::Emitter;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};

// ── Config ────────────────────────────────────────────────────────────────────

/// Server configuration as supplied from the IPC call / mcp.json.
/// Mirrors `MCPServerConfig` from `@orchestra/mcp-client`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MCPServerConfig {
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
}

// ── Live status ───────────────────────────────────────────────────────────────

/// Current runtime status of an MCP server.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MCPStatus {
    Running,
    Stopped,
    Crashed,
}

impl std::fmt::Display for MCPStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MCPStatus::Running => write!(f, "running"),
            MCPStatus::Stopped => write!(f, "stopped"),
            MCPStatus::Crashed => write!(f, "crashed"),
        }
    }
}

// ── Event payloads (emitted on the Tauri bus) ─────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MCPOutputPayload {
    pub server_id: String,
    /// "stdout" or "stderr"
    pub stream: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MCPStatusPayload {
    pub server_id: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exit_code: Option<i32>,
}

// ── Serialisable status snapshot (returned by mcp_status command) ─────────────

/// Compact view returned by `mcp_status` — one entry per tracked server.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MCPServerStatus {
    pub server_id: String,
    pub status: String,
}

// ── Internal child handle ─────────────────────────────────────────────────────

/// Everything we need to manage one spawned MCP server child.
///
/// `child` is wrapped in `Option` because `CommandChild::kill(self)` consumes
/// the value.  We `take()` it out of the `Option` when we need to kill it,
/// avoiding a move-out-of-DashMap-reference that Rust would otherwise reject.
pub struct MCPChild {
    /// The actual process handle.  `None` after `kill()` has been called.
    pub child: Option<CommandChild>,
    /// A copy of the config for diagnostics / restart.
    pub config: MCPServerConfig,
    /// Current status (updated by the background event reader task or by stop()).
    pub status: MCPStatus,
}

// ── Host ──────────────────────────────────────────────────────────────────────

/// Central manager for all spawned MCP server processes.
///
/// Stored as Tauri managed state behind `Arc<Mutex<MCPHost>>` (see `mod.rs`).
/// All mutation goes through the `Mutex` guard; background tasks hold only the
/// `AppHandle` and `server_id` — they emit events rather than mutating state
/// directly (to avoid the guard crossing await points).
pub struct MCPHost {
    pub children: DashMap<String, MCPChild>,
}

impl Default for MCPHost {
    fn default() -> Self {
        Self {
            children: DashMap::new(),
        }
    }
}

impl MCPHost {
    // ── spawn ─────────────────────────────────────────────────────────────────

    /// Spawn the MCP server identified by `server_id`.
    ///
    /// If a server with the same ID is already `Running` this returns `Ok(())`
    /// immediately (idempotent).  A previously crashed / stopped entry is
    /// replaced with the new child.
    pub fn spawn(
        &self,
        server_id: String,
        config: MCPServerConfig,
        app: AppHandle,
    ) -> Result<(), String> {
        // Idempotency: skip if already running.
        if let Some(existing) = self.children.get(&server_id) {
            if existing.status == MCPStatus::Running {
                return Ok(());
            }
        }

        // Build the shell command.
        // `env_clear()` is intentionally omitted so the child inherits the
        // system PATH (needed to resolve e.g. `npx`, `uvx`).  We then layer
        // caller-supplied overrides on top via `envs()`.
        let shell_cmd = app
            .shell()
            .command(&config.command)
            .args(&config.args)
            .envs(&config.env);

        // `spawn()` returns `(Receiver<CommandEvent>, CommandChild)`.
        let (mut rx, child) = shell_cmd
            .spawn()
            .map_err(|e| format!("failed to spawn MCP server '{server_id}': {e}"))?;

        // Insert the child into the map before launching the reader task so
        // `status()` and `list_running()` see it immediately.
        self.children.insert(
            server_id.clone(),
            MCPChild {
                child: Some(child),
                config,
                status: MCPStatus::Running,
            },
        );

        // Emit initial status event.
        let _ = app.emit(
            "mcp.status",
            &MCPStatusPayload {
                server_id: server_id.clone(),
                status: "running".to_string(),
                exit_code: None,
            },
        );

        // ── Background event consumer ─────────────────────────────────────────
        // Reads `CommandEvent`s from the channel and:
        //   • Emits `mcp.output` for Stdout / Stderr chunks.
        //   • Emits `mcp.status { status:"stopped"|"crashed" }` on termination.
        //
        // The task holds only clones of `server_id` and `app`; it does NOT
        // hold a reference to `self` or the `DashMap`, so it is safe to `await`
        // freely without risking a deadlock on the host lock.
        let id_for_task = server_id.clone();
        let app_for_task = app.clone();

        tauri::async_runtime::spawn(async move {
            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stdout(line) => {
                        let text = String::from_utf8_lossy(&line).into_owned();
                        let _ = app_for_task.emit(
                            "mcp.output",
                            &MCPOutputPayload {
                                server_id: id_for_task.clone(),
                                stream: "stdout".to_string(),
                                data: text,
                            },
                        );
                    }

                    CommandEvent::Stderr(line) => {
                        let text = String::from_utf8_lossy(&line).into_owned();
                        let _ = app_for_task.emit(
                            "mcp.output",
                            &MCPOutputPayload {
                                server_id: id_for_task.clone(),
                                stream: "stderr".to_string(),
                                data: text,
                            },
                        );
                    }

                    CommandEvent::Terminated(payload) => {
                        let exit_code = payload.code;
                        // A zero exit code → "stopped"; anything else → "crashed".
                        // Signal termination (exit_code == None) from our own
                        // `kill()` call also maps to "stopped".
                        let status_str = match exit_code {
                            Some(0) | None => "stopped",
                            Some(_) => "crashed",
                        }
                        .to_string();

                        let _ = app_for_task.emit(
                            "mcp.status",
                            &MCPStatusPayload {
                                server_id: id_for_task.clone(),
                                status: status_str,
                                exit_code,
                            },
                        );

                        // The task ends here; the DashMap entry is left in
                        // place so callers can inspect the last known status.
                        break;
                    }

                    // Error events (e.g. pipe broken) — treat as crash.
                    CommandEvent::Error(msg) => {
                        tracing::warn!(
                            server_id = %id_for_task,
                            "MCP server command error: {msg}"
                        );
                        let _ = app_for_task.emit(
                            "mcp.output",
                            &MCPOutputPayload {
                                server_id: id_for_task.clone(),
                                stream: "stderr".to_string(),
                                data: format!("[orchestra] command error: {msg}"),
                            },
                        );
                    }

                    // `CommandEvent` is `#[non_exhaustive]`; ignore future variants.
                    _ => {}
                }
            }
        });

        Ok(())
    }

    // ── stop ──────────────────────────────────────────────────────────────────

    /// Send a kill signal to the server identified by `server_id`.
    ///
    /// `CommandChild::kill(self)` consumes the value, so we `take()` it out of
    /// the `Option` wrapper.  The entry remains in the DashMap with
    /// `child: None` and `status: Stopped` until the next `spawn()` replaces it.
    ///
    /// The background reader task will detect the `Terminated` event and emit
    /// `mcp.status { status:"stopped" }` on the event bus.
    pub fn stop(&self, server_id: &str) -> Result<(), String> {
        let mut entry = self
            .children
            .get_mut(server_id)
            .ok_or_else(|| format!("MCP server '{server_id}' not found"))?;

        if entry.status != MCPStatus::Running {
            return Err(format!(
                "MCP server '{server_id}' is not running (current status: {})",
                entry.status
            ));
        }

        // Take the CommandChild out of the Option (consumes it for kill()).
        let child = entry
            .child
            .take()
            .ok_or_else(|| format!("MCP server '{server_id}' has no active child handle"))?;

        child
            .kill()
            .map_err(|e| format!("failed to kill MCP server '{server_id}': {e}"))?;

        entry.status = MCPStatus::Stopped;

        Ok(())
    }

    // ── status ────────────────────────────────────────────────────────────────

    /// Return the current `MCPStatus` of `server_id`, or `Stopped` if unknown.
    pub fn status(&self, server_id: &str) -> MCPStatus {
        self.children
            .get(server_id)
            .map(|e| e.status.clone())
            .unwrap_or(MCPStatus::Stopped)
    }

    // ── list_running ──────────────────────────────────────────────────────────

    /// Return a snapshot of all tracked servers and their current status.
    ///
    /// Includes servers that have stopped or crashed (not just running ones) so
    /// the UI can merge this data with the persisted config for a complete picture.
    pub fn list_running(&self) -> Vec<MCPServerStatus> {
        self.children
            .iter()
            .map(|entry| MCPServerStatus {
                server_id: entry.key().clone(),
                status: entry.value().status.to_string(),
            })
            .collect()
    }

    // ── kill_all ──────────────────────────────────────────────────────────────

    /// Kill every running server.  Called on app shutdown.
    ///
    /// Errors from individual kills are logged but do not abort the loop.
    pub fn kill_all(&self) {
        for mut entry in self.children.iter_mut() {
            if entry.status == MCPStatus::Running {
                // Take the child to satisfy `kill(self)`.
                if let Some(child) = entry.child.take() {
                    if let Err(e) = child.kill() {
                        tracing::warn!(
                            server_id = %entry.key(),
                            "kill_all: failed to kill MCP server: {e}"
                        );
                    } else {
                        entry.status = MCPStatus::Stopped;
                    }
                }
            }
        }
    }
}
