//! Tauri IPC commands for the memory subsystem.
//!
//! Each command receives a `workspace_path` string and uses `MemoryState` to
//! open-or-reuse the per-workspace SQLite store located at
//! `<workspace>/.orchestra/memory.sqlite`.

use std::path::PathBuf;

use tauri::State;

use super::store::{MemoryPatch, MemoryQueryOpts, MemoryRecord, MemoryStore, NewMemoryRecord};
use super::MemoryState;

// ── Private helper ────────────────────────────────────────────────────────────

/// Return an existing store for `workspace_path`, or open a new one and cache
/// it in `MemoryState`.
fn get_or_open_store(state: &MemoryState, workspace_path: &str) -> Result<MemoryStore, String> {
    let key = PathBuf::from(workspace_path);
    {
        let stores = state.stores.lock().expect("MemoryState mutex poisoned");
        if let Some(store) = stores.get(&key) {
            return Ok(store.clone());
        }
    }

    let db_path = key.join(".orchestra").join("memory.sqlite");
    let store = MemoryStore::open(&db_path).map_err(|e| e.to_string())?;

    {
        let mut stores = state.stores.lock().expect("MemoryState mutex poisoned");
        // Another thread may have inserted between the two lock acquisitions —
        // prefer the existing one to avoid opening two connections.
        stores.entry(key).or_insert(store.clone());
    }

    Ok(store)
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Eagerly initialise the store for a workspace so that subsequent calls do
/// not pay the open + schema cost.
#[tauri::command]
pub async fn memory_init(
    workspace_path: String,
    state: State<'_, MemoryState>,
) -> Result<(), String> {
    get_or_open_store(&state, &workspace_path)?;
    Ok(())
}

/// Insert a new memory record and return the stored record.
#[tauri::command]
pub async fn memory_insert(
    workspace_path: String,
    record: NewMemoryRecord,
    state: State<'_, MemoryState>,
) -> Result<MemoryRecord, String> {
    let store = get_or_open_store(&state, &workspace_path)?;
    store.insert(record).map_err(|e| e.to_string())
}

/// Query memory records using text search and/or scope filter.
///
/// Uses `LIKE '%text%'` on the `content` column (sqlite-vec ANN search is
/// deferred to Sprint 4).
#[tauri::command]
pub async fn memory_query(
    workspace_path: String,
    opts: MemoryQueryOpts,
    state: State<'_, MemoryState>,
) -> Result<Vec<MemoryRecord>, String> {
    let store = get_or_open_store(&state, &workspace_path)?;
    store.query(opts).map_err(|e| e.to_string())
}

/// List all records for a given scope, newest first.
#[tauri::command]
pub async fn memory_list(
    workspace_path: String,
    scope: String,
    state: State<'_, MemoryState>,
) -> Result<Vec<MemoryRecord>, String> {
    let store = get_or_open_store(&state, &workspace_path)?;
    store.list(&scope).map_err(|e| e.to_string())
}

/// Apply a partial patch to an existing record.
#[tauri::command]
pub async fn memory_update(
    workspace_path: String,
    id: String,
    patch: MemoryPatch,
    state: State<'_, MemoryState>,
) -> Result<MemoryRecord, String> {
    let store = get_or_open_store(&state, &workspace_path)?;
    store.update(&id, patch).map_err(|e| e.to_string())
}

/// Delete a record by id.
#[tauri::command]
pub async fn memory_delete(
    workspace_path: String,
    id: String,
    state: State<'_, MemoryState>,
) -> Result<(), String> {
    let store = get_or_open_store(&state, &workspace_path)?;
    store.delete(&id).map_err(|e| e.to_string())
}
