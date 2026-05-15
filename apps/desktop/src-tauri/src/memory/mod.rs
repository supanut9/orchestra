#![allow(dead_code, unused_variables)]
//! Local memory store — Lane C implementation target.
//!
//! TODO Lane C: implement sqlite-vec backed memory store with:
//!   - Tables: `project_memory`, `user_memory`, `session_memory`
//!   - Semantic search via sqlite-vec vector similarity
//!   - CRUD operations exposed through `crate::ipc::{memory_query, memory_insert}`
//!   - Optional cloud sync (off by default, privacy-first)
//!
//! The `rusqlite` crate is already in Cargo.toml with the "bundled" feature
//! so no system SQLite installation is required.
