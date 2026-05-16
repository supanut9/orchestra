/**
 * memory-hub.ts — Zustand store for the Memory Hub GUI.
 *
 * Sprint 3: persistence is handled by the Rust backend via Tauri IPC.
 * The old `resolveStore()` / dynamic `@orchestra/memory` import is gone;
 * every read/write goes through `src/lib/ipc/memory.ts`.
 *
 * Graceful degradation: if `memory_init` fails (e.g. the Tauri runtime is not
 * available in a Storybook/JSDOM environment) `storeAvailable` is set to false
 * and the UI shows its "unavailable" banner rather than crashing.
 */

import { create } from 'zustand';
import {
  memoryDelete,
  memoryInit,
  memoryInsert,
  memoryList,
  memoryQuery,
  memoryUpdate,
  type MemoryPatch as IpcMemoryPatch,
  type MemoryRecord as IpcMemoryRecord,
  type MemoryQueryOpts,
  type NewMemoryRecord as IpcNewMemoryRecord,
  type Scope,
} from '../lib/ipc/memory';

// ---------------------------------------------------------------------------
// Re-export public types so feature modules don't import from ipc directly
// ---------------------------------------------------------------------------

export type { Scope } from '../lib/ipc/memory';

export interface MemoryRecord {
  id: string;
  scope: Scope;
  kind: string;
  content: string;
  metadata: Record<string, unknown>;
  /** Normalised to a JS Date for UI convenience. */
  createdAt: Date;
  updatedAt: Date;
}

export interface NewMemoryRecord {
  scope: Scope;
  kind: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export type MemoryRecordPatch = Partial<Pick<MemoryRecord, 'content' | 'kind' | 'metadata'>>;

// ---------------------------------------------------------------------------
// State interface — intentionally identical to Sprint 2 so MemoryHub.tsx
// needs no changes.
// ---------------------------------------------------------------------------

interface MemoryHubState {
  // ── State ─────────────────────────────────────────────────────────────────
  records: MemoryRecord[];
  selectedId: string | null;
  searchQuery: string;
  scopeFilter: Scope | 'all';
  loading: boolean;
  error: string | null;
  storeAvailable: boolean;
  workspacePath: string | null;

  // ── Actions ───────────────────────────────────────────────────────────────

  /** Initialise for a workspace and load records. */
  init: (workspacePath: string | null) => Promise<void>;

  /** Reload records from the backend. */
  refresh: () => Promise<void>;

  /** Select a record for detail view. */
  select: (id: string | null) => void;

  /** Update the search query and re-fetch. */
  setSearch: (q: string) => void;

  /** Change scope filter. */
  setScope: (scope: Scope | 'all') => void;

  /** Insert a new memory record. */
  insert: (rec: NewMemoryRecord) => Promise<void>;

  /** Patch an existing record. */
  update: (id: string, patch: MemoryRecordPatch) => Promise<void>;

  /** Delete a record. */
  remove: (id: string) => Promise<void>;

  clearError: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useMemoryHubStore = create<MemoryHubState>()((set, get) => ({
  records: [],
  selectedId: null,
  searchQuery: '',
  scopeFilter: 'all',
  loading: false,
  error: null,
  storeAvailable: true,
  workspacePath: null,

  init: async (workspacePath) => {
    set({ workspacePath, loading: true, error: null, storeAvailable: true });

    if (!workspacePath) {
      set({ loading: false, storeAvailable: false });
      return;
    }

    try {
      await memoryInit(workspacePath);
    } catch (err) {
      set({ loading: false, storeAvailable: false, error: toMessage(err) });
      return;
    }

    await fetchRecords(workspacePath, get().scopeFilter, get().searchQuery, set);
  },

  refresh: async () => {
    const { workspacePath, scopeFilter, searchQuery, storeAvailable } = get();
    if (!storeAvailable || !workspacePath) return;
    set({ loading: true, error: null });
    await fetchRecords(workspacePath, scopeFilter, searchQuery, set);
  },

  select: (id) => set({ selectedId: id }),

  setSearch: (q) => {
    set({ searchQuery: q });
    const { workspacePath, scopeFilter } = get();
    fetchRecords(workspacePath, scopeFilter, q, set);
  },

  setScope: (scope) => {
    set({ scopeFilter: scope });
    const { workspacePath, searchQuery } = get();
    fetchRecords(workspacePath, scope, searchQuery, set);
  },

  insert: async (rec) => {
    const { workspacePath } = get();
    if (!workspacePath) return;
    set({ loading: true, error: null });
    try {
      const ipcRec: IpcNewMemoryRecord = {
        scope: rec.scope,
        kind: rec.kind,
        content: rec.content,
      };
      if (rec.metadata !== undefined) ipcRec.metadata = rec.metadata;
      await memoryInsert(workspacePath, ipcRec);
      await get().refresh();
    } catch (err) {
      set({ loading: false, error: toMessage(err) });
    }
  },

  update: async (id, patch) => {
    const { workspacePath } = get();
    if (!workspacePath) return;
    set({ loading: true, error: null });
    try {
      const ipcPatch: IpcMemoryPatch = {};
      if (patch.content !== undefined) ipcPatch.content = patch.content;
      if (patch.kind !== undefined) ipcPatch.kind = patch.kind;
      if (patch.metadata !== undefined) ipcPatch.metadata = patch.metadata;
      const updated = await memoryUpdate(workspacePath, id, ipcPatch);
      set((state) => ({
        loading: false,
        records: state.records.map((r) => (r.id === id ? normaliseRecord(updated) : r)),
      }));
    } catch (err) {
      set({ loading: false, error: toMessage(err) });
    }
  },

  remove: async (id) => {
    const { workspacePath } = get();
    if (!workspacePath) return;
    set({ loading: true, error: null });
    try {
      await memoryDelete(workspacePath, id);
      set((state) => ({
        loading: false,
        records: state.records.filter((r) => r.id !== id),
        selectedId: state.selectedId === id ? null : state.selectedId,
      }));
    } catch (err) {
      set({ loading: false, error: toMessage(err) });
    }
  },

  clearError: () => set({ error: null }),
}));

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type SetFn = (
  partial: Partial<MemoryHubState> | ((s: MemoryHubState) => Partial<MemoryHubState>),
) => void;

async function fetchRecords(
  workspacePath: string | null,
  scopeFilter: Scope | 'all',
  searchQuery: string,
  set: SetFn,
): Promise<void> {
  if (!workspacePath) {
    set({ loading: false, records: [], storeAvailable: false });
    return;
  }

  try {
    let raw: IpcMemoryRecord[];

    if (searchQuery.trim()) {
      const opts: MemoryQueryOpts = {
        text: searchQuery,
        topK: 100,
      };
      if (scopeFilter !== 'all') opts.scope = scopeFilter;
      raw = await memoryQuery(workspacePath, opts);
    } else if (scopeFilter !== 'all') {
      raw = await memoryList(workspacePath, scopeFilter);
    } else {
      // Fetch all scopes in parallel and merge, newest first.
      const [project, user, session] = await Promise.all([
        memoryList(workspacePath, 'project'),
        memoryList(workspacePath, 'user'),
        memoryList(workspacePath, 'session'),
      ]);
      raw = [...project, ...user, ...session].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    }

    set({
      records: raw.map(normaliseRecord),
      loading: false,
      storeAvailable: true,
    });
  } catch (err) {
    console.warn('[memory-hub] fetchRecords failed:', err);
    set({ loading: false, records: [], storeAvailable: false, error: toMessage(err) });
  }
}

/** Convert the IPC record (ISO strings) to the store's Date-based shape. */
function normaliseRecord(r: IpcMemoryRecord): MemoryRecord {
  return {
    id: r.id,
    scope: r.scope,
    kind: r.kind,
    content: r.content,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    createdAt: new Date(r.createdAt),
    updatedAt: new Date(r.updatedAt),
  };
}

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
