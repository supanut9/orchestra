/**
 * Shared IPC types — the cross-lane contract between the Rust backend
 * and the React frontend. Keep in sync with Rust serde structs in
 * `src-tauri/src/ipc/mod.rs`.
 */

// ── Workspace ──────────────────────────────────────────────────────────────

export interface Workspace {
  id: string;
  name: string;
  path: string;
  openedAt: string; // ISO-8601
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
