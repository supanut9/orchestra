/**
 * System helpers — locate external binaries on the host PATH.
 *
 * The Rust backend runs `<SHELL> -lc "command -v <name>"` so the user's
 * `.zshrc` / `.bashrc` / `.profile` is sourced; this gives us the real PATH
 * a GUI-launched process can't see otherwise.
 */

import { invoke } from '@tauri-apps/api/core';

/**
 * Detect a binary by name. Returns the absolute path if found, or null if not
 * installed / not on PATH. Never throws on "not found" — only on shell errors.
 */
export function detectBinary(name: string): Promise<string | null> {
  return invoke<string | null>('detect_binary', { name });
}
