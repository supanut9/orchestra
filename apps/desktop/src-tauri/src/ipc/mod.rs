#![allow(unused_variables, dead_code)]
//! IPC command stubs for features that haven't shipped yet.
//!
//! Sprint 1 lane modules (`crate::fs`, `crate::pty`, `crate::services`) own
//! their real commands. The stubs here cover git, memory, and lane management
//! which land in Sprint 2.

use serde::{Deserialize, Serialize};


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

#[tauri::command]
pub async fn memory_query(_options: MemoryQueryOptions) -> Result<Vec<MemoryRecord>, String> {
    Ok(vec![])
}

#[tauri::command]
pub async fn memory_insert(record: MemoryInsertPayload) -> Result<MemoryRecord, String> {
    let now = iso_now();
    Ok(MemoryRecord {
        id: uuid::Uuid::new_v4().to_string(),
        scope: record.scope,
        content: record.content,
        embedding: None,
        created_at: now.clone(),
        updated_at: now,
    })
}

#[tauri::command]
pub async fn list_lanes() -> Result<Vec<Lane>, String> {
    Ok(vec![])
}

fn iso_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("1970-01-01T00:00:00Z+{secs}s")
}
