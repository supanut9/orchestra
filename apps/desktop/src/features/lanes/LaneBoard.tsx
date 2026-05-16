import { useState } from 'react';
import { Wand2, Trash2 } from 'lucide-react';

import { useLanesStore } from '@/stores/lanes';
import { useCurrentWorkspace } from '@/stores/workspace';
import { useSettingsStore } from '@/stores/settings';
import { streamMessage } from '@/lib/ai/provider-registry';
import { LaneCard } from './LaneCard';

export function LaneBoard() {
  const { lanes, goal, isProposing, error, setGoal, setProposing, setError, addLanes, clearAll } =
    useLanesStore();
  const currentWorkspace = useCurrentWorkspace();
  const activeProviderId = useSettingsStore((s) => s.activeProviderId);
  const providers = useSettingsStore((s) => s.providers);

  const [isLocalBusy, setLocalBusy] = useState(false);

  const activeConfig = activeProviderId ? providers[activeProviderId] : undefined;

  async function handlePropose() {
    if (!goal.trim()) return;
    setProposing(true);
    setLocalBusy(true);
    setError(null);
    try {
      const { Coordinator } = await import('@orchestra/ai-runtime');
      const coordinator = new Coordinator();
      const plans = await coordinator.decomposeTask(goal);
      addLanes(plans.map((p) => ({ id: p.id, title: p.title, description: p.description })));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProposing(false);
      setLocalBusy(false);
    }
  }

  const laneStream = activeConfig
    ? (prompt: string, onChunk: (c: string) => void, signal: AbortSignal) =>
        streamMessage({
          config: activeConfig,
          messages: [{ role: 'user', content: prompt }],
          onChunk,
          signal,
        })
    : undefined;

  return (
    <div className="flex h-full flex-col bg-[hsl(var(--background))]">
      <div className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-3">
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          Goal
        </label>
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Describe what you want done across parallel lanes…"
          rows={2}
          className="w-full resize-y rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm placeholder-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={handlePropose}
            disabled={!goal.trim() || isProposing || isLocalBusy}
            className="flex items-center gap-1.5 rounded bg-[hsl(var(--primary))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Wand2 className="h-3 w-3" />
            {isProposing ? 'Proposing…' : 'Propose Lanes'}
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={lanes.length === 0}
            className="flex items-center gap-1.5 rounded bg-[hsl(var(--muted))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--muted-foreground))] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-3 w-3" />
            Clear All
          </button>
          {error && <span className="text-xs text-red-400">{error}</span>}
          {!currentWorkspace && (
            <span className="text-xs text-[hsl(var(--muted-foreground))]">
              Open a workspace to enable worktree-backed lanes
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {lanes.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-[hsl(var(--muted-foreground))]">
            No lanes yet. Enter a goal and click Propose to start.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {lanes.map((lane) => (
              <LaneCard
                key={lane.id}
                lane={lane}
                {...(laneStream ? { streamMessage: laneStream } : {})}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
