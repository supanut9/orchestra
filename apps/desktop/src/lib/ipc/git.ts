/**
 * Git IPC layer — Lane E (Sprint 2).
 *
 * Typed wrappers over `invoke()` for every git_* Tauri command defined in
 * `src-tauri/src/git/commands.rs`.
 *
 * All commands take a `repoPath` first argument that is the absolute path to
 * the git repository root.
 */

import { invoke } from '@tauri-apps/api/core';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Summary of a repository's working-tree state.
 * Mirrors the Rust `GitStatusInfo` struct.
 */
export interface GitStatusInfo {
  /** Current branch short name (e.g. "main"). */
  branch: string;
  /** Short (8-char) HEAD commit SHA. */
  head: string;
  /** True when the working tree and index are both clean. */
  isClean: boolean;
  /** Relative paths of files with unstaged modifications. */
  modified: string[];
  /** Relative paths of untracked files. */
  untracked: string[];
  /** Relative paths of staged files (index vs HEAD). */
  staged: string[];
}

/**
 * Information about a registered git worktree.
 * Mirrors the Rust `WorktreeInfo` struct.
 */
export interface WorktreeInfo {
  /** Lane ID — also the worktree name as git knows it. */
  id: string;
  /** Absolute path to the worktree directory. */
  path: string;
  /** Full ref name for the branch checked out in this worktree (e.g. "refs/heads/orchestra/lane-abc123"). */
  branch: string;
}

/** A single diff line within a hunk. */
export interface DiffLine {
  /** "add" | "del" | "context" */
  type: 'add' | 'del' | 'context';
  text: string;
}

/**
 * A contiguous block of changed lines within a file.
 * Mirrors the Rust `DiffHunkEntry` struct.
 */
export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

/**
 * Per-file diff result.
 * Mirrors the Rust `FileDiff` struct.
 */
export interface FileDiff {
  /** Relative path inside the worktree. */
  path: string;
  /** "added" | "modified" | "deleted" | "renamed" */
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  /** Number of added lines. */
  additions: number;
  /** Number of deleted lines. */
  deletions: number;
  hunks: DiffHunk[];
}

// ── Commands ──────────────────────────────────────────────────────────────────

/**
 * Return branch name, short HEAD SHA, and working-tree file status for the
 * repository at `repoPath`.
 */
export function gitStatus(repoPath: string): Promise<GitStatusInfo> {
  return invoke<GitStatusInfo>('git_status', { repoPath });
}

/**
 * Create a new git worktree at `<repoPath>/.orchestra/worktrees/<laneId>`
 * on a freshly created branch named `branchName` pointing at HEAD.
 *
 * Semantically equivalent to:
 *   `git worktree add -b <branchName> .orchestra/worktrees/<laneId> HEAD`
 */
export function gitWorktreeAdd(
  repoPath: string,
  laneId: string,
  branchName: string,
): Promise<WorktreeInfo> {
  return invoke<WorktreeInfo>('git_worktree_add', { repoPath, laneId, branchName });
}

/**
 * Remove the worktree for `laneId`: prune git's worktree metadata and
 * recursively delete the directory on disk.
 */
export function gitWorktreeRemove(repoPath: string, laneId: string): Promise<void> {
  return invoke<void>('git_worktree_remove', { repoPath, laneId });
}

/**
 * List all worktrees registered in the repository at `repoPath`.
 */
export function gitWorktreeList(repoPath: string): Promise<WorktreeInfo[]> {
  return invoke<WorktreeInfo[]>('git_worktree_list', { repoPath });
}

/**
 * Return per-file diffs (with full hunk detail) for the worktree belonging to
 * `laneId`.  The diff is between the worktree's HEAD and its working directory
 * so it shows all changes the agent has made since the branch was created.
 *
 * Poll this every few seconds while the lane is running to keep the diff
 * summary panel up to date.
 */
export function gitWorktreeDiff(repoPath: string, laneId: string): Promise<FileDiff[]> {
  return invoke<FileDiff[]>('git_worktree_diff', { repoPath, laneId });
}

/**
 * Merge the lane branch for `laneId` into `targetBranch` (typically "main").
 *
 * On conflict, the command returns a rejected Promise with an error message.
 * Conflict resolution UI is planned for Sprint 3.
 */
export function gitWorktreeMerge(
  repoPath: string,
  laneId: string,
  targetBranch: string,
): Promise<void> {
  return invoke<void>('git_worktree_merge', { repoPath, laneId, targetBranch });
}
