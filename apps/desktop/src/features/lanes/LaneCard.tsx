/**
 * LaneCard — self-contained card for a single parallel task lane.
 *
 * Responsibilities:
 *   - Render title, description, and a status badge.
 *   - Show Approve / Discard buttons for proposed lanes.
 *   - Show Merge / Discard buttons for running lanes.
 *   - Poll gitWorktreeDiff every 3 s while the lane is running and display the
 *     results via DiffSummary.
 *   - Display a mini terminal-output area (plain text) when a PTY is attached.
 *
 * All IPC calls and store mutations are handled here so LaneBoard stays thin.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { nanoid } from 'nanoid';
import { DiffSummary } from './DiffSummary';
import type { FileDiff } from '@/lib/ipc/git';
import {
  gitWorktreeAdd,
  gitWorktreeDiff,
  gitWorktreeMerge,
  gitWorktreeRemove,
} from '@/lib/ipc/git';
import { ptySpawn, subscribeToPtyOutput } from '@/lib/ipc/pty';
import { useLanesStore } from '@/stores/lanes';
import type { Lane } from '@/stores/lanes';
import { useCurrentWorkspace } from '@/stores/workspace';

// ── Constants ─────────────────────────────────────────────────────────────────

const DIFF_POLL_INTERVAL_MS = 3_000;
const TERMINAL_MAX_LINES = 200;

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<Lane['status'], string> = {
  proposed: 'Proposed',
  approved: 'Approved',
  running: 'Running',
  merged: 'Merged',
  discarded: 'Discarded',
};

const STATUS_COLORS: Record<Lane['status'], string> = {
  proposed: 'bg-yellow-500/20 text-yellow-300',
  approved: 'bg-blue-500/20 text-blue-300',
  running: 'bg-green-500/20 text-green-300',
  merged: 'bg-purple-500/20 text-purple-300',
  discarded: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
};

function StatusBadge({ status }: { status: Lane['status'] }) {
  return (
    <span
      className={['rounded-full px-2 py-0.5 text-xs font-medium', STATUS_COLORS[status]].join(' ')}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

// ── Mini terminal preview ─────────────────────────────────────────────────────

interface MiniTerminalProps {
  ptyId: string;
}

function MiniTerminal({ ptyId }: MiniTerminalProps) {
  const [lines, setLines] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const pendingRef = useRef('');

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    subscribeToPtyOutput(ptyId, (bytes) => {
      const text = new TextDecoder().decode(bytes);
      // Accumulate until we see newlines then split into display lines
      pendingRef.current += text;
      const parts = pendingRef.current.split('\n');
      pendingRef.current = parts.pop() ?? '';

      if (parts.length > 0) {
        setLines((prev) => {
          const next = [...prev, ...parts].slice(-TERMINAL_MAX_LINES);
          return next;
        });
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [ptyId]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines]);

  return (
    <div
      ref={containerRef}
      className="mt-2 h-24 overflow-y-auto rounded bg-black/60 p-2 font-mono text-[10px] leading-4 text-green-300"
      aria-label="Terminal output preview"
    >
      {lines.length === 0 ? (
        <span className="text-[hsl(var(--muted-foreground))]">Waiting for output…</span>
      ) : (
        lines.map((line, i) => (
          <div key={i} className="whitespace-pre-wrap break-all">
            {line}
          </div>
        ))
      )}
    </div>
  );
}

// ── LaneCard ──────────────────────────────────────────────────────────────────

export interface LaneCardProps {
  lane: Lane;
  /**
   * Injected agent runner. Called once after the worktree + PTY are spawned;
   * receives the lane's ptyId so the shell tool can target it via
   * targetPtyId, and the agent session id for ownership badging.
   * Provider-agnostic so the card can be unit-tested without an LLM.
   */
  streamMessage?: (
    prompt: string,
    ptyId: string,
    sessionId: string,
    onChunk: (chunk: string) => void,
    signal: AbortSignal,
  ) => Promise<void>;
}

export function LaneCard({ lane, streamMessage }: LaneCardProps) {
  const { approveLane, markLaneRunning, markLaneMerged, discardLane, setError } = useLanesStore();
  const currentWorkspace = useCurrentWorkspace();

  const [diffs, setDiffs] = useState<FileDiff[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Diff polling ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (lane.status !== 'running' || !currentWorkspace || !lane.worktreePath) return;

    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const result = await gitWorktreeDiff(currentWorkspace.folders[0]!.path, lane.id);
        if (!cancelled) setDiffs(result);
      } catch {
        // Silently ignore transient errors; the diff will update on the next poll
      }
    };

    poll();
    const timer = setInterval(poll, DIFF_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [lane.status, lane.id, lane.worktreePath, currentWorkspace]);

  // ── Approve action ────────────────────────────────────────────────────────

  const handleApprove = useCallback(async () => {
    if (!currentWorkspace) {
      setLocalError('No workspace is open — open a folder first.');
      return;
    }

    setIsBusy(true);
    setLocalError(null);

    try {
      // 1. Mark approved in the store so the badge updates immediately
      approveLane(lane.id);

      // 2. Create git worktree
      const branchName = `orchestra/${lane.id}`;
      const worktreeInfo = await gitWorktreeAdd(
        currentWorkspace.folders[0]!.path,
        lane.id,
        branchName,
      );

      // 3. Spawn a PTY in the worktree directory
      const agentSessionId = nanoid();
      const ptyId = await ptySpawn(lane.title, ['bash'], worktreeInfo.path, {
        kind: 'agent',
        sessionId: agentSessionId,
      });

      // 4. Update store → running
      markLaneRunning(lane.id, {
        worktreePath: worktreeInfo.path,
        branchName: worktreeInfo.branch,
        ptyId,
        agentSessionId,
      });

      // 5. Kick off the agent (fire-and-forget; errors are non-fatal)
      if (streamMessage) {
        const prompt =
          `You are working on lane "${lane.title}". ` +
          `Goal: ${lane.description}. ` +
          `The worktree is at ${worktreeInfo.path}. ` +
          `Use the shell tool to make progress on the goal. Remember to pass ` +
          `targetPtyId="${ptyId}" on every shell call so the user can watch.`;

        const abort = new AbortController();
        abortRef.current = abort;

        streamMessage(prompt, ptyId, agentSessionId, () => {}, abort.signal).catch(
          (err: unknown) => {
            if ((err as Error)?.name !== 'AbortError') {
              console.warn(`[Lane ${lane.id}] agent stream error:`, err);
            }
          },
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLocalError(msg);
      setError(msg);
      discardLane(lane.id);
    } finally {
      setIsBusy(false);
    }
  }, [lane, currentWorkspace, approveLane, markLaneRunning, discardLane, setError, streamMessage]);

  // ── Discard action ────────────────────────────────────────────────────────

  const handleDiscard = useCallback(async () => {
    if (isBusy) return;

    // Abort any running agent stream
    abortRef.current?.abort();

    setIsBusy(true);
    setLocalError(null);

    try {
      if (currentWorkspace && lane.worktreePath) {
        await gitWorktreeRemove(currentWorkspace.folders[0]!.path, lane.id);
      }
      discardLane(lane.id);
    } catch (err) {
      // Even if cleanup fails, mark discarded so the UI doesn't get stuck
      discardLane(lane.id);
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[Lane ${lane.id}] cleanup error:`, msg);
    } finally {
      setIsBusy(false);
    }
  }, [isBusy, lane, currentWorkspace, discardLane]);

  // ── Merge action ──────────────────────────────────────────────────────────

  const handleMerge = useCallback(async () => {
    if (!currentWorkspace || isBusy) return;

    // Abort running agent before merging
    abortRef.current?.abort();

    setIsBusy(true);
    setLocalError(null);

    try {
      await gitWorktreeMerge(currentWorkspace.folders[0]!.path, lane.id, 'main');
      markLaneMerged(lane.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLocalError(msg);
      setError(msg);
    } finally {
      setIsBusy(false);
    }
  }, [currentWorkspace, isBusy, lane.id, markLaneMerged, setError]);

  // ── Render ────────────────────────────────────────────────────────────────

  const isTerminal = lane.status === 'merged' || lane.status === 'discarded';

  return (
    <div
      className={[
        'flex flex-col gap-3 rounded-lg border p-4 transition-opacity',
        'border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--card-foreground))]',
        isTerminal ? 'opacity-60' : 'opacity-100',
      ].join(' ')}
      data-lane-id={lane.id}
      data-lane-status={lane.status}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{lane.title}</h3>
        </div>
        <StatusBadge status={lane.status} />
      </div>

      {/* Description */}
      <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
        {lane.description}
      </p>

      {/* Worktree path (when set) */}
      {lane.worktreePath && (
        <p className="truncate font-mono text-[10px] text-[hsl(var(--muted-foreground))]">
          {lane.worktreePath}
        </p>
      )}

      {/* Mini terminal preview */}
      {lane.status === 'running' && lane.ptyId && <MiniTerminal ptyId={lane.ptyId} />}

      {/* Diff summary */}
      {lane.status === 'running' && <DiffSummary diffs={diffs} className="mt-1" />}

      {/* Final diff snapshot after merge */}
      {lane.status === 'merged' && diffs.length > 0 && (
        <DiffSummary diffs={diffs} className="mt-1" />
      )}

      {/* Error */}
      {localError && <p className="rounded bg-red-900/30 p-2 text-xs text-red-400">{localError}</p>}

      {/* Action buttons */}
      {!isTerminal && (
        <div className="flex flex-wrap gap-2">
          {lane.status === 'proposed' && (
            <>
              <button
                type="button"
                onClick={handleApprove}
                disabled={isBusy}
                className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isBusy ? 'Approving…' : 'Approve'}
              </button>
              <button
                type="button"
                onClick={handleDiscard}
                disabled={isBusy}
                className="rounded bg-[hsl(var(--muted))] px-3 py-1 text-xs font-medium hover:bg-[hsl(var(--accent))] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Discard
              </button>
            </>
          )}

          {lane.status === 'running' && (
            <>
              <button
                type="button"
                onClick={handleMerge}
                disabled={isBusy}
                className="rounded bg-purple-600 px-3 py-1 text-xs font-medium text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isBusy ? 'Merging…' : 'Merge to main'}
              </button>
              <button
                type="button"
                onClick={handleDiscard}
                disabled={isBusy}
                className="rounded bg-red-800/60 px-3 py-1 text-xs font-medium text-red-300 hover:bg-red-700/60 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Discard
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
