pub mod commands;
pub mod schema;
pub mod store;

pub use store::MemoryStore;

use std::path::PathBuf;
use std::sync::Mutex;

/// Tauri-managed state holding per-workspace SQLite connections.
///
/// Register with `.manage(memory::MemoryState::default())` in `lib.rs`.
pub struct MemoryState {
    /// Open stores keyed by absolute workspace path; opened lazily on first use.
    pub stores: Mutex<std::collections::HashMap<PathBuf, MemoryStore>>,
}

impl Default for MemoryState {
    fn default() -> Self {
        Self {
            stores: Mutex::new(Default::default()),
        }
    }
}
