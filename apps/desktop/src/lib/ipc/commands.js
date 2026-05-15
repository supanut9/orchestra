/**
 * Typed wrappers around Tauri `invoke()` matching the Rust command registry
 * in `src-tauri/src/ipc/mod.rs`. Backends are stubbed for now; the contract
 * is locked here for parallel lane development.
 */
import { invoke } from '@tauri-apps/api/core';
// ── Workspace ──────────────────────────────────────────────────────────────
export function openWorkspace(path) {
    return invoke('open_workspace', { path });
}
// ── File System ────────────────────────────────────────────────────────────
export function listFiles(path) {
    return invoke('list_files', { path });
}
export function readFile(path) {
    return invoke('read_file', { path });
}
export function writeFile(path, content) {
    return invoke('write_file', { path, content });
}
// ── Services ───────────────────────────────────────────────────────────────
export function parseServices(workspacePath) {
    return invoke('parse_services', { workspacePath });
}
export function startService(serviceId) {
    return invoke('start_service', { serviceId });
}
export function stopService(serviceId) {
    return invoke('stop_service', { serviceId });
}
export function ptySpawn(options) {
    return invoke('pty_spawn', { options });
}
export function ptyWrite(ptyId, data) {
    return invoke('pty_write', { ptyId, data });
}
export function ptyResize(ptyId, cols, rows) {
    return invoke('pty_resize', { ptyId, cols, rows });
}
export function ptyKill(ptyId) {
    return invoke('pty_kill', { ptyId });
}
/**
 * Claim ownership of a PTY (user or agent). Used by Lane C's AI runtime
 * when an agent needs to execute shell commands.
 */
export function ptyClaim(ptyId, owner) {
    return invoke('pty_claim', { ptyId, owner });
}
/**
 * Attach a read-only subscriber (reader) to a PTY stream.
 * Returns the reader ID used to identify the subscription.
 */
export function ptyAttach(ptyId, readerId) {
    return invoke('pty_attach', { ptyId, readerId });
}
export function gitStatus(repoPath) {
    return invoke('git_status', { repoPath });
}
export function gitWorktreeAdd(repoPath, branch, worktreePath) {
    return invoke('git_worktree_add', { repoPath, branch, worktreePath });
}
export function gitWorktreeRemove(repoPath, worktreePath) {
    return invoke('git_worktree_remove', { repoPath, worktreePath });
}
export function memoryQuery(options) {
    return invoke('memory_query', { options });
}
export function memoryInsert(record) {
    return invoke('memory_insert', { record });
}
// ── Lanes ──────────────────────────────────────────────────────────────────
/** Convenience: get all active lanes (backed by in-memory state on the Rust side) */
export function listLanes() {
    return invoke('list_lanes');
}
