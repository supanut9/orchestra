/**
 * Shared IPC types — the cross-lane contract between the Rust backend
 * and the React frontend. Keep in sync with Rust serde structs in
 * `src-tauri/src/ipc/mod.rs`.
 */

// ── Workspace ──────────────────────────────────────────────────────────────
//
// A workspace is a named collection of project folders. Folders can live
// anywhere on disk; they do NOT have to share a parent. This lets the user
// group e.g. `~/work/auth-server` and `~/personal/notes-app` into a single
// "Side projects" workspace.

/** A single project folder inside a workspace. */
export interface WorkspaceFolder {
  /** Absolute filesystem path. */
  path: string;
  /** Display name (defaults to folder basename, user can rename). */
  name: string;
  /** ISO-8601 — when this folder was added to the workspace. */
  addedAt: string;
}

export interface Workspace {
  id: string;
  /** User-supplied workspace name (e.g. "Microservices Demo"). */
  name: string;
  /** Ordered list of project folders. `folders[0]` is the implicit
   *  "primary" used by features that need a single anchor path (services,
   *  MCP config, memory store, lane worktrees). */
  folders: WorkspaceFolder[];
  /** ISO-8601 — when the workspace itself was created. */
  createdAt: string;
}

/** Helper: get the primary folder path or null if none. */
export function workspacePrimaryPath(ws: Workspace | null): string | null {
  return ws?.folders[0]?.path ?? null;
}

/** Shape returned by the Rust `fs_open_workspace` command — used by the
 *  TS layer as a folder candidate, then incorporated into a Workspace. */
export interface FolderInfo {
  id: string;
  name: string;
  path: string;
  openedAt: string;
}

// ── File System ────────────────────────────────────────────────────────────

export type FileNodeKind = 'file' | 'directory';

export interface FileNode {
  name: string;
  path: string;
  kind: FileNodeKind;
  children?: FileNode[];
}

// ── Services ───────────────────────────────────────────────────────────────

export type ServiceStatus = 'stopped' | 'starting' | 'running' | 'crashed';

export interface Service {
  id: string;
  name: string;
  command: string;
  cwd: string;
  status: ServiceStatus;
  ptyId: string | null;
}

// ── PTY ────────────────────────────────────────────────────────────────────

export type PtyStatus = 'idle' | 'running' | 'exited' | 'crashed';

/**
 * PTY owner — either the human user or an AI agent session.
 */
export type PtyOwner = { kind: 'user' } | { kind: 'agent'; sessionId: string };

export interface Pty {
  id: string;
  label: string;
  cwd: string;
  status: PtyStatus;
  owner: PtyOwner;
}

// ── Lanes ──────────────────────────────────────────────────────────────────

export type LaneStatus = 'pending' | 'active' | 'paused' | 'done' | 'failed';

export interface Lane {
  id: string;
  goal: string;
  status: LaneStatus;
  worktreePath: string;
  ptyId: string | null;
  agentSessionId: string | null;
  createdAt: string; // ISO-8601
}

// Memory types live in `./memory.ts` (real implementation as of Sprint 3).

// ── Agent ──────────────────────────────────────────────────────────────────

export type AgentRole = 'user' | 'assistant' | 'tool';

export interface AgentMessage {
  id: string;
  sessionId: string;
  role: AgentRole;
  content: string;
  createdAt: string; // ISO-8601
}
