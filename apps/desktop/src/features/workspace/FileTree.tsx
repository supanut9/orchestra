/**
 * FileTree — multi-folder Explorer.
 *
 * Renders one collapsible root per folder in the active workspace.
 * Each root loads its own file listing and subscribes to `fs.change`
 * events. Clicking a file opens it in the editor.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { UnlistenFn } from '@tauri-apps/api/event';
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen as FolderOpenIcon,
  Loader2,
  X,
} from 'lucide-react';
import { fsListFiles, fsStartWatching, subscribeToFsChanges } from '@/lib/ipc';
import type { FileNode, FsChangePayload, WorkspaceFolder } from '@/lib/ipc';
import { useCurrentWorkspace, useWorkspaceStore } from '@/stores/workspace';
import { OpenWorkspaceButton } from './OpenWorkspaceButton';
import { cn } from '@/lib/utils';

// ── TreeNode ──────────────────────────────────────────────────────────────────

interface TreeNodeProps {
  node: FileNode;
  depth: number;
  activeFilePath: string | null;
  onFileClick: (node: FileNode) => void;
}

function TreeNode({ node, depth, activeFilePath, onFileClick }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const isDir = node.kind === 'directory';
  const isActive = node.path === activeFilePath;

  function handleClick() {
    if (isDir) setExpanded((prev) => !prev);
    else onFileClick(node);
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        style={{ paddingLeft: `${depth * 12 + 6}px` }}
        className={cn(
          'flex w-full items-center gap-1 py-0.5 pr-2 text-xs text-left',
          'hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]',
          'rounded-sm transition-colors',
          isActive && !isDir && 'bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]',
        )}
      >
        {isDir ? (
          <span className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--muted-foreground))]">
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </span>
        ) : (
          <span className="h-3.5 w-3.5 shrink-0" />
        )}
        {isDir ? (
          expanded ? (
            <FolderOpenIcon className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--muted-foreground))]" />
          ) : (
            <Folder className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--muted-foreground))]" />
          )
        ) : (
          <File className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--muted-foreground))]" />
        )}
        <span className="truncate">{node.name}</span>
      </button>

      {isDir && expanded && node.children && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              activeFilePath={activeFilePath}
              onFileClick={onFileClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tree-patching helpers ─────────────────────────────────────────────────────

function parentPath(filePath: string): string {
  const sep = filePath.includes('/') ? '/' : '\\';
  const parts = filePath.split(sep);
  parts.pop();
  return parts.join(sep);
}

function insertNode(tree: FileNode[], newNode: FileNode, parentDir: string): FileNode[] {
  return tree.map((node) => {
    if (node.path === parentDir && node.kind === 'directory') {
      const children = node.children ?? [];
      if (children.some((c) => c.path === newNode.path)) return node;
      const updated = [...children, newNode].sort((a, b) => {
        const da = a.kind === 'directory';
        const db = b.kind === 'directory';
        return db === da ? a.name.localeCompare(b.name) : db ? 1 : -1;
      });
      return { ...node, children: updated };
    }
    if (node.children) {
      return { ...node, children: insertNode(node.children, newNode, parentDir) };
    }
    return node;
  });
}

function removeNode(tree: FileNode[], targetPath: string): FileNode[] {
  return tree
    .filter((node) => node.path !== targetPath)
    .map((node) =>
      node.children ? { ...node, children: removeNode(node.children, targetPath) } : node,
    );
}

// ── FolderRoot — one collapsible root per workspace folder ────────────────────

interface FolderRootProps {
  workspaceId: string;
  folder: WorkspaceFolder;
}

function FolderRoot({ workspaceId, folder }: FolderRootProps) {
  const activeFilePath = useWorkspaceStore((s) => s.activeFilePath);
  const openFile = useWorkspaceStore((s) => s.openFile);
  const removeFolder = useWorkspaceStore((s) => s.removeFolder);

  const [expanded, setExpanded] = useState(true);
  const [nodes, setNodes] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  // Load files when the folder mounts or changes path.
  useEffect(() => {
    setLoading(true);
    setError(null);

    fsListFiles(folder.path, true, 4)
      .then(setNodes)
      .catch((err: unknown) => setError(String(err)))
      .finally(() => setLoading(false));

    // Start watching this folder for changes.
    fsStartWatching(folder.path).catch(() => {
      /* Watcher errors are non-fatal — UI still works without live updates. */
    });
  }, [folder.path]);

  // Subscribe to fs.change events scoped to this folder.
  const handleFsChange = useCallback(
    (payload: FsChangePayload) => {
      if (!payload.path.startsWith(folder.path)) return;

      setNodes((prev) => {
        switch (payload.kind) {
          case 'create': {
            const name = payload.path.split('/').pop() ?? payload.path;
            const newNode: FileNode = {
              name,
              path: payload.path,
              kind: name.includes('.') ? 'file' : 'directory',
            };
            return insertNode(prev, newNode, parentPath(payload.path));
          }
          case 'remove':
            return removeNode(prev, payload.path);
          case 'rename': {
            const withoutOld = removeNode(prev, payload.path);
            if (!payload.newPath) return withoutOld;
            const name = payload.newPath.split('/').pop() ?? payload.newPath;
            const renamed: FileNode = {
              name,
              path: payload.newPath,
              kind: name.includes('.') ? 'file' : 'directory',
            };
            return insertNode(withoutOld, renamed, parentPath(payload.newPath));
          }
          default:
            return prev;
        }
      });
    },
    [folder.path],
  );

  useEffect(() => {
    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }
    subscribeToFsChanges(handleFsChange).then((unlisten) => {
      unlistenRef.current = unlisten;
    });
    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, [handleFsChange]);

  return (
    <div className="border-b border-[hsl(var(--border))]">
      <div className="group flex items-center gap-1 bg-[hsl(var(--muted))]/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="flex flex-1 items-center gap-1 text-left text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          title={folder.path}
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span className="truncate">{folder.name}</span>
        </button>
        <button
          type="button"
          onClick={() => removeFolder(workspaceId, folder.path)}
          className="rounded p-0.5 text-[hsl(var(--muted-foreground))] opacity-0 hover:bg-[hsl(var(--muted))] hover:text-red-400 group-hover:opacity-100"
          title="Remove from workspace"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {expanded && (
        <div className="py-1">
          {loading && (
            <div className="flex items-center gap-2 px-3 py-1">
              <Loader2 className="h-3 w-3 animate-spin text-[hsl(var(--muted-foreground))]" />
              <span className="text-xs text-[hsl(var(--muted-foreground))]">Loading…</span>
            </div>
          )}
          {error && <p className="px-3 py-1 text-xs text-red-400 break-all">{error}</p>}
          {!loading && !error && nodes.length === 0 && (
            <p className="px-3 py-1 text-xs text-[hsl(var(--muted-foreground))]">Empty folder.</p>
          )}
          {nodes.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              activeFilePath={activeFilePath}
              onFileClick={openFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── FileTree — top-level explorer ─────────────────────────────────────────────

export function FileTree() {
  const workspace = useCurrentWorkspace();

  if (!workspace || workspace.folders.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
        <p className="text-center text-xs text-[hsl(var(--muted-foreground))]">
          {workspace ? 'No folders yet — add one to begin.' : 'No workspace yet.'}
        </p>
        <OpenWorkspaceButton />
      </div>
    );
  }

  return (
    <div className="overflow-x-hidden">
      {workspace.folders.map((folder) => (
        <FolderRoot key={folder.path} workspaceId={workspace.id} folder={folder} />
      ))}
      <div className="p-2">
        <OpenWorkspaceButton compact />
      </div>
    </div>
  );
}
