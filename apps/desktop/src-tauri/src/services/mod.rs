// Services module — Lane B implementation.
//
// Discovers runnable services in a workspace directory by inspecting
// well-known configuration files and exposes Tauri commands to detect and
// launch them via the PTY manager.

pub mod commands;
pub mod parser;
