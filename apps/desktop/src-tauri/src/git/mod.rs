//! Git worktree management — Lane E (Sprint 2).
//!
//! This module provides Tauri commands for:
//!   - `git_status`          — repository status (branch, HEAD, modified/untracked/staged files)
//!   - `git_worktree_add`    — create a new worktree at `.orchestra/worktrees/<lane-id>`
//!   - `git_worktree_remove` — prune metadata and delete the directory
//!   - `git_worktree_list`   — enumerate all registered worktrees
//!   - `git_worktree_diff`   — per-file diff with hunk detail for the diff viewer
//!   - `git_worktree_merge`  — merge a lane branch back into a target branch
//!
//! Commands are registered in `crate::lib.rs` via `tauri::generate_handler![]`.

pub mod commands;
