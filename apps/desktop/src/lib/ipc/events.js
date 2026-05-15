/**
 * Typed subscribers for Tauri events emitted by the Rust backend.
 *
 * Topic contract (locked for cross-lane parallel development):
 *   pty.output        — raw PTY byte chunk
 *   pty.status        — PTY status changed
 *   fs.change         — file-system change notification
 *   service.health    — service status changed
 *   lane.update       — lane state changed
 *   agent.message     — new agent message streamed
 */
import { listen } from '@tauri-apps/api/event';
// ── Subscribers ────────────────────────────────────────────────────────────
/**
 * Subscribe to raw PTY output. Called once per xterm.js terminal instance.
 * Returns an unlisten function to clean up the listener.
 */
export function onPtyOutput(handler) {
    return listen('pty.output', (event) => handler(event.payload));
}
/**
 * Subscribe to PTY status changes (running / exited / crashed).
 */
export function onPtyStatus(handler) {
    return listen('pty.status', (event) => handler(event.payload));
}
/**
 * Subscribe to file-system change events (notify-rs watcher).
 */
export function onFsChange(handler) {
    return listen('fs.change', (event) => handler(event.payload));
}
/**
 * Subscribe to service health updates from the service orchestrator.
 */
export function onServiceHealth(handler) {
    return listen('service.health', (event) => handler(event.payload));
}
/**
 * Subscribe to lane state updates (pending → active → done / failed).
 */
export function onLaneUpdate(handler) {
    return listen('lane.update', (event) => handler(event.payload));
}
/**
 * Subscribe to streaming agent messages (role: assistant / tool chunks).
 */
export function onAgentMessage(handler) {
    return listen('agent.message', (event) => handler(event.payload));
}
