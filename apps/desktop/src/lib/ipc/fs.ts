/**
 * Typed wrappers for the fs Tauri commands (Lane A).
 *
 * These wrap the `fs_*` commands registered in `src-tauri/src/fs/commands.rs`
 * and the `fs.change` event emitted by the watcher.
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { FolderInfo, FileNode } from './types';
import type { FsChangePayload } from './events';

// ── Commands ──────────────────────────────────────────────────────────────────

/**
 * Open a folder. Returns folder metadata (id, name, path, openedAt).
 * The TS workspace store decides whether this folder becomes the first folder
 * in a new workspace, or gets added to an existing workspace.
 *
 * Note: the Rust command is still called `fs_open_workspace` for compatibility;
 * the "workspace" concept moved into the TS layer in Sprint 4.
 */
export function fsOpenWorkspace(path: string): Promise<FolderInfo> {
  return invoke<FolderInfo>('fs_open_workspace', { path });
}

/**
 * List the contents of a directory.
 *
 * @param path      Absolute path to the directory.
 * @param recursive Whether to recurse into sub-directories.
 * @param maxDepth  Maximum recursion depth (default 4 on the Rust side).
 */
export function fsListFiles(
  path: string,
  recursive: boolean,
  maxDepth?: number,
): Promise<FileNode[]> {
  return invoke<FileNode[]>('fs_list_files', { path, recursive, maxDepth });
}

/**
 * Read a file as UTF-8 text.  The Rust side rejects files larger than 5 MiB.
 */
export function fsReadFile(path: string): Promise<string> {
  return invoke<string>('fs_read_file', { path });
}

/**
 * Write text to a file atomically (temp file + rename on the Rust side).
 */
export function fsWriteFile(path: string, contents: string): Promise<void> {
  return invoke<void>('fs_write_file', { path, contents });
}

/**
 * Start watching `path` for file-system changes.  The Rust side emits
 * `fs.change` events; use `subscribeToFsChanges` to consume them.
 *
 * Calling this again replaces the previous watcher.
 */
export function fsStartWatching(path: string): Promise<void> {
  return invoke<void>('fs_start_watching', { path });
}

/**
 * Stop the active file-system watcher.
 */
export function fsStopWatching(): Promise<void> {
  return invoke<void>('fs_stop_watching');
}

// ── Events ────────────────────────────────────────────────────────────────────

/**
 * Subscribe to file-system change events emitted by the Rust watcher.
 *
 * Returns an unlisten function — call it to clean up when the component
 * unmounts (or the workspace closes).
 *
 * @example
 * const unlisten = await subscribeToFsChanges((payload) => {
 *   console.log(payload.kind, payload.path);
 * });
 * // later…
 * unlisten();
 */
export function subscribeToFsChanges(
  handler: (payload: FsChangePayload) => void,
): Promise<UnlistenFn> {
  return listen<FsChangePayload>('fs.change', (event) => handler(event.payload));
}
