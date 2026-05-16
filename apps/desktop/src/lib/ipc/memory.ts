/**
 * memory.ts — typed Tauri IPC wrappers for the Rust memory backend.
 *
 * All types mirror the Rust serde structs in
 * `src-tauri/src/memory/store.rs` (camelCase ↔ camelCase via serde rename).
 */

import { invoke } from '@tauri-apps/api/core';

// ── Types ─────────────────────────────────────────────────────────────────────

export type Scope = 'project' | 'user' | 'session';

export interface MemoryRecord {
  id: string;
  scope: Scope;
  kind: string;
  content: string;
  metadata: Record<string, unknown>;
  /** ISO-8601 UTC timestamp */
  createdAt: string;
  /** ISO-8601 UTC timestamp */
  updatedAt: string;
}

export interface NewMemoryRecord {
  scope: Scope;
  kind: string;
  content: string;
  metadata?: Record<string, unknown>;
}

/** All fields are optional; only provided fields are updated. */
export interface MemoryPatch {
  content?: string;
  kind?: string;
  metadata?: Record<string, unknown>;
}

export interface MemoryQueryOpts {
  /** LIKE-based full-text search against the `content` column. */
  text?: string;
  scope?: Scope;
  /** Maximum records to return (default 50 on the Rust side). */
  topK?: number;
}

// ── IPC wrappers ──────────────────────────────────────────────────────────────

/**
 * Eagerly open (or reuse) the SQLite store for a workspace.
 * Call this once after the workspace is set to amortise the open cost.
 */
export function memoryInit(workspacePath: string): Promise<void> {
  return invoke('memory_init', { workspacePath });
}

/** Insert a new record and return the stored record (with generated id + timestamps). */
export function memoryInsert(
  workspacePath: string,
  record: NewMemoryRecord,
): Promise<MemoryRecord> {
  return invoke('memory_insert', { workspacePath, record });
}

/** Query records by text and/or scope. Falls back to LIKE search (no ANN yet). */
export function memoryQuery(workspacePath: string, opts: MemoryQueryOpts): Promise<MemoryRecord[]> {
  return invoke('memory_query', { workspacePath, opts });
}

/** List all records for a scope, newest first. */
export function memoryList(workspacePath: string, scope: Scope): Promise<MemoryRecord[]> {
  return invoke('memory_list', { workspacePath, scope });
}

/** Apply a partial patch to an existing record. */
export function memoryUpdate(
  workspacePath: string,
  id: string,
  patch: MemoryPatch,
): Promise<MemoryRecord> {
  return invoke('memory_update', { workspacePath, id, patch });
}

/** Delete a record by id. */
export function memoryDelete(workspacePath: string, id: string): Promise<void> {
  return invoke('memory_delete', { workspacePath, id });
}
