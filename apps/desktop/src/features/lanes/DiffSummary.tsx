/**
 * DiffSummary — compact per-file diff viewer for the lane card.
 *
 * Renders a flat list of changed files with +N/-M line counts.  Each row can
 * be expanded to reveal the raw unified diff hunks.
 */

import { useState } from 'react';
import type { FileDiff } from '@/lib/ipc/git';

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusColor(status: FileDiff['status']): string {
  switch (status) {
    case 'added':
      return 'text-green-400';
    case 'deleted':
      return 'text-red-400';
    case 'renamed':
      return 'text-yellow-400';
    default:
      return 'text-blue-400';
  }
}

function statusBadge(status: FileDiff['status']): string {
  switch (status) {
    case 'added':
      return 'A';
    case 'deleted':
      return 'D';
    case 'renamed':
      return 'R';
    default:
      return 'M';
  }
}

// ── Components ────────────────────────────────────────────────────────────────

interface HunkViewProps {
  diff: FileDiff;
}

function HunkView({ diff }: HunkViewProps) {
  return (
    <div className="mt-1 overflow-x-auto rounded bg-[hsl(var(--muted))] p-2 font-mono text-xs leading-5">
      {diff.hunks.map((hunk, hi) => (
        <div key={hi}>
          <div className="text-[hsl(var(--muted-foreground))]">
            @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
          </div>
          {hunk.lines.map((line, li) => (
            <div
              key={li}
              className={
                line.type === 'add'
                  ? 'text-green-400'
                  : line.type === 'del'
                    ? 'text-red-400'
                    : 'text-[hsl(var(--muted-foreground))]'
              }
            >
              {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}
              {line.text}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

interface FileRowProps {
  diff: FileDiff;
}

function FileRow({ diff }: FileRowProps) {
  const [expanded, setExpanded] = useState(false);
  const hasHunks = diff.hunks.length > 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => hasHunks && setExpanded((v) => !v)}
        className={[
          'flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs',
          hasHunks ? 'cursor-pointer hover:bg-[hsl(var(--accent))]' : 'cursor-default',
        ].join(' ')}
        aria-expanded={expanded}
      >
        {/* Status badge */}
        <span
          className={['w-4 shrink-0 text-center font-bold', statusColor(diff.status)].join(' ')}
        >
          {statusBadge(diff.status)}
        </span>

        {/* File path — truncated from the left so the filename stays visible */}
        <span className="min-w-0 flex-1 truncate text-[hsl(var(--foreground))]" dir="rtl">
          {diff.path}
        </span>

        {/* +N/-M counters */}
        <span className="shrink-0 text-green-400">+{diff.additions}</span>
        <span className="shrink-0 text-red-400">-{diff.deletions}</span>

        {/* Expand toggle */}
        {hasHunks && (
          <span className="shrink-0 text-[hsl(var(--muted-foreground))]">
            {expanded ? '▲' : '▼'}
          </span>
        )}
      </button>

      {expanded && <HunkView diff={diff} />}
    </div>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export interface DiffSummaryProps {
  diffs: FileDiff[];
  /** Optional CSS class applied to the root element. */
  className?: string;
}

export function DiffSummary({ diffs, className = '' }: DiffSummaryProps) {
  if (diffs.length === 0) {
    return (
      <p className={['text-xs text-[hsl(var(--muted-foreground))]', className].join(' ')}>
        No file changes yet.
      </p>
    );
  }

  const totalAdditions = diffs.reduce((n, d) => n + d.additions, 0);
  const totalDeletions = diffs.reduce((n, d) => n + d.deletions, 0);

  return (
    <div className={['space-y-0.5', className].join(' ')}>
      {/* Summary header */}
      <div className="mb-1 flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
        <span>
          {diffs.length} file{diffs.length !== 1 ? 's' : ''} changed
        </span>
        <span className="text-green-400">+{totalAdditions}</span>
        <span className="text-red-400">-{totalDeletions}</span>
      </div>

      {/* File rows */}
      {diffs.map((diff) => (
        <FileRow key={diff.path} diff={diff} />
      ))}
    </div>
  );
}
