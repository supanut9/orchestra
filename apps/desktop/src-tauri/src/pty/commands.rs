// Tauri commands for the PTY manager.
//
// Each function here is registered with `#[tauri::command]` and must be added
// to the `invoke_handler` list in `lib.rs`.
//
// Naming convention: `pty_<verb>` maps 1-to-1 to the TypeScript wrapper in
// `src/lib/ipc/pty.ts`.

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use std::path::PathBuf;
use tauri::{AppHandle, State};

use super::{
    PtyState,
    manager::{PtyInfo, PtyOwner},
};

// ── pty_spawn ─────────────────────────────────────────────────────────────────

/// Spawn a new PTY running `command` (argv) in `cwd` with an initial `owner`.
///
/// Returns the UUID string identifying the new PTY.
///
/// TypeScript signature:
/// ```ts
/// invoke<string>('pty_spawn', { label, command, cwd, owner })
/// ```
#[tauri::command]
pub fn pty_spawn(
    label: String,
    command: Vec<String>,
    cwd: String,
    owner: PtyOwner,
    env: Option<std::collections::HashMap<String, String>>,
    state: State<'_, PtyState>,
    app: AppHandle,
) -> Result<String, String> {
    let manager = state
        .0
        .lock()
        .map_err(|e| format!("manager lock poisoned: {e}"))?;

    manager.spawn(
        label,
        command,
        PathBuf::from(cwd),
        owner,
        env.unwrap_or_default(),
        app,
    )
}

// ── pty_write ─────────────────────────────────────────────────────────────────

/// Write user input (keystrokes) into a PTY.
///
/// `data` is **base64-encoded** UTF-8 / raw bytes so that control characters
/// (arrow keys, Ctrl+C, etc.) survive the JSON transport without mangling.
///
/// TypeScript signature:
/// ```ts
/// invoke<void>('pty_write', { ptyId, data })
/// ```
#[tauri::command]
pub fn pty_write(
    pty_id: String,
    data: String,
    state: State<'_, PtyState>,
) -> Result<(), String> {
    let bytes = BASE64
        .decode(&data)
        .map_err(|e| format!("base64 decode error: {e}"))?;

    let manager = state
        .0
        .lock()
        .map_err(|e| format!("manager lock poisoned: {e}"))?;

    manager.write(&pty_id, &bytes)
}

// ── pty_resize ────────────────────────────────────────────────────────────────

/// Resize a PTY to the given dimensions (character cell counts).
///
/// Called by the xterm.js `FitAddon` when the containing element changes size.
///
/// TypeScript signature:
/// ```ts
/// invoke<void>('pty_resize', { ptyId, rows, cols })
/// ```
#[tauri::command]
pub fn pty_resize(
    pty_id: String,
    rows: u16,
    cols: u16,
    state: State<'_, PtyState>,
) -> Result<(), String> {
    let manager = state
        .0
        .lock()
        .map_err(|e| format!("manager lock poisoned: {e}"))?;

    manager.resize(&pty_id, rows, cols)
}

// ── pty_kill ──────────────────────────────────────────────────────────────────

/// Kill the process in `pty_id` and remove it from the manager.
///
/// Emits `pty.status { ptyId, status:"exited" }` on the Tauri event bus.
///
/// TypeScript signature:
/// ```ts
/// invoke<void>('pty_kill', { ptyId })
/// ```
#[tauri::command]
pub fn pty_kill(
    pty_id: String,
    state: State<'_, PtyState>,
    app: AppHandle,
) -> Result<(), String> {
    let manager = state
        .0
        .lock()
        .map_err(|e| format!("manager lock poisoned: {e}"))?;

    manager.kill(&pty_id, &app)
}

// ── pty_claim ─────────────────────────────────────────────────────────────────

/// Transfer ownership of a PTY to `owner`.
///
/// Used by Lane C when an AI agent starts executing shell commands in a PTY
/// that was previously owned by the user (or another agent).
///
/// TypeScript signature:
/// ```ts
/// invoke<void>('pty_claim', { ptyId, owner })
/// ```
#[tauri::command]
pub fn pty_claim(
    pty_id: String,
    owner: PtyOwner,
    state: State<'_, PtyState>,
    app: AppHandle,
) -> Result<(), String> {
    let manager = state
        .0
        .lock()
        .map_err(|e| format!("manager lock poisoned: {e}"))?;

    manager.claim(&pty_id, owner, &app)
}

// ── pty_list ──────────────────────────────────────────────────────────────────

/// Return a serialisable list of all live PTYs.
///
/// Called by `TerminalGrid` on mount and after PTY status changes to refresh
/// the tab bar.
///
/// TypeScript signature:
/// ```ts
/// invoke<PtyInfo[]>('pty_list')
/// ```
#[tauri::command]
pub fn pty_list(state: State<'_, PtyState>) -> Result<Vec<PtyInfo>, String> {
    let manager = state
        .0
        .lock()
        .map_err(|e| format!("manager lock poisoned: {e}"))?;

    Ok(manager.list())
}

// ── pty_replay ────────────────────────────────────────────────────────────────

/// Return the recent output buffer for a PTY as a base64 string.
/// Called by a `Terminal` component on mount to render bytes that were
/// emitted before the component could subscribe to the live `pty.output`
/// event stream.
///
/// TypeScript signature:
/// ```ts
/// invoke<string>('pty_replay', { ptyId })  // → base64-encoded bytes
/// ```
#[tauri::command]
pub fn pty_replay(pty_id: String, state: State<'_, PtyState>) -> Result<String, String> {
    let manager = state
        .0
        .lock()
        .map_err(|e| format!("manager lock poisoned: {e}"))?;
    let bytes = manager.replay(&pty_id)?;
    Ok(BASE64.encode(&bytes))
}
