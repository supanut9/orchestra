#![allow(unused_variables, dead_code)]
//! IPC command stubs.
//!
//! Each `#[tauri::command]` function here corresponds 1-to-1 with a typed
//! wrapper in `apps/desktop/src/lib/ipc/commands.ts`. The contract is locked
//! at scaffold time so Lane A, B, and C can develop in parallel against it.
//!
//! Implementations are TODO — each stub returns a sensible default or `Ok(())`.

use serde::{Deserialize, Serialize};

// ── Shared payload types (mirrors TypeScript types in ipc/types.ts) ─────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub path: String,
    pub opened_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub kind: String, // "file" | "directory"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileNode>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Service {
    pub id: String,
    pub name: String,
    pub command: String,
    pub cwd: String,
    pub status: String,
    pub pty_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtySpawnOptions {
    pub label: String,
    pub cwd: String,
    pub cmd: Option<String>,
    pub args: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pty {
    pub id: String,
    pub label: String,
    pub cwd: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PtyOwner {
    User,
    Agent { session_id: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub branch: String,
    pub modified: Vec<String>,
    pub untracked: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryRecord {
    pub id: String,
    pub scope: String,
    pub content: String,
    pub embedding: Option<Vec<f32>>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryQueryOptions {
    pub query: String,
    pub scope: Option<String>,
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryInsertPayload {
    pub scope: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Lane {
    pub id: String,
    pub goal: String,
    pub status: String,
    pub worktree_path: String,
    pub pty_id: Option<String>,
    pub agent_session_id: Option<String>,
    pub created_at: String,
}

// ── Command stubs ────────────────────────────────────────────────────────────

// -- Workspace ----------------------------------------------------------------

#[tauri::command]
pub async fn open_workspace(path: String) -> Result<Workspace, String> {
    // TODO Lane A: open folder, persist to tauri-plugin-store
    let name = std::path::Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("workspace")
        .to_string();
    Ok(Workspace {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        path,
        opened_at: chrono_now(),
    })
}

// -- File system --------------------------------------------------------------

#[tauri::command]
pub async fn list_files(_path: String) -> Result<Vec<FileNode>, String> {
    // TODO Lane A: walk directory with ignore rules
    Ok(vec![])
}

#[tauri::command]
pub async fn read_file(_path: String) -> Result<String, String> {
    // TODO Lane A: read via tauri-plugin-fs or std::fs
    Ok(String::new())
}

#[tauri::command]
pub async fn write_file(_path: String, _content: String) -> Result<(), String> {
    // TODO Lane A: write via tauri-plugin-fs or std::fs
    Ok(())
}

// -- Services -----------------------------------------------------------------

#[tauri::command]
pub async fn parse_services(_workspace_path: String) -> Result<Vec<Service>, String> {
    // TODO Lane B: parse docker-compose.yml / Procfile / orchestra.yaml
    Ok(vec![])
}

#[tauri::command]
pub async fn start_service(_service_id: String) -> Result<(), String> {
    // TODO Lane B: spawn via PTY manager
    Ok(())
}

#[tauri::command]
pub async fn stop_service(_service_id: String) -> Result<(), String> {
    // TODO Lane B: kill PTY
    Ok(())
}

// -- PTY ----------------------------------------------------------------------

#[tauri::command]
pub async fn pty_spawn(options: PtySpawnOptions) -> Result<Pty, String> {
    // TODO Lane B: portable-pty spawn
    Ok(Pty {
        id: uuid::Uuid::new_v4().to_string(),
        label: options.label,
        cwd: options.cwd,
        status: "idle".to_string(),
    })
}

#[tauri::command]
pub async fn pty_write(_pty_id: String, _data: String) -> Result<(), String> {
    // TODO Lane B: write bytes to PTY master
    Ok(())
}

#[tauri::command]
pub async fn pty_resize(_pty_id: String, _cols: u16, _rows: u16) -> Result<(), String> {
    // TODO Lane B: resize PTY
    Ok(())
}

#[tauri::command]
pub async fn pty_kill(_pty_id: String) -> Result<(), String> {
    // TODO Lane B: kill PTY process
    Ok(())
}

#[tauri::command]
pub async fn pty_claim(_pty_id: String, _owner: PtyOwner) -> Result<(), String> {
    // TODO Lane B: set PTY owner; broadcast pty.status event
    Ok(())
}

#[tauri::command]
pub async fn pty_attach(_pty_id: String, _reader_id: String) -> Result<(), String> {
    // TODO Lane B: add read-only subscriber to PTY output stream
    Ok(())
}

// -- Git ----------------------------------------------------------------------

#[tauri::command]
pub async fn git_status(repo_path: String) -> Result<GitStatus, String> {
    // TODO Lane C: git2 status
    let _ = repo_path;
    Ok(GitStatus {
        branch: "main".to_string(),
        modified: vec![],
        untracked: vec![],
    })
}

#[tauri::command]
pub async fn git_worktree_add(
    _repo_path: String,
    _branch: String,
    _worktree_path: String,
) -> Result<(), String> {
    // TODO Lane C: git2 worktree add
    Ok(())
}

#[tauri::command]
pub async fn git_worktree_remove(
    _repo_path: String,
    _worktree_path: String,
) -> Result<(), String> {
    // TODO Lane C: git2 worktree remove
    Ok(())
}

// -- Memory -------------------------------------------------------------------

#[tauri::command]
pub async fn memory_query(_options: MemoryQueryOptions) -> Result<Vec<MemoryRecord>, String> {
    // TODO Lane C: sqlite-vec semantic search
    Ok(vec![])
}

#[tauri::command]
pub async fn memory_insert(record: MemoryInsertPayload) -> Result<MemoryRecord, String> {
    // TODO Lane C: insert into sqlite-vec
    let now = chrono_now();
    Ok(MemoryRecord {
        id: uuid::Uuid::new_v4().to_string(),
        scope: record.scope,
        content: record.content,
        embedding: None,
        created_at: now.clone(),
        updated_at: now,
    })
}

// -- Lanes --------------------------------------------------------------------

#[tauri::command]
pub async fn list_lanes() -> Result<Vec<Lane>, String> {
    // TODO Lane C: return from in-memory DashMap
    Ok(vec![])
}

// ── Helpers ──────────────────────────────────────────────────────────────────

fn chrono_now() -> String {
    // Minimal ISO-8601 timestamp without pulling in the chrono crate.
    // Lane C should replace with chrono::Utc::now().to_rfc3339() once chrono is added.
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("1970-01-01T00:00:00Z+{secs}s") // stub — replace with real RFC-3339
}
