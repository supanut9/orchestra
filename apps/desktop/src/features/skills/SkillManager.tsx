import { useEffect } from 'react';
import { RotateCw, FolderOpen, Plus } from 'lucide-react';

import { useSkillsStore } from '@/stores/skills';
import { useCurrentWorkspace } from '@/stores/workspace';

export function SkillManager() {
  const workspace = useCurrentWorkspace();
  const {
    skills,
    enabledIds,
    selectedId,
    loading,
    error,
    init,
    refresh,
    toggle,
    select,
    createExample,
    openFolder,
    clearError,
  } = useSkillsStore();

  useEffect(() => {
    if (workspace?.folders[0]?.path) {
      void init(workspace.folders[0]!.path);
    }
  }, [workspace?.folders[0]?.path, init]);

  if (!workspace) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[hsl(var(--muted-foreground))]">
        Open a workspace to manage skills.
      </div>
    );
  }

  const selected = skills.find((s) => s.id === selectedId);
  const enabledSet = new Set(enabledIds);

  return (
    <div className="flex h-full bg-[hsl(var(--background))]">
      <aside className="flex w-72 shrink-0 flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <div className="flex items-center gap-1 border-b border-[hsl(var(--border))] px-3 py-2">
          <span className="flex-1 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            Skills ({skills.length})
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
            onClick={() => void openFolder()}
            className="rounded p-1 hover:bg-[hsl(var(--muted))]"
            title="Open skills folder"
          >
            <FolderOpen className="h-3 w-3" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">Loading…</div>
          )}
          {!loading && skills.length === 0 && (
            <div className="space-y-3 px-3 py-4 text-xs text-[hsl(var(--muted-foreground))]">
              <p>
                No SKILL.md files found. Skills are markdown files with YAML frontmatter that inject
                domain-specific instructions into the agent&apos;s system prompt.
              </p>
              <button
                type="button"
                onClick={() => void createExample()}
                className="flex items-center gap-1.5 rounded bg-[hsl(var(--primary))] px-3 py-1.5 text-xs text-[hsl(var(--primary-foreground))] hover:opacity-90"
              >
                <Plus className="h-3 w-3" />
                Create example skill
              </button>
            </div>
          )}
          {skills.map((s) => (
            <div
              key={s.id}
              className={
                'flex items-center gap-2 border-b border-[hsl(var(--border))] px-3 py-2 text-xs ' +
                (selectedId === s.id ? 'bg-[hsl(var(--muted))]' : '')
              }
            >
              <input
                type="checkbox"
                checked={enabledSet.has(s.id)}
                onChange={() => toggle(s.id)}
                className="h-3 w-3 shrink-0"
              />
              <button
                type="button"
                onClick={() => select(s.id)}
                className="flex-1 truncate text-left font-mono hover:underline"
              >
                {s.name}
              </button>
            </div>
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
            Select a skill on the left.
          </div>
        ) : (
          <article className="space-y-3">
            <header>
              <h2 className="text-lg font-semibold">{selected.name}</h2>
              {selected.description && (
                <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                  {selected.description}
                </p>
              )}
              {selected.tags && selected.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {selected.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded bg-[hsl(var(--muted))] px-2 py-0.5 text-[10px] font-medium text-[hsl(var(--muted-foreground))]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </header>
            <pre className="whitespace-pre-wrap rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 p-3 text-xs leading-relaxed">
              {selected.body}
            </pre>
          </article>
        )}
      </div>
    </div>
  );
}
