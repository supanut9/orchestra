import { useEffect } from 'react';
import { Plus, Trash2, RotateCw } from 'lucide-react';

import { useMemoryHubStore } from '@/stores/memory-hub';
import { useCurrentWorkspace } from '@/stores/workspace';
import type { Scope } from '@/stores/memory-hub';

const SCOPES: Array<Scope | 'all'> = ['all', 'project', 'user', 'session'];

export function MemoryHub() {
  const workspace = useCurrentWorkspace();
  const {
    records,
    selectedId,
    searchQuery,
    scopeFilter,
    loading,
    error,
    storeAvailable,
    init,
    refresh,
    select,
    setSearch,
    setScope,
    insert,
    remove,
    clearError,
  } = useMemoryHubStore();

  useEffect(() => {
    if (workspace?.folders[0]?.path) {
      void init(workspace.folders[0]!.path);
    }
  }, [workspace?.folders[0]?.path, init]);

  if (!workspace) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[hsl(var(--muted-foreground))]">
        Open a workspace to use memory.
      </div>
    );
  }

  if (!storeAvailable) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
        <p className="font-semibold">Memory store unavailable</p>
        <p className="max-w-md text-xs">
          The local sqlite-vec store could not be opened in this renderer. Memory will land in
          Sprint 3 once persistence moves into the Rust backend.
        </p>
      </div>
    );
  }

  const filtered = records.filter((r) => {
    if (searchQuery && !r.content.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });
  const selected = filtered.find((r) => r.id === selectedId);

  async function handleNew() {
    await insert({
      scope: scopeFilter === 'all' ? 'project' : scopeFilter,
      kind: 'note',
      content: 'New memory record',
    });
  }

  return (
    <div className="flex h-full bg-[hsl(var(--background))]">
      <aside className="flex w-72 shrink-0 flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <div className="space-y-2 border-b border-[hsl(var(--border))] px-3 py-2">
          <div className="flex items-center gap-1">
            <span className="flex-1 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
              Memory ({filtered.length})
            </span>
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded p-1 hover:bg-[hsl(var(--muted))]"
              title="Reload"
            >
              <RotateCw className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={handleNew}
              className="rounded p-1 hover:bg-[hsl(var(--muted))]"
              title="New record"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <input
            value={searchQuery}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-xs placeholder-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
          />
          <div className="flex flex-wrap gap-1">
            {SCOPES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                className={
                  'rounded px-2 py-0.5 text-[10px] font-medium uppercase ' +
                  (scopeFilter === s
                    ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                    : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]')
                }
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">Loading…</div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="px-3 py-4 text-xs text-[hsl(var(--muted-foreground))]">No records.</div>
          )}
          {filtered.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => select(r.id)}
              className={
                'block w-full border-b border-[hsl(var(--border))] px-3 py-2 text-left text-xs hover:bg-[hsl(var(--muted))] ' +
                (selectedId === r.id ? 'bg-[hsl(var(--muted))]' : '')
              }
            >
              <div className="flex items-center gap-2">
                <span className="rounded bg-[hsl(var(--muted))] px-1.5 py-0.5 text-[9px] uppercase text-[hsl(var(--muted-foreground))]">
                  {r.scope}
                </span>
                <span className="font-mono text-[10px] text-[hsl(var(--muted-foreground))]">
                  {r.kind}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-[hsl(var(--foreground))]">{r.content}</p>
            </button>
          ))}
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-y-auto p-4">
        {error && (
          <div className="mb-3 flex items-start gap-2 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            <span className="flex-1">{error}</span>
            <button onClick={clearError} className="text-red-400 hover:text-red-200">
              ✕
            </button>
          </div>
        )}
        {!selected ? (
          <div className="flex h-full items-center justify-center text-sm text-[hsl(var(--muted-foreground))]">
            Select a record or create one with +
          </div>
        ) : (
          <article className="space-y-3">
            <header className="flex items-center gap-2">
              <span className="rounded bg-[hsl(var(--muted))] px-2 py-0.5 text-[10px] uppercase text-[hsl(var(--muted-foreground))]">
                {selected.scope}
              </span>
              <span className="text-sm font-semibold">{selected.kind}</span>
              <button
                type="button"
                onClick={() => void remove(selected.id)}
                className="ml-auto flex items-center gap-1 rounded bg-red-900/50 px-2 py-1 text-xs text-red-300 hover:bg-red-900/80"
              >
                <Trash2 className="h-3 w-3" /> Delete
              </button>
            </header>
            <pre className="whitespace-pre-wrap rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 p-3 text-xs">
              {selected.content}
            </pre>
            {Object.keys(selected.metadata).length > 0 && (
              <details>
                <summary className="cursor-pointer text-xs text-[hsl(var(--muted-foreground))]">
                  Metadata
                </summary>
                <pre className="mt-2 overflow-x-auto rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 p-3 text-xs">
                  {JSON.stringify(selected.metadata, null, 2)}
                </pre>
              </details>
            )}
            <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
              Created {selected.createdAt.toISOString()} · Updated{' '}
              {selected.updatedAt.toISOString()}
            </p>
          </article>
        )}
      </div>
    </div>
  );
}
