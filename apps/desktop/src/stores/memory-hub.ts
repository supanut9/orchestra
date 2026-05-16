/**
 * memory-hub.ts — Zustand store for the Memory Hub GUI.
 *
 * Delegates persistence to the existing memory-bridge.ts (frozen). Adds
 * UI-level concerns: scope filtering, search, selection, and CRUD that the
 * bridge itself doesn't expose directly.
 *
 * Graceful degradation: if the bridge returns null/empty because better-sqlite3
 * is unavailable, `storeAvailable` is set to false and the UI shows a banner
 * rather than crashing.
 */

import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types mirroring @orchestra/memory (re-declared to avoid Node-only import)
// ---------------------------------------------------------------------------

export type Scope = 'project' | 'user' | 'session';

export interface MemoryRecord {
  id: string;
  scope: Scope;
  kind: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  embedding?: number[];
}

export interface NewMemoryRecord {
  scope: Scope;
  kind: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export type MemoryRecordPatch = Partial<Pick<MemoryRecord, 'content' | 'kind' | 'metadata'>>;

// ---------------------------------------------------------------------------
// State interface
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

  /** Reload records from the bridge. */
  refresh: () => Promise<void>;

  /** Select a record for detail view. */
  select: (id: string | null) => void;

  /** Update the search query and re-filter. */
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
    await fetchRecords(workspacePath, get().scopeFilter, get().searchQuery, set);
  },

  refresh: async () => {
    const { workspacePath, scopeFilter, searchQuery } = get();
    set({ loading: true, error: null });
    await fetchRecords(workspacePath, scopeFilter, searchQuery, set);
  },

  select: (id) => set({ selectedId: id }),

  setSearch: (q) => {
    set({ searchQuery: q });
    // Re-filter client-side from cached records when not empty, or re-fetch
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
    set({ loading: true, error: null });
    try {
      const store = await resolveStore(workspacePath);
      if (!store) {
        set({ loading: false, storeAvailable: false });
        return;
      }
      await store.insert(rec);
      await get().refresh();
    } catch (err) {
      set({ loading: false, error: toMessage(err) });
    }
  },

  update: async (id, patch) => {
    const { workspacePath } = get();
    set({ loading: true, error: null });
    try {
      const store = await resolveStore(workspacePath);
      if (!store) {
        set({ loading: false, storeAvailable: false });
        return;
      }
      const updated = await store.update(id, patch);
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
    set({ loading: true, error: null });
    try {
      const store = await resolveStore(workspacePath);
      if (!store) {
        set({ loading: false, storeAvailable: false });
        return;
      }
      await store.delete(id);
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

async function resolveStore(_workspacePath: string | null): Promise<any | null> {
  // @orchestra/memory depends on better-sqlite3 (native node addon) and can't
  // be bundled into the Tauri WebView. The Memory Hub UI degrades to its
  // "unavailable" banner. Real persistence lands in Sprint 3 via a Rust-side
  // memory IPC module.
  return null;
}

type SetFn = (
  partial: Partial<MemoryHubState> | ((s: MemoryHubState) => Partial<MemoryHubState>),
) => void;

async function fetchRecords(
  workspacePath: string | null,
  scopeFilter: Scope | 'all',
  searchQuery: string,
  set: SetFn,
): Promise<void> {
  try {
    const store = await resolveStore(workspacePath);
    if (!store) {
      set({ loading: false, records: [], storeAvailable: false });
      return;
    }

    let raw: any[];
    if (searchQuery.trim()) {
      raw = await store.query({
        text: searchQuery,
        scope: scopeFilter === 'all' ? undefined : scopeFilter,
        topK: 100,
      });
    } else if (scopeFilter !== 'all') {
      raw = await store.list(scopeFilter);
    } else {
      // Fetch all scopes and merge
      const [project, user, session] = await Promise.all([
        store.list('project'),
        store.list('user'),
        store.list('session'),
      ]);
      raw = [...project, ...user, ...session];
      raw.sort(
        (a: any, b: any) =>
          new Date(b.updatedAt ?? b.updated_at).getTime() -
          new Date(a.updatedAt ?? a.updated_at).getTime(),
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

function normaliseRecord(r: any): MemoryRecord {
  return {
    id: r.id,
    scope: r.scope,
    kind: r.kind,
    content: r.content,
    metadata: r.metadata ?? {},
    createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt ?? r.created_at),
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt : new Date(r.updatedAt ?? r.updated_at),
    embedding: r.embedding,
  };
}

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
