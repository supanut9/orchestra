/**
 * PTY IPC layer — Lane B.
 *
 * Typed wrappers around `invoke()` for every pty_* Tauri command, plus
 * helpers for subscribing to the `pty.output` and `pty.status` event streams.
 *
 * Data contract:
 *   - Input bytes (keystrokes) are base64-encoded before being sent over IPC
 *     to avoid JSON mangling of control characters.
 *   - Output bytes arrive as base64-encoded strings on `pty.output` and are
 *     decoded here to `Uint8Array` before being handed to xterm.js.
 */
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
// ── Encoding helpers ───────────────────────────────────────────────────────────
/**
 * Decode a base64 string from a `pty.output` event into a `Uint8Array` that
 * can be written directly to an xterm.js `Terminal` instance.
 *
 * xterm accepts `string | Uint8Array`; passing bytes avoids a redundant UTF-8
 * round-trip and preserves binary control sequences correctly.
 */
export function decodePtyOutput(dataBase64) {
    const binary = atob(dataBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}
/**
 * Encode a string (user keystrokes / paste) to base64 for `pty_write`.
 *
 * xterm.js `onData` delivers a string; we convert it to UTF-8 bytes first so
 * multi-byte characters and control sequences survive the JSON transport.
 */
export function encodePtyInput(data) {
    const bytes = new TextEncoder().encode(data);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}
// ── Commands ───────────────────────────────────────────────────────────────────
/**
 * Spawn a new PTY running `command` (argv) in `cwd`.
 *
 * Returns the UUID of the new PTY, which is used to subscribe to its output
 * stream and perform write/resize/kill operations.
 */
export function ptySpawn(label, command, cwd, owner = { kind: 'user' }) {
    return invoke('pty_spawn', { label, command, cwd, owner });
}
/**
 * Send bytes to a PTY (simulates user keystrokes).
 *
 * `data` must be **base64-encoded**; use `encodePtyInput()` to produce it from
 * an xterm.js `onData` string.
 */
export function ptyWrite(ptyId, data) {
    return invoke('pty_write', { ptyId, data });
}
/**
 * Resize a PTY to match its container.
 *
 * Call after `FitAddon.fit()` resolves to keep the shell's internal terminal
 * dimensions in sync with what the user sees.
 */
export function ptyResize(ptyId, rows, cols) {
    return invoke('pty_resize', { ptyId, rows, cols });
}
/**
 * Kill the process running in `ptyId` and remove it from the manager.
 *
 * The backend emits `pty.status { status: "exited" }` immediately after.
 */
export function ptyKill(ptyId) {
    return invoke('pty_kill', { ptyId });
}
/**
 * Transfer ownership of a PTY to `owner`.
 *
 * Called by Lane C's AI runtime when an agent starts executing commands, and
 * by the UI to reclaim ownership after the agent finishes.
 */
export function ptyClaim(ptyId, owner) {
    return invoke('pty_claim', { ptyId, owner });
}
/**
 * Return a snapshot of all live PTYs for the tab bar.
 *
 * Call on component mount and whenever a `pty.status` event indicates that a
 * PTY has been added or removed.
 */
export function ptyList() {
    return invoke('pty_list');
}
// ── Event subscriptions ────────────────────────────────────────────────────────
/**
 * Subscribe to output from a specific PTY.
 *
 * The handler receives already-decoded `Uint8Array` bytes so it can be passed
 * directly to `terminal.write()`.
 *
 * Returns an unlisten function; call it on component unmount to avoid leaks.
 *
 * Example:
 * ```ts
 * const unlisten = await subscribeToPtyOutput(ptyId, (bytes) => {
 *   term.write(bytes);
 * });
 * // on cleanup:
 * unlisten();
 * ```
 */
export async function subscribeToPtyOutput(ptyId, handler) {
    return listen('pty.output', (event) => {
        if (event.payload.ptyId === ptyId) {
            handler(decodePtyOutput(event.payload.dataBase64));
        }
    });
}
/**
 * Subscribe to PTY status changes (running → exited / crashed).
 *
 * Unlike `subscribeToPtyOutput`, this subscription receives events for *all*
 * PTYs — the handler should inspect `payload.ptyId` to update the correct tab.
 *
 * Returns an unlisten function; call it on component unmount.
 */
export async function subscribeToPtyStatus(handler) {
    return listen('pty.status', (event) => handler(event.payload));
}
