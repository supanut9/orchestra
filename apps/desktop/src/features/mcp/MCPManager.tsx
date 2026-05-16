import { useEffect, useState } from 'react';
import { Plus, RotateCw, Play, Square } from 'lucide-react';

import { useMCPStore } from '@/stores/mcp';
import { useWorkspaceStore } from '@/stores/workspace';
import { AddServerDialog } from './AddServerDialog';
import type { MCPServerConfig } from '@orchestra/mcp-client';

export function MCPManager() {
  const workspace = useWorkspaceStore((s) => s.currentWorkspace);
  const {
    servers,
    selectedId,
    loading,
    error,
    init,
    refresh,
    setSelected,
    startServer,
    stopServer,
    restartServer,
    removeServer,
    addServer,
    clearError,
  } = useMCPStore();

  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    if (workspace?.path) {
      void init(workspace.path);
    }
  }, [workspace?.path, init]);

  if (!workspace) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[hsl(var(--muted-foreground))]">
        Open a workspace to configure MCP servers.
      </div>
    );
  }

  const selected = servers.find((s) => s.id === selectedId);

  return (
    <div className="flex h-full bg-[hsl(var(--background))]">
      <aside className="flex w-64 shrink-0 flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <div className="flex items-center gap-1 border-b border-[hsl(var(--border))] px-3 py-2">
          <span className="flex-1 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            MCP Servers
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded p-1 hover:bg-[hsl(var(--muted))]"
            title="Reload config"
          >
            <RotateCw className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="rounded p-1 hover:bg-[hsl(var(--muted))]"
            title="Add server"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">Loading…</div>
          )}
          {!loading && servers.length === 0 && (
            <div className="px-3 py-4 text-xs text-[hsl(var(--muted-foreground))]">
              No servers configured. Click + to add one.
            </div>
          )}
          {servers.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => void setSelected(s.id)}
              className={
                'flex w-full items-center gap-2 border-b border-[hsl(var(--border))] px-3 py-2 text-left text-xs hover:bg-[hsl(var(--muted))] ' +
                (selectedId === s.id ? 'bg-[hsl(var(--muted))]' : '')
              }
            >
              <span
                className={
                  'h-2 w-2 shrink-0 rounded-full ' +
                  (s.status === 'running'
                    ? 'bg-green-500'
                    : s.status === 'error'
                      ? 'bg-red-500'
                      : 'bg-neutral-500')
                }
              />
              <span className="flex-1 truncate font-mono">{s.id}</span>
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
            Select a server on the left, or click + to add one.
          </div>
        ) : (
          <div className="space-y-4">
            <header className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{selected.id}</h2>
              <span
                className={
                  'rounded px-2 py-0.5 text-[10px] font-medium uppercase ' +
                  (selected.status === 'running'
                    ? 'bg-green-500/20 text-green-400'
                    : selected.status === 'error'
                      ? 'bg-red-500/20 text-red-400'
                      : 'bg-neutral-700 text-neutral-300')
                }
              >
                {selected.status}
              </span>
            </header>

            <div className="flex flex-wrap gap-2">
              {selected.status !== 'running' && (
                <button
                  type="button"
                  onClick={() => void startServer(selected.id)}
                  className="flex items-center gap-1 rounded bg-green-900/50 px-3 py-1.5 text-xs text-green-300 hover:bg-green-900/80"
                >
                  <Play className="h-3 w-3" /> Start
                </button>
              )}
              {selected.status === 'running' && (
                <>
                  <button
                    type="button"
                    onClick={() => void stopServer(selected.id)}
                    className="flex items-center gap-1 rounded bg-red-900/50 px-3 py-1.5 text-xs text-red-300 hover:bg-red-900/80"
                  >
                    <Square className="h-3 w-3" /> Stop
                  </button>
                  <button
                    type="button"
                    onClick={() => void restartServer(selected.id)}
                    className="flex items-center gap-1 rounded bg-yellow-900/50 px-3 py-1.5 text-xs text-yellow-300 hover:bg-yellow-900/80"
                  >
                    <RotateCw className="h-3 w-3" /> Restart
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => void removeServer(selected.id)}
                className="rounded bg-[hsl(var(--muted))] px-3 py-1.5 text-xs text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]/80"
              >
                Remove
              </button>
            </div>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                Configuration
              </h3>
              <pre className="overflow-x-auto rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 p-3 text-xs">
                {JSON.stringify(selected.config, null, 2)}
              </pre>
            </section>

            {selected.tools && selected.tools.length > 0 && (
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                  Tools ({selected.tools.length})
                </h3>
                <ul className="space-y-1">
                  {selected.tools.map((t) => (
                    <li
                      key={t.name}
                      className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-xs"
                    >
                      <span className="font-mono font-semibold">{t.name}</span>
                      {t.description && (
                        <span className="ml-2 text-[hsl(var(--muted-foreground))]">
                          {t.description}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>

      <AddServerDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onAdd={(id: string, config: MCPServerConfig) => {
          void addServer(id, config);
          setShowAdd(false);
        }}
      />
    </div>
  );
}
