/**
 * Typed wrappers for the fs Tauri commands (Lane A).
 *
 * These wrap the `fs_*` commands registered in `src-tauri/src/fs/commands.rs`
 * and the `fs.change` event emitted by the watcher.
 */
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
// ── Commands ──────────────────────────────────────────────────────────────────
/**
 * Open a folder as a workspace.  Returns a `Workspace` with a deterministic
 * ID derived from the path (same folder → same ID across sessions).
 */
export function fsOpenWorkspace(path) {
    return invoke('fs_open_workspace', { path });
}
/**
 * List the contents of a directory.
 *
 * @param path      Absolute path to the directory.
 * @param recursive Whether to recurse into sub-directories.
 * @param maxDepth  Maximum recursion depth (default 4 on the Rust side).
 */
export function fsListFiles(path, recursive, maxDepth) {
    return invoke('fs_list_files', { path, recursive, maxDepth });
}
/**
 * Read a file as UTF-8 text.  The Rust side rejects files larger than 5 MiB.
 */
export function fsReadFile(path) {
    return invoke('fs_read_file', { path });
}
/**
 * Write text to a file atomically (temp file + rename on the Rust side).
 */
export function fsWriteFile(path, contents) {
    return invoke('fs_write_file', { path, contents });
}
/**
 * Start watching `path` for file-system changes.  The Rust side emits
 * `fs.change` events; use `subscribeToFsChanges` to consume them.
 *
 * Calling this again replaces the previous watcher.
 */
export function fsStartWatching(path) {
    return invoke('fs_start_watching', { path });
}
/**
 * Stop the active file-system watcher.
 */
export function fsStopWatching() {
    return invoke('fs_stop_watching');
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
export function subscribeToFsChanges(handler) {
    return listen('fs.change', (event) => handler(event.payload));
}
