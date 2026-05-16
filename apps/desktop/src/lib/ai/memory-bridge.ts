/**
 * memory-bridge.ts
 *
 * Thin shim that adapts the agent chat flow to the Rust-backed memory IPC
 * (`memory_init`, `memory_insert`, `memory_query`). The DB lives at
 * `<workspace>/.orchestra/memory.sqlite`; the Rust layer handles opening,
 * migrating, and (eventually) ANN search.
 *
 * Without a workspace path we no-op rather than fall back to `:memory:` — a
 * throwaway DB would mislead users into thinking their chats are persisted.
 */

import {
  memoryInit,
  memoryInsert,
  memoryQuery,
  type MemoryRecord,
} from '@/lib/ipc/memory';

const initializedWorkspaces = new Set<string>();
let activeWorkspace: string | null = null;

async function ensureInit(workspacePath: string): Promise<void> {
  if (initializedWorkspaces.has(workspacePath)) return;
  await memoryInit(workspacePath);
  initializedWorkspaces.add(workspacePath);
  activeWorkspace = workspacePath;
}

/**
 * Persist a single conversation turn to the workspace's memory store.
 * Silently no-ops when no workspace is open.
 */
export async function persistConversationTurn(
  workspacePath: string | null | undefined,
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
): Promise<void> {
  if (!workspacePath || !content) return;
  try {
    await ensureInit(workspacePath);
    await memoryInsert(workspacePath, {
      scope: 'session',
      kind: `${role}-message`,
      content,
      metadata: { sessionId, role, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    console.warn('[memory-bridge] persistConversationTurn failed:', err);
  }
}

/**
 * Fetch recent session memories for the workspace, newest first.
 * Returns [] when no workspace is open or on error.
 */
export async function getRecentMemory(
  workspacePath: string | null | undefined,
  topK = 10,
): Promise<MemoryRecord[]> {
  if (!workspacePath) return [];
  try {
    await ensureInit(workspacePath);
    return await memoryQuery(workspacePath, { scope: 'session', topK });
  } catch (err) {
    console.warn('[memory-bridge] getRecentMemory failed:', err);
    return [];
  }
}

/** Forget cached init state — e.g. when closing the app. */
export function closeMemoryBridge(): void {
  initializedWorkspaces.clear();
  activeWorkspace = null;
}

export function getActiveMemoryWorkspace(): string | null {
  return activeWorkspace;
}
