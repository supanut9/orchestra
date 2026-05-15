#![allow(dead_code, unused_variables)]
//! Git worktree management — Lane C implementation target.
//!
//! TODO Lane C: use `git2` to implement:
//!   - `status(repo_path)` → branch + modified + untracked files
//!   - `worktree_add(repo, branch, path)` → creates `.orchestra/worktrees/<lane-id>`
//!   - `worktree_remove(repo, path)` → removes worktree and optional branch
//!
//! Each Lane spawns an isolated worktree so agents can modify files
//! in parallel without conflicting with the main branch or each other.
