//! File-system module — Lane A implementation.
//!
//! Declares sub-modules for Tauri commands and the notify-rs watcher.
//! `FsState` holds the active watcher handle so it stays alive for the
//! lifetime of the watch subscription.

pub mod commands;
pub mod watcher;

use std::sync::Mutex;

/// Shared state managed by Tauri for the fs module.
///
/// Wrapped in `Mutex` so it can be moved into `tauri::Builder::manage`.
/// The inner `Option` allows us to drop the watcher on `fs_stop_watching`.
pub struct FsState {
    pub watcher: Mutex<Option<notify::RecommendedWatcher>>,
}

impl FsState {
    pub fn new() -> Self {
        Self {
            watcher: Mutex::new(None),
        }
    }
}

impl Default for FsState {
    fn default() -> Self {
        Self::new()
    }
}
