/**
 * shell.ts — platform-agnostic shell tool definition.
 *
 * Uses Vercel AI SDK's `tool()` helper to describe a "run shell command" action.
 * The actual PTY spawning is delegated entirely to a `runShellCommand` callback
 * injected by the desktop bridge (apps/desktop/src/lib/ai/agent-tools.ts).
 * Nothing in this file imports Tauri APIs.
 */

import { tool } from 'ai';
import { z } from 'zod';

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * The result of spawning a shell command through the PTY bridge.
 *  - `ptyId`  — the PTY UUID; used by the UI to locate the correct terminal tab.
 *  - `output` — resolves with the full combined stdout+stderr when the process exits.
 */
export interface ShellCommandResult {
  ptyId: string;
  output: Promise<string>;
}

/**
 * Callback signature supplied by the desktop bridge.
 * The shell tool calls this; the bridge decides how to spawn the PTY.
 */
export type RunShellCommandFn = (opts: {
  command: string;
  cwd?: string;
  timeoutMs?: number;
  /**
   * Optional PTY UUID to target. When supplied, the command is written into
   * the existing PTY (which must already be owned by this agent session via
   * pty_claim) instead of spawning a fresh one. The user-visible terminal
   * stays open across calls so they can watch the agent work.
   */
  targetPtyId?: string;
}) => Promise<ShellCommandResult>;

/**
 * Extra callbacks the caller may pass to `shellTool()` to observe tool
 * lifecycle events without coupling the tool definition to the UI layer.
 */
export interface ShellToolHooks {
  /** Fired immediately after the PTY is spawned, before output resolves. */
  onSpawn?: (ptyId: string, command: string) => void;
  /** Fired when the command finishes (or times out). */
  onExit?: (ptyId: string, output: string) => void;
  /** Fired on any error (spawn failure, timeout, etc.). */
  onError?: (command: string, error: unknown) => void;
}

// ── Shell tool schema ──────────────────────────────────────────────────────────

const shellParametersSchema = z.object({
  command: z
    .string()
    .min(1)
    .describe('The shell command to execute, e.g. "npm test" or "ls -la src/"'),
  cwd: z
    .string()
    .optional()
    .describe(
      'Working directory for the command. Defaults to the active workspace path when omitted.',
    ),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      'Maximum milliseconds to wait for the command to finish before killing it. Defaults to 30 000 ms.',
    ),
  targetPtyId: z
    .string()
    .optional()
    .describe(
      'Optional PTY UUID to run the command in. Use this when the user has handed you an existing terminal (e.g. a running service) so they can watch the command execute there instead of in a fresh PTY.',
    ),
});

export type ShellToolParameters = z.infer<typeof shellParametersSchema>;

// ── Factory ────────────────────────────────────────────────────────────────────

/**
 * Create a Vercel AI SDK `Tool` for running shell commands through a PTY.
 *
 * @param runShellCommand  Bridge callback that actually spawns the PTY.
 * @param hooks            Optional lifecycle hooks for UI/observability.
 *
 * @example
 * ```ts
 * const tools = {
 *   shell: shellTool({
 *     runShellCommand: createShellRunner(sessionId, workspacePath),
 *   }),
 * };
 * ```
 */
export function shellTool(runShellCommand: RunShellCommandFn, hooks: ShellToolHooks = {}) {
  return tool({
    description:
      'Run a shell command in a sandboxed PTY visible to the user. ' +
      "Returns the command's combined stdout+stderr when it completes. " +
      'The user can see the output in real time and type into the terminal while the command is running.',
    parameters: shellParametersSchema,
    execute: async ({ command, cwd, timeoutMs, targetPtyId }) => {
      let result: ShellCommandResult;
      try {
        const opts: {
          command: string;
          cwd?: string;
          timeoutMs?: number;
          targetPtyId?: string;
        } = { command };
        if (cwd !== undefined) opts.cwd = cwd;
        if (timeoutMs !== undefined) opts.timeoutMs = timeoutMs;
        if (targetPtyId !== undefined) opts.targetPtyId = targetPtyId;
        result = await runShellCommand(opts);
      } catch (err) {
        hooks.onError?.(command, err);
        const message = err instanceof Error ? err.message : String(err);
        return { success: false as const, ptyId: null, output: '', error: message };
      }

      const { ptyId, output: outputPromise } = result;
      hooks.onSpawn?.(ptyId, command);

      let output: string;
      try {
        output = await outputPromise;
      } catch (err) {
        hooks.onError?.(command, err);
        const message = err instanceof Error ? err.message : String(err);
        return { success: false as const, ptyId, output: '', error: message };
      }

      hooks.onExit?.(ptyId, output);
      return { success: true as const, ptyId, output };
    },
  });
}

/** Convenience re-export of the Zod schema so callers can validate independently. */
export { shellParametersSchema };
