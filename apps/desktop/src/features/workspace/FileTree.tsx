/**
 * FileTree — recursive, collapsible file-system explorer (Lane A).
 *
 * - Loads files via `fsListFiles` when `currentWorkspace` changes.
 * - Subscribes to `fs.change` events from the Rust watcher and patches the
 *   tree in real-time (no full reload needed for simple create/remove/modify).
 * - Clicking a file opens it in the editor via `useWorkspaceStore.openFile`.
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
} from 'lucide-react';
import { fsListFiles, subscribeToFsChanges } from '@/lib/ipc';
import type { FileNode, FsChangePayload } from '@/lib/ipc';
import { useWorkspaceStore } from '@/stores/workspace';
import { OpenWorkspaceButton } from './OpenWorkspaceButton';
import { cn } from '@/lib/utils';

// ── Tree-node component ───────────────────────────────────────────────────────

interface TreeNodeProps {
  node: FileNode;
  depth: number;
  activeFilePath: string | null;
  onFileClick: (node: FileNode) => void;
}

function TreeNode({ node, depth, activeFilePath, onFileClick }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth === 0);
  const isDir = node.kind === 'directory';
  const isActive = node.path === activeFilePath;

  function handleClick() {
    if (isDir) {
      setExpanded((prev) => !prev);
    } else {
      onFileClick(node);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        className={cn(
          'flex w-full items-center gap-1 py-0.5 pr-2 text-xs text-left',
          'hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]',
          'rounded-sm transition-colors',
          isActive && !isDir && 'bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]',
        )}
      >
        {/* Expand/collapse chevron for directories */}
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

        {/* Icon */}
        {isDir ? (
          expanded ? (
            <FolderOpenIcon className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--muted-foreground))]" />
          ) : (
            <Folder className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--muted-foreground))]" />
          )
        ) : (
          <File className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--muted-foreground))]" />
        )}

        {/* Name */}
        <span className="truncate">{node.name}</span>
      </button>

      {/* Children (only if expanded and has children) */}
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

// ── Tree patching helpers ─────────────────────────────────────────────────────

/** Find the parent directory path of a file path. */
function parentPath(filePath: string): string {
  const sep = filePath.includes('/') ? '/' : '\\';
  const parts = filePath.split(sep);
  parts.pop();
  return parts.join(sep);
}

/** Insert a node into the tree at the correct parent. Returns a new tree. */
function insertNode(tree: FileNode[], newNode: FileNode, parentDir: string): FileNode[] {
  return tree.map((node) => {
    if (node.path === parentDir && node.kind === 'directory') {
      const children = node.children ?? [];
      // Avoid duplicates.
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

/** Remove a node by path from the tree. Returns a new tree. */
function removeNode(tree: FileNode[], targetPath: string): FileNode[] {
  return tree
    .filter((node) => node.path !== targetPath)
    .map((node) =>
      node.children ? { ...node, children: removeNode(node.children, targetPath) } : node,
    );
}

// ── FileTree component ────────────────────────────────────────────────────────

export function FileTree() {
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace);
  const activeFilePath = useWorkspaceStore((s) => s.activeFilePath);
  const openFile = useWorkspaceStore((s) => s.openFile);

  const [nodes, setNodes] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep unlisten ref so we can clean up on workspace change / unmount.
  const unlistenRef = useRef<UnlistenFn | null>(null);

  // ── Load files when workspace changes ─────────────────────────────────────
  useEffect(() => {
    if (!currentWorkspace) {
      setNodes([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    fsListFiles(currentWorkspace.path, true, 4)
      .then((result) => {
        setNodes(result);
      })
      .catch((err: unknown) => {
        setError(String(err));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [currentWorkspace]);

  // ── Subscribe to fs.change events ─────────────────────────────────────────
  const handleFsChange = useCallback(
    (payload: FsChangePayload) => {
      if (!currentWorkspace) return;
      // Only patch nodes that are within the current workspace.
      if (!payload.path.startsWith(currentWorkspace.path)) return;

      setNodes((prev) => {
        switch (payload.kind) {
          case 'create': {
            const name = payload.path.split('/').pop() ?? payload.path;
            // We don't know if it's a file or dir from the event alone — use
            // a heuristic: if it has no extension and the name has no dot,
            // treat it as a directory.  The watcher will send another event
            // if we guess wrong.  This is a best-effort live patch.
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
            const newNode: FileNode = {
              name,
              path: payload.newPath,
              kind: name.includes('.') ? 'file' : 'directory',
            };
            return insertNode(withoutOld, newNode, parentPath(payload.newPath));
          }
          case 'modify':
            // Modify events don't change tree structure — nothing to patch.
            return prev;
          default:
            return prev;
        }
      });
    },
    [currentWorkspace],
  );

  useEffect(() => {
    // Clean up previous listener.
    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }

    if (!currentWorkspace) return;

    subscribeToFsChanges(handleFsChange).then((unlisten) => {
      unlistenRef.current = unlisten;
    });

    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, [currentWorkspace, handleFsChange]);

  // ── File click handler ─────────────────────────────────────────────────────
  function handleFileClick(node: FileNode) {
    openFile(node);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!currentWorkspace) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-full p-4">
        <p className="text-xs text-[hsl(var(--muted-foreground))] text-center">
          No workspace open.
        </p>
        <OpenWorkspaceButton />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 h-full p-4">
        <Loader2 className="h-4 w-4 animate-spin text-[hsl(var(--muted-foreground))]" />
        <span className="text-xs text-[hsl(var(--muted-foreground))]">Loading…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-2 p-4">
        <p className="text-xs text-red-400">Failed to load files:</p>
        <p className="text-xs text-[hsl(var(--muted-foreground))] break-all">{error}</p>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <p className="text-xs text-[hsl(var(--muted-foreground))] text-center">
          This folder is empty.
        </p>
      </div>
    );
  }

  return (
    <div className="py-1 overflow-x-hidden">
      {nodes.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          depth={0}
          activeFilePath={activeFilePath}
          onFileClick={handleFileClick}
        />
      ))}
    </div>
  );
}
