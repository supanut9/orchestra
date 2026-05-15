// PTY manager — core of Lane B's "shared PTY" feature.
//
// Each spawned PTY gets a UUID, a human-readable label, an owner (user or AI
// agent), and a background reader task that streams output bytes to the Tauri
// event bus as base64-encoded JSON events.
//
// Event bus topics (cross-lane contract):
//   `pty.output`  — { ptyId, dataBase64 }
//   `pty.status`  — { ptyId, status, exitCode }

use std::{
    io::{Read, Write},
    path::PathBuf,
    sync::{Arc, Mutex},
    time::SystemTime,
};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use dashmap::DashMap;
use portable_pty::{native_pty_system, Child, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

// ── Owner ─────────────────────────────────────────────────────────────────────

/// Who currently owns a PTY.
/// Serialises to TypeScript: `{kind:"user"} | {kind:"agent", sessionId:string}`
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PtyOwner {
    User,
    Agent {
        #[serde(rename = "sessionId")]
        session_id: String,
    },
}

// ── Event payloads ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyOutputPayload {
    pub pty_id: String,
    pub data_base64: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyStatusPayload {
    pub pty_id: String,
    pub status: String,
    pub exit_code: Option<i32>,
}

// ── Serialisable summary ──────────────────────────────────────────────────────

/// Compact, serialisable view of a PTY — used by `pty_list` to render tabs.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyInfo {
    pub id: String,
    pub label: String,
    pub cwd: String,
    pub owner: PtyOwner,
    pub status: String,
    pub created_at_secs: u64,
}

// ── Internal handle ───────────────────────────────────────────────────────────

/// Full runtime state for a single PTY.  Not serialisable — see `PtyInfo`.
pub struct PtyHandle {
    pub id: String,
    pub label: String,
    pub owner: PtyOwner,
    /// Write half of the master PTY (sends keystrokes into the child).
    /// Wrapped in a Mutex so PtyHandle is Sync (Box<dyn Write + Send> alone is not).
    pub writer: Mutex<Box<dyn Write + Send>>,
    /// The child process running inside the PTY slave.
    pub child: Box<dyn Child + Send + Sync>,
    pub cwd: PathBuf,
    pub created_at: SystemTime,
    /// Current status string ("running" | "exited" | "crashed").
    pub status: String,
}

// ── Manager ───────────────────────────────────────────────────────────────────

/// Manages the pool of live PTYs.
///
/// Internally stores handles in an `Arc<DashMap<…>>` so the `Arc` clone can
/// be sent into background reader tasks without requiring `PtyHandle: Clone`.
pub struct PtyManager {
    ptys: Arc<DashMap<String, PtyHandle>>,
}

impl Default for PtyManager {
    fn default() -> Self {
        Self::new()
    }
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            ptys: Arc::new(DashMap::new()),
        }
    }

    /// Spawn a new PTY running `command` (argv: `command[0]` is the binary).
    ///
    /// Starts a `tokio::task::spawn_blocking` reader that emits `pty.output`
    /// events until EOF, then emits `pty.status { status:"exited" }`.
    ///
    /// Returns the new PTY's UUID string.
    pub fn spawn(
        &self,
        label: String,
        command: Vec<String>,
        cwd: PathBuf,
        owner: PtyOwner,
        app_handle: AppHandle,
    ) -> Result<String, String> {
        if command.is_empty() {
            return Err("command must not be empty".to_string());
        }

        let pty_id = Uuid::new_v4().to_string();

        // Open the PTY pair.
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: 30,
                cols: 100,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("openpty failed: {e}"))?;

        // Build the command.
        let mut cmd = CommandBuilder::new(&command[0]);
        for arg in &command[1..] {
            cmd.arg(arg);
        }
        cmd.cwd(&cwd);

        // Spawn the child process inside the PTY slave.
        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("spawn_command failed: {e}"))?;

        // Take the write half.  Can only be done once per master.
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("take_writer failed: {e}"))?;

        // Clone the read half for the background reader task.
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("try_clone_reader failed: {e}"))?;

        // Insert the handle into the shared map *before* spawning the reader
        // task so it is immediately visible from `pty_list`.
        self.ptys.insert(
            pty_id.clone(),
            PtyHandle {
                id: pty_id.clone(),
                label,
                owner,
                writer: Mutex::new(writer),
                child,
                cwd,
                created_at: SystemTime::now(),
                status: "running".to_string(),
            },
        );

        // Clone the Arc<DashMap> and AppHandle for the background task.
        let id_for_task = pty_id.clone();
        let ptys_arc = Arc::clone(&self.ptys);
        let app_for_task = app_handle.clone();

        tokio::task::spawn_blocking(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break, // EOF — process exited
                    Ok(n) => {
                        let encoded = BASE64.encode(&buf[..n]);
                        let _ = app_for_task.emit(
                            "pty.output",
                            &PtyOutputPayload {
                                pty_id: id_for_task.clone(),
                                data_base64: encoded,
                            },
                        );
                    }
                    Err(_) => break, // broken pipe or PTY killed
                }
            }

            // Wait for the child and capture its exit code.
            let exit_code = if let Some(mut handle) = ptys_arc.get_mut(&id_for_task) {
                let code = handle.child.wait().ok().map(|s| {
                    if s.success() {
                        0i32
                    } else {
                        s.exit_code() as i32
                    }
                });
                handle.status = "exited".to_string();
                code
            } else {
                None
            };

            let _ = app_for_task.emit(
                "pty.status",
                &PtyStatusPayload {
                    pty_id: id_for_task,
                    status: "exited".to_string(),
                    exit_code,
                },
            );
        });

        Ok(pty_id)
    }

    /// Write raw bytes into the PTY master (keystrokes / paste).
    ///
    /// `data` has already been base64-decoded by the command layer.
    pub fn write(&self, pty_id: &str, data: &[u8]) -> Result<(), String> {
        let handle = self
            .ptys
            .get(pty_id)
            .ok_or_else(|| format!("pty {pty_id} not found"))?;

        let mut writer = handle
            .writer
            .lock()
            .map_err(|e| format!("writer lock poisoned: {e}"))?;
        writer
            .write_all(data)
            .map_err(|e| format!("pty_write failed: {e}"))?;
        writer
            .flush()
            .map_err(|e| format!("pty_write flush failed: {e}"))?;
        Ok(())
    }

    /// Resize the PTY to the given character-cell dimensions.
    ///
    /// NOTE: The master handle was moved into the reader task so `MasterPty::resize`
    /// cannot be called here without a larger refactor (store the master in an
    /// `Arc<Mutex<Box<dyn MasterPty>>>`).  This is a known Sprint 1 limitation;
    /// resize emits a debug log and returns `Ok(())`.  The shell will re-query
    /// the terminal size on the next SIGWINCH if the OS delivers one.
    pub fn resize(&self, pty_id: &str, rows: u16, cols: u16) -> Result<(), String> {
        tracing::debug!(
            %pty_id, rows, cols,
            "pty_resize: master not retained; resize is a no-op in this build"
        );
        Ok(())
    }

    /// Kill the process in `pty_id`, remove it from the pool, and emit
    /// `pty.status { status:"exited" }`.
    pub fn kill(&self, pty_id: &str, app_handle: &AppHandle) -> Result<(), String> {
        let (_, mut handle) = self
            .ptys
            .remove(pty_id)
            .ok_or_else(|| format!("pty {pty_id} not found"))?;

        // Kill may fail if the process already exited — that is fine.
        let _ = handle.child.kill();

        let _ = app_handle.emit(
            "pty.status",
            &PtyStatusPayload {
                pty_id: pty_id.to_string(),
                status: "exited".to_string(),
                exit_code: Some(-1),
            },
        );

        Ok(())
    }

    /// Transfer ownership of a PTY to `new_owner`.
    pub fn claim(&self, pty_id: &str, new_owner: PtyOwner) -> Result<(), String> {
        let mut handle = self
            .ptys
            .get_mut(pty_id)
            .ok_or_else(|| format!("pty {pty_id} not found"))?;

        handle.owner = new_owner;
        Ok(())
    }

    /// Return a serialisable snapshot of all live PTYs for the tab bar.
    pub fn list(&self) -> Vec<PtyInfo> {
        self.ptys
            .iter()
            .map(|entry| {
                let h = entry.value();
                PtyInfo {
                    id: h.id.clone(),
                    label: h.label.clone(),
                    cwd: h.cwd.to_string_lossy().to_string(),
                    owner: h.owner.clone(),
                    status: h.status.clone(),
                    created_at_secs: h
                        .created_at
                        .duration_since(SystemTime::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs(),
                }
            })
            .collect()
    }
}
