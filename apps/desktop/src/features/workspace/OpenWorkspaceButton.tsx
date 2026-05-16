/**
 * OpenWorkspaceButton — picks a folder and adds it to the active workspace.
 *
 * If no workspace exists yet, the workspace store creates a default one.
 * The folder watcher is started automatically on add.
 */

import { useState } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { FolderOpen, Plus } from 'lucide-react';
import { fsOpenWorkspace, fsStartWatching } from '@/lib/ipc';
import { useWorkspaceStore } from '@/stores/workspace';
import { cn } from '@/lib/utils';

interface OpenWorkspaceButtonProps {
  className?: string;
  /** Compact rendering inside the explorer (just a "+ Add folder" link). */
  compact?: boolean;
}

export function OpenWorkspaceButton({ className, compact = false }: OpenWorkspaceButtonProps) {
  const [loading, setLoading] = useState(false);
  const addFolder = useWorkspaceStore((s) => s.addFolder);

  async function handleClick() {
    setLoading(true);
    try {
      const selected = await openDialog({ directory: true, multiple: false });
      if (!selected || typeof selected !== 'string') return;

      const folder = await fsOpenWorkspace(selected);
      addFolder(folder);

      // Best-effort watcher (FileTree starts one per folder; this is harmless).
      fsStartWatching(selected).catch(() => {});
    } catch (err) {
      console.error('[OpenWorkspaceButton] failed to add folder:', err);
    } finally {
      setLoading(false);
    }
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={cn(
          'flex w-full items-center justify-center gap-1.5 rounded border border-dashed border-[hsl(var(--border))]',
          'px-2 py-1.5 text-xs text-[hsl(var(--muted-foreground))]',
          'hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'transition-colors',
          className,
        )}
      >
        <Plus className="h-3 w-3" />
        {loading ? 'Adding…' : 'Add folder'}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={cn(
        'flex items-center gap-1.5 rounded px-2 py-1 text-xs',
        'bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]',
        'hover:opacity-90 active:opacity-75',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'transition-opacity',
        className,
      )}
    >
      <FolderOpen className="h-3.5 w-3.5 shrink-0" />
      {loading ? 'Opening…' : 'Open Folder'}
    </button>
  );
}
