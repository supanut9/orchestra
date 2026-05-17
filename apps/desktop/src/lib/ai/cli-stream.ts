/**
 * cli-stream.ts — stream the output of a local AI CLI (claude / codex / gemini)
 * through Orchestra's PTY backend.
 *
 * Why use the PTY backend?
 *   1. Code reuse — replay buffer, status events, base64 transport are all
 *      already handled by `pty_spawn` + `subscribeToPtyOutput`.
 *   2. Transparency — the CLI's raw output also shows in a terminal tab the
 *      user can inspect, matching Orchestra's shared-PTY philosophy.
 *   3. The user's existing auth (e.g. Claude Code OAuth + Max subscription)
 *      is picked up automatically — no API key needed.
 */

import { ptySpawn, ptyKill, subscribeToPtyOutput, subscribeToPtyStatus } from '@/lib/ipc/pty';
import type { CliProviderConfig } from '@/stores/settings';
import { DEFAULT_CLI_ARGS, CLI_CONFIG_ENV_VAR } from '@/stores/settings';
import { useSettingsStore } from '@/stores/settings';

/**
 * Resolve the env-var injection for the active CLI account.
 * Returns {} when no account is selected — the CLI will fall back to its
 * default location (e.g. ~/.codex/).
 */
function activeAccountEnv(providerId: CliProviderConfig['providerId']): Record<string, string> {
  const state = useSettingsStore.getState();
  const activeId = state.activeCliAccountId[providerId];
  if (!activeId) return {};
  const account = state.cliAccounts.find((a) => a.id === activeId);
  if (!account) return {};
  const envVar = CLI_CONFIG_ENV_VAR[providerId];
  return { [envVar]: account.credentialDir };
}

/** Strip ANSI escape sequences for chat-panel display. */
function stripAnsi(input: string): string {
  // Common ANSI / CSI sequence stripper. Conservative but covers ESC[…m,
  // cursor moves, and OSC sequences.
  return input
    .replace(/\[[0-9;?]*[a-zA-Z]/g, '')
    .replace(/\][^]*/g, '')
    .replace(/[=>]/g, '');
}

export interface StreamCliOptions {
  config: CliProviderConfig;
  /** The user prompt (last user message). */
  prompt: string;
  /** Working directory — defaults to the user's home dir if omitted. */
  cwd?: string;
  /** Streaming chunk callback (after ANSI strip). */
  onChunk: (text: string) => void;
  /** AbortSignal — when aborted we kill the spawned PTY. */
  signal?: AbortSignal;
}

/**
 * Spawn the CLI, stream stdout into `onChunk`, resolve when the process exits
 * (or rejects if it crashes / is killed).
 */
export async function streamCli(opts: StreamCliOptions): Promise<void> {
  const { config, prompt, onChunk, signal } = opts;
  const cwd = opts.cwd ?? '/';

  const argvTemplate = config.args ?? DEFAULT_CLI_ARGS[config.providerId];
  const argv = [config.binaryPath, ...argvTemplate.map((a) => a.replace('{PROMPT}', prompt))];

  // Per-account env override — points the CLI at its profile's credential dir.
  const env = activeAccountEnv(config.providerId);

  const ptyId = await ptySpawn(`${config.providerId}`, argv, cwd, { kind: 'user' }, env);

  // Subscribe to output and forward decoded text (sans ANSI).
  const unlistenOutput = await subscribeToPtyOutput(ptyId, (bytes) => {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    onChunk(stripAnsi(text));
  });

  // Wait for status:'exited' | 'crashed' on this ptyId.
  await new Promise<void>((resolve, reject) => {
    let unlistenStatus: (() => void) | undefined;

    const handleAbort = () => {
      ptyKill(ptyId).catch(() => {});
    };
    signal?.addEventListener('abort', handleAbort, { once: true });

    subscribeToPtyStatus((payload) => {
      if (payload.ptyId !== ptyId) return;
      if (payload.status === 'exited' || payload.status === 'crashed') {
        unlistenStatus?.();
        signal?.removeEventListener('abort', handleAbort);
        if (payload.status === 'crashed') {
          reject(new Error(`CLI '${config.binaryPath}' crashed (exit ${payload.exitCode})`));
        } else if (payload.exitCode != null && payload.exitCode !== 0) {
          reject(new Error(`CLI '${config.binaryPath}' exited with code ${payload.exitCode}`));
        } else {
          resolve();
        }
      }
    }).then((unlisten) => {
      unlistenStatus = unlisten;
    });
  }).finally(() => {
    unlistenOutput();
  });
}
