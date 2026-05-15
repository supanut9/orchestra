//! Tauri commands for file-system operations — Lane A.
//!
//! All struct field names use `camelCase` in serde output to match the
//! TypeScript contract in `src/lib/ipc/types.ts`.

use std::{
    io::Write,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

use super::{watcher, FsState};

// ── Payload types ─────────────────────────────────────────────────────────────

/// Matches `Workspace` in `ipc/types.ts`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub path: String,
    pub opened_at: String,
}

/// Matches `FileNode` in `ipc/types.ts`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub kind: String, // "file" | "directory"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileNode>>,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Directories to skip when listing files.
const SKIP_DIRS: &[&str] = &[
    "node_modules",
    "target",
    "dist",
    ".git",
    ".cache",
    "__pycache__",
    ".next",
    ".nuxt",
    "build",
    ".turbo",
];

fn is_hidden(name: &str) -> bool {
    name.starts_with('.')
}

fn should_skip_dir(name: &str) -> bool {
    SKIP_DIRS.contains(&name)
}

/// ISO-8601 stub timestamp without pulling in `chrono`.
///
/// Lane C will replace this with `chrono::Utc::now().to_rfc3339()` once it
/// adds chrono to Cargo.toml.
fn now_iso() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("1970-01-01T00:00:00Z+{secs}s")
}

/// Hash a string to a stable hex ID (deterministic from path).
fn hash_id(input: &str) -> String {
    // Simple djb2-style hash — no external crate needed.
    let mut h: u64 = 5381;
    for byte in input.bytes() {
        h = h.wrapping_mul(33).wrapping_add(u64::from(byte));
    }
    format!("{h:016x}")
}

/// Recursively list the directory contents.
fn list_dir(
    dir: &Path,
    recursive: bool,
    current_depth: u32,
    max_depth: u32,
) -> Result<Vec<FileNode>, String> {
    let entries = std::fs::read_dir(dir)
        .map_err(|e| format!("read_dir({dir:?}): {e}"))?;

    let mut nodes: Vec<FileNode> = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| format!("dir entry: {e}"))?;
        let file_name = entry.file_name();
        let name = file_name.to_string_lossy();

        // Skip hidden files/dirs.
        if is_hidden(&name) {
            continue;
        }

        let meta = entry
            .metadata()
            .map_err(|e| format!("metadata({name}): {e}"))?;

        let path_str = entry.path().to_string_lossy().into_owned();

        if meta.is_dir() {
            if should_skip_dir(&name) {
                continue;
            }
            let children = if recursive && current_depth < max_depth {
                Some(list_dir(&entry.path(), recursive, current_depth + 1, max_depth)?)
            } else {
                None
            };
            nodes.push(FileNode {
                name: name.into_owned(),
                path: path_str,
                kind: "directory".to_string(),
                children,
            });
        } else {
            nodes.push(FileNode {
                name: name.into_owned(),
                path: path_str,
                kind: "file".to_string(),
                children: None,
            });
        }
    }

    // Directories first, then files; both sorted alphabetically.
    nodes.sort_by(|a, b| {
        let dir_a = a.kind == "directory";
        let dir_b = b.kind == "directory";
        dir_b.cmp(&dir_a).then(a.name.cmp(&b.name))
    });

    Ok(nodes)
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Open a workspace by folder path.
///
/// Returns a `Workspace` with a deterministic ID derived from the path so
/// re-opening the same folder yields the same ID.
#[tauri::command]
pub async fn fs_open_workspace(path: String) -> Result<Workspace, String> {
    let p = Path::new(&path);
    if !p.is_dir() {
        return Err(format!("not a directory: {path}"));
    }
    let name = p
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("workspace")
        .to_string();
    let id = hash_id(&path);
    Ok(Workspace {
        id,
        name,
        path,
        opened_at: now_iso(),
    })
}

/// List files in a directory.
///
/// `recursive` — whether to descend into sub-directories.
/// `max_depth` — maximum recursion depth (defaults to 4 if not specified).
#[tauri::command]
pub async fn fs_list_files(
    path: String,
    recursive: bool,
    max_depth: Option<u32>,
) -> Result<Vec<FileNode>, String> {
    let dir = PathBuf::from(&path);
    if !dir.is_dir() {
        return Err(format!("not a directory: {path}"));
    }
    let depth = max_depth.unwrap_or(4);
    list_dir(&dir, recursive, 0, depth)
}

/// Read a file as UTF-8.  Rejects files larger than 5 MiB.
#[tauri::command]
pub async fn fs_read_file(path: String) -> Result<String, String> {
    const MAX_BYTES: u64 = 5 * 1024 * 1024; // 5 MiB

    let meta = std::fs::metadata(&path).map_err(|e| format!("metadata({path}): {e}"))?;
    if meta.len() > MAX_BYTES {
        return Err(format!(
            "file too large ({} bytes > 5 MiB): {path}",
            meta.len()
        ));
    }
    std::fs::read_to_string(&path).map_err(|e| format!("read_file({path}): {e}"))
}

/// Write a file atomically (write to a sibling temp file, then rename).
#[tauri::command]
pub async fn fs_write_file(path: String, contents: String) -> Result<(), String> {
    let target = PathBuf::from(&path);

    // Ensure parent exists.
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("create_dir_all({parent:?}): {e}"))?;
    }

    // Write to a sibling temp file in the same directory so rename() is atomic
    // on the same filesystem.
    let tmp_path = target.with_extension("orchestra.tmp");
    {
        let mut f = std::fs::File::create(&tmp_path)
            .map_err(|e| format!("create temp file: {e}"))?;
        f.write_all(contents.as_bytes())
            .map_err(|e| format!("write temp file: {e}"))?;
        f.flush().map_err(|e| format!("flush temp file: {e}"))?;
    }

    std::fs::rename(&tmp_path, &target)
        .map_err(|e| format!("rename({tmp_path:?} → {target:?}): {e}"))?;

    Ok(())
}

/// Start watching `path` for file-system changes.
///
/// Emits `fs.change` Tauri events when files are created, modified, removed, or
/// renamed.  Only one watcher is active at a time; calling this again replaces
/// the previous watcher.
#[tauri::command]
pub async fn fs_start_watching(
    path: String,
    app_handle: AppHandle,
    fs_state: State<'_, FsState>,
) -> Result<(), String> {
    let root = PathBuf::from(&path);
    if !root.exists() {
        return Err(format!("path does not exist: {path}"));
    }

    let new_watcher = watcher::build_watcher(root, app_handle)
        .map_err(|e| format!("build_watcher: {e}"))?;

    let mut guard = fs_state.watcher.lock().unwrap();
    // Drop the old watcher (if any) — this stops the previous watch.
    *guard = Some(new_watcher);

    Ok(())
}

/// Stop the active file-system watcher.
#[tauri::command]
pub async fn fs_stop_watching(fs_state: State<'_, FsState>) -> Result<(), String> {
    let mut guard = fs_state.watcher.lock().unwrap();
    *guard = None;
    Ok(())
}
