#![allow(dead_code)]
//! PTY manager — Lane B implementation target.
//!
//! TODO Lane B: implement a `PtyManager` using `portable-pty` that:
//!   - Maintains a `DashMap<PtyId, PtyHandle>`
//!   - Streams output bytes over a Tauri "raw payload" channel (avoiding JSON
//!     encoding overhead on hot terminal data)
//!   - Tracks ownership (`PtyOwner::User` | `PtyOwner::Agent { session_id }`)
//!   - Supports `attach` for multiple read-only subscribers (UI tabs + agent)
//!   - Emits `pty.output` and `pty.status` Tauri events

/// Opaque PTY identifier.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct PtyId(pub String);

impl PtyId {
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }
}

impl std::fmt::Display for PtyId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}
