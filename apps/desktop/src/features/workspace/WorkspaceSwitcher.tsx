/**
 * WorkspaceSwitcher — dropdown to switch / create / rename / delete workspaces.
 *
 * Lives in the header. Active workspace's name is the trigger.
 */

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspace';
import { cn } from '@/lib/utils';

export function WorkspaceSwitcher() {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
  const switchWorkspace = useWorkspaceStore((s) => s.switchWorkspace);
  const renameWorkspace = useWorkspaceStore((s) => s.renameWorkspace);
  const deleteWorkspace = useWorkspaceStore((s) => s.deleteWorkspace);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  const active = workspaces.find((w) => w.id === activeWorkspaceId) ?? null;

  // Close dropdown on outside click.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function handleNew() {
    const ws = createWorkspace('New Workspace');
    setEditingId(ws.id);
    setEditName(ws.name);
  }

  function commitRename() {
    if (editingId) renameWorkspace(editingId, editName);
    setEditingId(null);
    setEditName('');
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={cn(
          'flex items-center gap-1.5 rounded bg-[hsl(var(--muted))] px-2 py-0.5 text-xs',
          'hover:bg-[hsl(var(--muted))]/80',
          !active && 'text-[hsl(var(--muted-foreground))]',
        )}
      >
        <span className="max-w-[180px] truncate font-medium">
          {active ? active.name : 'No workspace'}
        </span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 overflow-hidden rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-lg">
          <div className="max-h-64 overflow-y-auto">
            {workspaces.length === 0 ? (
              <p className="px-3 py-3 text-xs text-[hsl(var(--muted-foreground))]">
                No workspaces yet.
              </p>
            ) : (
              workspaces.map((w) => {
                const isActive = w.id === activeWorkspaceId;
                const isEditing = editingId === w.id;
                return (
                  <div
                    key={w.id}
                    className={cn(
                      'group flex items-center gap-1 border-b border-[hsl(var(--border))] px-2 py-1.5 text-xs',
                      isActive && 'bg-[hsl(var(--muted))]/40',
                    )}
                  >
                    {isEditing ? (
                      <>
                        <input
                          autoFocus
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename();
                            if (e.key === 'Escape') {
                              setEditingId(null);
                              setEditName('');
                            }
                          }}
                          className="flex-1 rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
                        />
                        <button
                          onClick={commitRename}
                          className="rounded p-1 hover:bg-[hsl(var(--muted))]"
                        >
                          <Check className="h-3 w-3 text-green-400" />
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(null);
                            setEditName('');
                          }}
                          className="rounded p-1 hover:bg-[hsl(var(--muted))]"
                        >
                          <X className="h-3 w-3 text-[hsl(var(--muted-foreground))]" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            switchWorkspace(w.id);
                            setOpen(false);
                          }}
                          className="flex-1 truncate text-left hover:underline"
                        >
                          {w.name}
                          <span className="ml-2 text-[10px] text-[hsl(var(--muted-foreground))]">
                            {w.folders.length} {w.folders.length === 1 ? 'folder' : 'folders'}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(w.id);
                            setEditName(w.name);
                          }}
                          className="rounded p-1 opacity-0 hover:bg-[hsl(var(--muted))] group-hover:opacity-100"
                          title="Rename"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Delete workspace "${w.name}"?`)) {
                              deleteWorkspace(w.id);
                            }
                          }}
                          className="rounded p-1 opacity-0 hover:bg-[hsl(var(--muted))] hover:text-red-400 group-hover:opacity-100"
                          title="Delete"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
          <button
            type="button"
            onClick={handleNew}
            className="flex w-full items-center gap-1.5 border-t border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 px-3 py-2 text-xs hover:bg-[hsl(var(--muted))]/60"
          >
            <Plus className="h-3 w-3" />
            New workspace
          </button>
        </div>
      )}
    </div>
  );
}
