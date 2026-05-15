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

import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { PtyStatus, ServiceStatus, LaneStatus, AgentMessage } from './types';

// ── Payload shapes ─────────────────────────────────────────────────────────

export interface PtyOutputPayload {
  ptyId: string;
  /** Base64-encoded raw bytes from the PTY. Decode before writing to xterm. */
  dataBase64: string;
}

export interface PtyStatusPayload {
  ptyId: string;
  status: PtyStatus;
  exitCode: number | null;
}

export interface FsChangePayload {
  kind: 'create' | 'modify' | 'remove' | 'rename';
  path: string;
  newPath?: string; // only present on rename
}

export interface ServiceHealthPayload {
  serviceId: string;
  status: ServiceStatus;
}

export interface LaneUpdatePayload {
  laneId: string;
  status: LaneStatus;
}

// ── Subscribers ────────────────────────────────────────────────────────────

/**
 * Subscribe to raw PTY output. Called once per xterm.js terminal instance.
 * Returns an unlisten function to clean up the listener.
 */
export function onPtyOutput(handler: (payload: PtyOutputPayload) => void): Promise<UnlistenFn> {
  return listen<PtyOutputPayload>('pty.output', (event) => handler(event.payload));
}

/**
 * Subscribe to PTY status changes (running / exited / crashed).
 */
export function onPtyStatus(handler: (payload: PtyStatusPayload) => void): Promise<UnlistenFn> {
  return listen<PtyStatusPayload>('pty.status', (event) => handler(event.payload));
}

/**
 * Subscribe to file-system change events (notify-rs watcher).
 */
export function onFsChange(handler: (payload: FsChangePayload) => void): Promise<UnlistenFn> {
  return listen<FsChangePayload>('fs.change', (event) => handler(event.payload));
}

/**
 * Subscribe to service health updates from the service orchestrator.
 */
export function onServiceHealth(
  handler: (payload: ServiceHealthPayload) => void,
): Promise<UnlistenFn> {
  return listen<ServiceHealthPayload>('service.health', (event) => handler(event.payload));
}

/**
 * Subscribe to lane state updates (pending → active → done / failed).
 */
export function onLaneUpdate(handler: (payload: LaneUpdatePayload) => void): Promise<UnlistenFn> {
  return listen<LaneUpdatePayload>('lane.update', (event) => handler(event.payload));
}

/**
 * Subscribe to streaming agent messages (role: assistant / tool chunks).
 */
export function onAgentMessage(handler: (payload: AgentMessage) => void): Promise<UnlistenFn> {
  return listen<AgentMessage>('agent.message', (event) => handler(event.payload));
}
