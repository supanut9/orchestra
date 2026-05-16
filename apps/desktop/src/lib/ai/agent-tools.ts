/**
 * agent-tools.ts — Desktop bridge between the ai-runtime shell tool and Tauri PTY IPC.
 *
 * Responsibilities:
 *  1. `createShellRunner(sessionId, workspacePath)` — returns a `runShellCommand`
 *     callback compatible with `shellTool()` from @orchestra/ai-runtime.
 *  2. `streamWithTools(...)` — wraps streamText with tool support so AgentPanel
 *     can opt into tool-enabled streaming without touching the frozen provider-registry.
 *
 * This file MAY import from `@/lib/ipc/pty` (frozen, but readable).
 * It MUST NOT import from the blacklisted provider-registry, memory-bridge or index.
 */

import {
  ptySpawn,
  ptyKill,
  ptyWrite,
  encodePtyInput,
  subscribeToPtyOutput,
  subscribeToPtyStatus,
} from '@/lib/ipc/pty';
import type { ProviderConfig } from '@/stores/settings';

// ── Types re-exported for consumers ───────────────────────────────────────────

export interface RunShellCommandOpts {
  command: string;
  cwd?: string;
  timeoutMs?: number;
  /** If supplied, write into this PTY instead of spawning a new one. */
  targetPtyId?: string;
}

export interface ShellCommandResult {
  ptyId: string;
  output: Promise<string>;
}

// ── Command tokenizer ──────────────────────────────────────────────────────────

/**
 * Minimal shell tokenizer — splits `command` into argv tokens.
 * Handles single-quoted and double-quoted strings; no variable expansion.
 * Keeps this light so we don't need an npm dep just for tokenizing.
 *
 * Examples:
 *   'npm test'            → ['npm', 'test']
 *   'git commit -m "hi"' → ['git', 'commit', '-m', 'hi']
 *   "echo 'hello world'" → ['echo', 'hello world']
 */
export function tokenizeCommand(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!;

    if (inSingle) {
      if (ch === "'") {
        inSingle = false;
      } else {
        current += ch;
      }
      continue;
    }

    if (inDouble) {
      if (ch === '"') {
        inDouble = false;
      } else if (ch === '\\' && i + 1 < command.length) {
        // Basic escape sequences inside double-quotes
        i++;
        const next = command[i]!;
        current += next === 'n' ? '\n' : next === 't' ? '\t' : next;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === "'") {
      inSingle = true;
    } else if (ch === '"') {
      inDouble = true;
    } else if (ch === ' ' || ch === '\t') {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

// ── Shell runner factory ───────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Run `command` inside an existing PTY (one the user already handed to this
 * agent via the "Hand to AI" toggle).
 *
 * The PTY hosts an interactive shell, so there is no process-exit signal to
 * wait on. We append a unique sentinel echo to the command and resolve when
 * we see that sentinel come back through stdout.
 */
async function runInAttachedPty(
  ptyId: string,
  command: string,
  timeoutMs: number,
): Promise<ShellCommandResult> {
  const sentinel = `__ORCH_DONE_${Math.random().toString(36).slice(2, 10)}__`;
  // Stripping the start-of-line sentinel out of the output keeps the agent's
  // result clean. We still leave it visible in the terminal so the user can
  // see "the agent finished" markers if they read along.
  const wrapped = `${command}; echo ${sentinel}\n`;

  const output = new Promise<string>((resolve, reject) => {
    let accumulated = '';
    let unlistenOutput: (() => void) | null = null;
    let settled = false;

    const cleanup = () => {
      unlistenOutput?.();
    };

    const settle = (text: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(text);
    };

    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const timer = setTimeout(() => {
      fail(
        new Error(
          `shellTool: command "${command}" did not complete within ${timeoutMs} ms in attached PTY ${ptyId}`,
        ),
      );
    }, timeoutMs);

    subscribeToPtyOutput(ptyId, (bytes: Uint8Array) => {
      accumulated += new TextDecoder().decode(bytes);
      const idx = accumulated.indexOf(sentinel);
      if (idx >= 0) {
        clearTimeout(timer);
        // Strip the sentinel and everything after it (next prompt).
        settle(accumulated.slice(0, idx).replace(/\r?\n$/, ''));
      }
    })
      .then((fn) => {
        unlistenOutput = fn;
      })
      .catch(fail);
  });

  try {
    await ptyWrite(ptyId, encodePtyInput(wrapped));
  } catch (err) {
    throw new Error(
      `shellTool: pty_write failed for ${ptyId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return { ptyId, output };
}

/**
 * Create a `runShellCommand` function bound to a specific agent session.
 *
 * The returned function:
 *  1. Spawns a new PTY labeled with the first 30 chars of the command.
 *  2. Subscribes to `pty.output` and accumulates decoded text.
 *  3. Subscribes to `pty.status` and resolves the output promise on exit.
 *  4. Applies `timeoutMs` (default 30 s) — kills the PTY and rejects on timeout.
 *
 * @param sessionId      The agent session ID — set as the PTY owner so the UI
 *                       can badge the terminal tab with the agent's identity.
 * @param workspacePath  Fallback CWD when the caller doesn't supply one.
 */
export function createShellRunner(
  sessionId: string,
  workspacePath: string | null,
): (opts: RunShellCommandOpts) => Promise<ShellCommandResult> {
  return async function runShellCommand({
    command,
    cwd,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    targetPtyId,
  }) {
    // ── Attached-PTY path: write into an existing user-watched terminal ────
    if (targetPtyId) {
      return runInAttachedPty(targetPtyId, command, timeoutMs);
    }

    const effectiveCwd =
      cwd ?? workspacePath ?? (typeof process !== 'undefined' ? (process.env['HOME'] ?? '/') : '/');

    const label = `agent: ${command.slice(0, 30)}`;
    const argv = tokenizeCommand(command);
    if (argv.length === 0) {
      throw new Error(`shellTool: empty command string`);
    }

    // Spawn the PTY — owner marks it as agent-owned for the terminal badge
    const ptyId = await ptySpawn(label, argv, effectiveCwd, { kind: 'agent', sessionId });

    // Build the output-accumulation promise before setting up the subscription
    // so we never miss early bytes.
    const output = new Promise<string>((resolve, reject) => {
      let accumulated = '';
      let unlistenOutput: (() => void) | null = null;
      let unlistenStatus: (() => void) | null = null;
      let settled = false;

      const cleanup = () => {
        unlistenOutput?.();
        unlistenStatus?.();
      };

      const settle = (value: string) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };

      const fail = (err: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      };

      // Timeout guard
      const timer = setTimeout(() => {
        ptyKill(ptyId).catch(() => {
          /* best-effort */
        });
        fail(new Error(`shellTool: command "${command}" timed out after ${timeoutMs} ms`));
      }, timeoutMs);

      // Subscribe to output bytes
      subscribeToPtyOutput(ptyId, (bytes: Uint8Array) => {
        accumulated += new TextDecoder().decode(bytes);
      })
        .then((fn) => {
          unlistenOutput = fn;
        })
        .catch(fail);

      // Subscribe to status changes — resolve when exited/crashed
      subscribeToPtyStatus((payload) => {
        if (payload.ptyId !== ptyId) return;
        if (payload.status === 'exited' || payload.status === 'crashed') {
          clearTimeout(timer);
          settle(accumulated);
        }
      })
        .then((fn) => {
          unlistenStatus = fn;
        })
        .catch(fail);
    });

    return { ptyId, output };
  };
}

// ── streamWithTools ────────────────────────────────────────────────────────────

/**
 * Tool-enabled streaming helper — wraps `streamText` from @orchestra/ai-runtime/stream
 * with tool support.  AgentPanel calls this when tools are wired up; it falls back
 * to the original `streamMessage` when no tools are provided.
 *
 * This function mirrors the signature of `streamMessage` in provider-registry.ts
 * but adds `tools`, `onToolCall`, and `onToolResult` parameters so callers can
 * observe the full agentic loop without touching the frozen registry.
 */
export async function streamWithTools(opts: {
  config: ProviderConfig;
  messages: { role: 'user' | 'assistant'; content: string }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: Record<string, any>;
  onChunk: (chunk: string) => void;
  onToolCall?: (event: {
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
  }) => void;
  onToolResult?: (event: { toolCallId: string; toolName: string; result: unknown }) => void;
  signal?: AbortSignal;
}): Promise<void> {
  // Dynamic import keeps @orchestra/ai-runtime out of the initial bundle
  const { createProvider } = await import('@orchestra/ai-runtime');
  const { streamText } = await import('@orchestra/ai-runtime/stream');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = createProvider(opts.config as any);

  const result = streamText({
    model,
    messages: opts.messages,
    tools: opts.tools,
    maxSteps: 5,
    ...(opts.signal ? { abortSignal: opts.signal } : {}),
  });

  for await (const chunk of result.textStream) {
    if (opts.signal?.aborted) break;
    opts.onChunk(chunk);
  }

  // Drain tool-call/result events from completed steps
  if (opts.onToolCall || opts.onToolResult) {
    try {
      const steps = await result.steps;
      for (const step of steps) {
        if (opts.onToolCall && step.toolCalls) {
          for (const tc of step.toolCalls as Array<{
            toolCallId: string;
            toolName: string;
            args: unknown;
          }>) {
            opts.onToolCall({
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              args: tc.args as Record<string, unknown>,
            });
          }
        }
        if (opts.onToolResult && step.toolResults) {
          for (const tr of step.toolResults as Array<{
            toolCallId: string;
            toolName: string;
            result: unknown;
          }>) {
            opts.onToolResult({
              toolCallId: tr.toolCallId,
              toolName: tr.toolName,
              result: tr.result,
            });
          }
        }
      }
    } catch {
      // Aborted streams will throw here — swallow silently.
    }
  }
}
