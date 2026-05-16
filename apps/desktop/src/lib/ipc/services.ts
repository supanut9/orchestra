/**
 * Services IPC layer — Lane B.
 *
 * Typed wrappers around `invoke()` for service detection and launching.
 * Types mirror the Rust `DetectedService` / `ServiceSource` structs in
 * `src-tauri/src/services/parser.rs`.
 */

import { invoke } from '@tauri-apps/api/core';

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * Indicates which configuration file a service was discovered from.
 * Mirrors the Rust `ServiceSource` enum.
 */
export type ServiceSource =
  | 'dockerCompose'
  | 'procfile'
  | 'packageJsonScript'
  | 'orchestraYaml'
  | 'makefile'
  | 'goModule';

/**
 * A single runnable service as returned by the Rust service parser.
 * Mirrors the Rust `DetectedService` struct.
 */
export interface DetectedService {
  /** Human-readable service name (from config key / script name). */
  name: string;
  /** Which config file the service was discovered in. */
  source: ServiceSource;
  /** Argv: command[0] is the binary, rest are arguments. */
  command: string[];
  /** Absolute path to the working directory for the process. */
  cwd: string;
  /** Optional environment variable overrides from the config file. */
  env: Record<string, string>;
}

// ── Commands ───────────────────────────────────────────────────────────────────

/**
 * Detect all runnable services in the given workspace directory.
 *
 * Inspects `orchestra.yaml`, `docker-compose.yml` (and variants), `Procfile`,
 * and `package.json` scripts in priority order. Does NOT start any processes.
 *
 * Use the returned list to render the Service Dashboard rows.
 */
export function servicesDetect(workspacePath: string): Promise<DetectedService[]> {
  return invoke<DetectedService[]>('services_detect', { workspacePath });
}

/**
 * Detect and start **all** services in the workspace in a single call.
 *
 * Returns a list of PTY IDs (one per service, in the same order as
 * `servicesDetect`). The frontend uses these IDs to open terminal tabs and
 * subscribe to `pty.output` events.
 *
 * Services that fail to spawn are skipped — the returned array may be shorter
 * than the detected service count if some spawns fail.
 */
export function servicesRunAll(workspacePath: string): Promise<string[]> {
  return invoke<string[]>('services_run_all', { workspacePath });
}

/**
 * Detect services in the workspace and start the one named `name`.
 *
 * Returns the PTY ID of the newly spawned process, or rejects if no service
 * with that name exists.
 */
export function servicesRunOne(workspacePath: string, name: string): Promise<string> {
  return invoke<string>('services_run_one', { workspacePath, name });
}
