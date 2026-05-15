// Tauri commands for service detection and launching.
//
// These commands bridge the service parser with the PTY manager, allowing the
// UI to discover and start all services in a workspace with a single call.

use std::path::PathBuf;
use tauri::{AppHandle, State};

use crate::pty::{PtyState, manager::PtyOwner};

use super::parser::{detect_services, DetectedService};

// ── services_detect ───────────────────────────────────────────────────────────

/// Detect all runnable services in `workspace_path` without starting them.
///
/// Returns a list of `DetectedService` objects the UI renders as service rows
/// in the Service Dashboard.
///
/// TypeScript signature:
/// ```ts
/// invoke<DetectedService[]>('services_detect', { workspacePath })
/// ```
#[tauri::command]
pub fn services_detect(workspace_path: String) -> Result<Vec<DetectedService>, String> {
    let path = PathBuf::from(&workspace_path);

    if !path.exists() {
        return Err(format!("workspace path does not exist: {workspace_path}"));
    }

    if !path.is_dir() {
        return Err(format!("workspace path is not a directory: {workspace_path}"));
    }

    Ok(detect_services(&path))
}

// ── services_run_all ──────────────────────────────────────────────────────────

/// Detect and immediately start **all** services found in `workspace_path`.
///
/// Returns the list of PTY IDs (one per service) in the same order as
/// `services_detect` would return them.  The frontend uses these IDs to open
/// the correct terminal tabs.
///
/// TypeScript signature:
/// ```ts
/// invoke<string[]>('services_run_all', { workspacePath })
/// ```
#[tauri::command]
pub fn services_run_all(
    workspace_path: String,
    state: State<'_, PtyState>,
    app: AppHandle,
) -> Result<Vec<String>, String> {
    let path = PathBuf::from(&workspace_path);

    if !path.exists() {
        return Err(format!("workspace path does not exist: {workspace_path}"));
    }

    let services = detect_services(&path);

    if services.is_empty() {
        return Ok(vec![]);
    }

    let manager = state
        .0
        .lock()
        .map_err(|e| format!("manager lock poisoned: {e}"))?;

    let mut pty_ids = Vec::with_capacity(services.len());

    for svc in services {
        match manager.spawn(
            svc.name.clone(),
            svc.command,
            svc.cwd,
            PtyOwner::User,
            app.clone(),
        ) {
            Ok(id) => pty_ids.push(id),
            Err(e) => {
                tracing::error!("Failed to spawn service '{}': {e}", svc.name);
                // Continue spawning remaining services; don't abort the whole
                // run-all on a single failure.
            }
        }
    }

    Ok(pty_ids)
}

// ── services_run_one ──────────────────────────────────────────────────────────

/// Detect services in `workspace_path` and start the one named `name`.
///
/// Returns the PTY ID of the newly spawned process, or an error if no service
/// with that name was found.
///
/// TypeScript signature:
/// ```ts
/// invoke<string>('services_run_one', { workspacePath, name })
/// ```
#[tauri::command]
pub fn services_run_one(
    workspace_path: String,
    name: String,
    state: State<'_, PtyState>,
    app: AppHandle,
) -> Result<String, String> {
    let path = PathBuf::from(&workspace_path);

    if !path.exists() {
        return Err(format!("workspace path does not exist: {workspace_path}"));
    }

    let services = detect_services(&path);

    let svc = services
        .into_iter()
        .find(|s| s.name == name)
        .ok_or_else(|| format!("no service named '{name}' found in {workspace_path}"))?;

    let manager = state
        .0
        .lock()
        .map_err(|e| format!("manager lock poisoned: {e}"))?;

    manager.spawn(
        svc.name,
        svc.command,
        svc.cwd,
        PtyOwner::User,
        app,
    )
}
