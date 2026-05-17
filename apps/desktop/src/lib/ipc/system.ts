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

// ─── Per-account CLI credential directories ────────────────────────────────

/**
 * Create (if missing) and return the absolute path to the credential
 * directory for an account. Path is `~/.orchestra/cli-accounts/<id>/`.
 */
export function cliAccountCreateDir(accountId: string): Promise<string> {
  return invoke<string>('cli_account_create_dir', { accountId });
}

/** Recursively delete an account's credential directory. */
export function cliAccountRemoveDir(accountId: string): Promise<void> {
  return invoke<void>('cli_account_remove_dir', { accountId });
}

/**
 * Heuristic: true if the credential directory contains any files. Used by
 * the "Add Account" flow to detect when the OAuth login has saved tokens.
 */
export function cliAccountHasCredentials(accountId: string): Promise<boolean> {
  return invoke<boolean>('cli_account_has_credentials', { accountId });
}
