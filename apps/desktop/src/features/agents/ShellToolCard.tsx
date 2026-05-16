/**
 * ShellToolCard — inline agent tool-call card rendered inside the chat stream.
 *
 * Displays:
 *  - The shell command being run
 *  - Live status: running / done / error
 *  - Elapsed time
 *  - Truncated output preview (expandable)
 *  - "Jump to terminal" button that dispatches to the terminal panel
 *
 * Styled to match ChatMessage bubbles (uses the same CSS custom properties).
 */

import { useState, useEffect, useRef } from 'react';
import type { ShellToolCall } from '@/stores/agent';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Props {
  toolCall: ShellToolCall;
  /** Optional callback to highlight / focus the PTY tab in the terminal panel. */
  onJumpToTerminal?: (ptyId: string) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatElapsed(startedAt: number, finishedAt: number | null): string {
  const endMs = finishedAt ?? Date.now();
  const elapsed = endMs - startedAt;
  if (elapsed < 1000) return `${elapsed}ms`;
  return `${(elapsed / 1000).toFixed(1)}s`;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ShellToolCard({ toolCall, onJumpToTerminal }: Props) {
  const { command, ptyId, status, startedAt, finishedAt, output, error } = toolCall;

  // Live elapsed timer while running
  const [elapsed, setElapsed] = useState(() => formatElapsed(startedAt, finishedAt));
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (status !== 'running') {
      setElapsed(formatElapsed(startedAt, finishedAt));
      if (timerRef.current !== null) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setElapsed(formatElapsed(startedAt, null));
    }, 200);
    return () => {
      if (timerRef.current !== null) clearInterval(timerRef.current);
    };
  }, [status, startedAt, finishedAt]);

  const [expanded, setExpanded] = useState(false);
  const outputPreview = output.slice(0, 300);
  const outputFull = output;
  const hasMore = output.length > 300;
  const displayOutput = expanded ? outputFull : outputPreview;

  // ── Derived styles ───────────────────────────────────────────────────────────

  const statusColor =
    status === 'running'
      ? 'text-yellow-400'
      : status === 'done'
        ? 'text-green-400'
        : 'text-red-400';

  const statusIcon =
    status === 'running' ? (
      // Spinner
      <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
    ) : status === 'done' ? (
      <span aria-label="done">&#10003;</span>
    ) : (
      <span aria-label="error">&#10007;</span>
    );

  return (
    <div
      className="my-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] text-xs overflow-hidden"
      data-testid="shell-tool-card"
      data-pty-id={ptyId ?? undefined}
      data-status={status}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/40">
        {/* Status icon */}
        <span className={`shrink-0 ${statusColor}`}>{statusIcon}</span>

        {/* Command */}
        <code className="flex-1 font-mono text-[11px] truncate" title={command}>
          $ {command}
        </code>

        {/* Elapsed */}
        <span className="shrink-0 tabular-nums text-[hsl(var(--muted-foreground))]">{elapsed}</span>

        {/* Jump to terminal */}
        {ptyId && onJumpToTerminal && (
          <button
            onClick={() => onJumpToTerminal(ptyId)}
            className="shrink-0 ml-1 px-2 py-0.5 rounded text-[10px] border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors"
            title={`Jump to terminal ${ptyId}`}
          >
            Terminal
          </button>
        )}
      </div>

      {/* Output / error body — only shown when there's something to display */}
      {(status === 'done' || status === 'error') && (
        <div className="px-3 py-2">
          {status === 'error' && error && <p className="text-red-400 mb-1 font-medium">{error}</p>}
          {displayOutput && (
            <>
              <pre className="font-mono text-[11px] whitespace-pre-wrap break-all leading-relaxed text-[hsl(var(--muted-foreground))] max-h-40 overflow-y-auto">
                {displayOutput}
              </pre>
              {hasMore && (
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors underline"
                >
                  {expanded ? 'Show less' : `Show ${output.length - 300} more chars`}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
