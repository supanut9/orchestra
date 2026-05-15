import { useState } from 'react';
import { FileTree } from '@/features/workspace/FileTree';
import { OpenWorkspaceButton } from '@/features/workspace/OpenWorkspaceButton';
import { Editor } from '@/features/editor/Editor';
import { AgentPanel } from '@/features/agents/AgentPanel';
import { TerminalGrid } from '@/features/terminal/TerminalGrid';
import { ServiceDashboard } from '@/features/services/ServiceDashboard';
import { useWorkspaceStore } from '@/stores/workspace';
import { cn } from '@/lib/utils';

type BottomTab = 'terminal' | 'services';

export function App() {
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace);
  const [bottomTab, setBottomTab] = useState<BottomTab>('terminal');

  return (
    <div className="flex h-full select-none flex-col bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <header className="flex h-10 shrink-0 items-center gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4">
        <span className="text-sm font-semibold tracking-wide">Orchestra</span>
        <span className="text-xs text-[hsl(var(--muted-foreground))]">— AI-native IDE</span>
        <div className="ml-auto flex items-center gap-2 text-xs">
          {currentWorkspace ? (
            <span className="rounded bg-[hsl(var(--muted))] px-2 py-0.5">
              {currentWorkspace.name}
            </span>
          ) : (
            <span className="rounded bg-[hsl(var(--muted))] px-2 py-0.5 text-[hsl(var(--muted-foreground))]">
              No workspace open
            </span>
          )}
          <OpenWorkspaceButton />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-56 shrink-0 flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--card))]">
          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            Explorer
          </div>
          <div className="flex-1 overflow-y-auto">
            <FileTree />
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <Editor />
          </div>

          <div className="h-64 shrink-0 border-t border-[hsl(var(--border))]">
            <div className="flex h-8 items-center gap-0 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2">
              <BottomTabButton
                active={bottomTab === 'terminal'}
                onClick={() => setBottomTab('terminal')}
              >
                Terminal
              </BottomTabButton>
              <BottomTabButton
                active={bottomTab === 'services'}
                onClick={() => setBottomTab('services')}
              >
                Services
              </BottomTabButton>
            </div>
            <div className="h-[calc(100%-2rem)]">
              {bottomTab === 'terminal' ? <TerminalGrid /> : <ServiceDashboard />}
            </div>
          </div>
        </main>

        <aside className="flex w-80 shrink-0 flex-col border-l border-[hsl(var(--border))] bg-[hsl(var(--card))]">
          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            Agent
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <AgentPanel />
          </div>
        </aside>
      </div>
    </div>
  );
}

function BottomTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-full px-3 text-xs font-medium uppercase tracking-wider transition-colors',
        active
          ? 'border-b-2 border-[hsl(var(--accent))] text-[hsl(var(--foreground))]'
          : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]',
      )}
    >
      {children}
    </button>
  );
}
