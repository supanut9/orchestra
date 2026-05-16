//! IPC command stubs for features that haven't shipped yet.
//!
//! Memory commands have moved to `crate::memory::commands`.
//! Lane management ships in Sprint 4; the stub lives here in the interim.

use serde::{Deserialize, Serialize};

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

#[tauri::command]
pub async fn list_lanes() -> Result<Vec<Lane>, String> {
    Ok(vec![])
}
