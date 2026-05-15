/**
 * Typed wrappers around Tauri `invoke()` matching the Rust command registry
 * in `src-tauri/src/ipc/mod.rs`. Backends are stubbed for now; the contract
 * is locked here for parallel lane development.
 */

import { invoke } from '@tauri-apps/api/core';
import type { Workspace, FileNode, Service, Pty, Lane, MemoryRecord } from './types';

// ── Workspace ──────────────────────────────────────────────────────────────

export function openWorkspace(path: string): Promise<Workspace> {
  return invoke<Workspace>('open_workspace', { path });
}

// ── File System ────────────────────────────────────────────────────────────

export function listFiles(path: string): Promise<FileNode[]> {
  return invoke<FileNode[]>('list_files', { path });
}

export function readFile(path: string): Promise<string> {
  return invoke<string>('read_file', { path });
}

export function writeFile(path: string, content: string): Promise<void> {
  return invoke<void>('write_file', { path, content });
}

// ── Services ───────────────────────────────────────────────────────────────

export function parseServices(workspacePath: string): Promise<Service[]> {
  return invoke<Service[]>('parse_services', { workspacePath });
}

export function startService(serviceId: string): Promise<void> {
  return invoke<void>('start_service', { serviceId });
}

export function stopService(serviceId: string): Promise<void> {
  return invoke<void>('stop_service', { serviceId });
}

// ── PTY ────────────────────────────────────────────────────────────────────

export interface PtySpawnOptions {
  label: string;
  cwd: string;
  cmd?: string;
  args?: string[];
}

export function ptySpawn(options: PtySpawnOptions): Promise<Pty> {
  return invoke<Pty>('pty_spawn', { options });
}

export function ptyWrite(ptyId: string, data: string): Promise<void> {
  return invoke<void>('pty_write', { ptyId, data });
}

export function ptyResize(ptyId: string, cols: number, rows: number): Promise<void> {
  return invoke<void>('pty_resize', { ptyId, cols, rows });
}

export function ptyKill(ptyId: string): Promise<void> {
  return invoke<void>('pty_kill', { ptyId });
}

/**
 * Claim ownership of a PTY (user or agent). Used by Lane C's AI runtime
 * when an agent needs to execute shell commands.
 */
export function ptyClaim(
  ptyId: string,
  owner: { kind: 'user' } | { kind: 'agent'; sessionId: string },
): Promise<void> {
  return invoke<void>('pty_claim', { ptyId, owner });
}

/**
 * Attach a read-only subscriber (reader) to a PTY stream.
 * Returns the reader ID used to identify the subscription.
 */
export function ptyAttach(ptyId: string, readerId: string): Promise<void> {
  return invoke<void>('pty_attach', { ptyId, readerId });
}

// ── Git ────────────────────────────────────────────────────────────────────

export interface GitStatus {
  branch: string;
  modified: string[];
  untracked: string[];
}

export function gitStatus(repoPath: string): Promise<GitStatus> {
  return invoke<GitStatus>('git_status', { repoPath });
}

export function gitWorktreeAdd(
  repoPath: string,
  branch: string,
  worktreePath: string,
): Promise<void> {
  return invoke<void>('git_worktree_add', { repoPath, branch, worktreePath });
}

export function gitWorktreeRemove(repoPath: string, worktreePath: string): Promise<void> {
  return invoke<void>('git_worktree_remove', { repoPath, worktreePath });
}

// ── Memory ─────────────────────────────────────────────────────────────────

export interface MemoryQueryOptions {
  query: string;
  scope?: 'project' | 'user' | 'session';
  limit?: number;
}

export function memoryQuery(options: MemoryQueryOptions): Promise<MemoryRecord[]> {
  return invoke<MemoryRecord[]>('memory_query', { options });
}

export function memoryInsert(
  record: Omit<MemoryRecord, 'id' | 'embedding' | 'createdAt' | 'updatedAt'>,
): Promise<MemoryRecord> {
  return invoke<MemoryRecord>('memory_insert', { record });
}

// ── Lanes ──────────────────────────────────────────────────────────────────

/** Convenience: get all active lanes (backed by in-memory state on the Rust side) */
export function listLanes(): Promise<Lane[]> {
  return invoke<Lane[]>('list_lanes');
}
