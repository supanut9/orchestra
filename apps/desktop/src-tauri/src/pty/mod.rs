// PTY module — Lane B implementation.
//
// Provides a portable, cross-platform PTY manager built on Wezterm's
// `portable-pty` crate. Each spawned PTY is identified by a UUID string,
// tracked in a `DashMap`, and streams its output to the Tauri event bus as
// base64-encoded chunks on the `pty.output` topic.

pub mod commands;
pub mod manager;

pub use manager::PtyManager;

use std::sync::{Arc, Mutex};

/// Tauri managed state that wraps the PTY manager behind an `Arc<Mutex<…>>`.
///
/// Registered via `tauri::Builder::manage(PtyState::default())` in `lib.rs`.
pub struct PtyState(pub Arc<Mutex<PtyManager>>);

impl Default for PtyState {
    fn default() -> Self {
        Self(Arc::new(Mutex::new(PtyManager::new())))
    }
}
