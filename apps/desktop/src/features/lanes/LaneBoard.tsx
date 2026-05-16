import { useState } from 'react';
import { Wand2, Trash2 } from 'lucide-react';

import { useLanesStore } from '@/stores/lanes';
import { useCurrentWorkspace } from '@/stores/workspace';
import { useSettingsStore, isCliProvider } from '@/stores/settings';
import { getProviderModel } from '@/lib/ai/provider-registry';
import { createShellRunner, streamWithTools } from '@/lib/ai/agent-tools';
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
      // Build a Coordinator wired to the active provider so decomposition uses
      // the real LLM. CLI providers (claude-cli / codex-cli / gemini-cli) don't
      // expose a Vercel AI SDK LanguageModel, so we fall back to mock lanes for
      // those until CLI-shelled decomposition lands.
      const canUseModel = !!activeConfig && !isCliProvider(activeConfig);
      const model = canUseModel ? await getProviderModel(activeConfig!) : undefined;
      const coordinator = new Coordinator(model ? { model } : {});
      const plans = await coordinator.decomposeTask(goal);
      addLanes(plans.map((p) => ({ id: p.id, title: p.title, description: p.description })));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProposing(false);
      setLocalBusy(false);
    }
  }

  const workspacePath = currentWorkspace?.folders[0]?.path ?? null;

  // Tool-enabled lane runner: the agent gets a shell tool bound to the
  // lane's own bash PTY (via targetPtyId in the system prompt) so the user
  // can watch every command execute in the lane card's MiniTerminal.
  //
  // Skipped for CLI providers — they don't go through the Vercel AI SDK so
  // streamWithTools won't work. The worktree + bash still get spawned so the
  // user can drive the lane manually.
  const laneStream = activeConfig && !isCliProvider(activeConfig)
    ? async (
        prompt: string,
        ptyId: string,
        sessionId: string,
        onChunk: (c: string) => void,
        signal: AbortSignal,
      ) => {
        const { shellTool } = await import('@orchestra/ai-runtime');
        const runShell = createShellRunner(sessionId, workspacePath);
        const tools = { shell: shellTool(runShell) };
        await streamWithTools({
          config: activeConfig,
          messages: [{ role: 'user', content: prompt }],
          system:
            `You are working inside a dedicated git worktree with a bash PTY ready for you. ` +
            `When you run the shell tool, ALWAYS pass targetPtyId="${ptyId}" so the user can ` +
            `watch your commands execute in the lane's terminal instead of in a fresh PTY.`,
          tools,
          onChunk,
          signal,
        });
      }
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
