#![allow(dead_code, unused_variables)]
//! File-system watcher — Lane A implementation target.
//!
//! TODO Lane A: use `notify` (v7) to watch the open workspace root
//! and emit `fs.change` Tauri events so the React file tree stays
//! in sync without polling.
