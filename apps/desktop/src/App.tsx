import { FileTree } from '@/features/workspace/FileTree';
import { Editor } from '@/features/editor/Editor';
import { AgentPanel } from '@/features/agents/AgentPanel';
import { TerminalGrid } from '@/features/terminal/TerminalGrid';

/**
 * App — skeleton 3-pane IDE layout.
 *
 * ┌──────────────────────────────────────────────────┐
 * │  Top Bar                                         │
 * ├──────────┬───────────────────────┬───────────────┤
 * │ Left     │  Editor (center)      │ Right         │
 * │ Sidebar  │                       │ Sidebar       │
 * │ (file    │                       │ (agent chat)  │
 * │  tree)   │                       │               │
 * ├──────────┴───────────────────────┴───────────────┤
 * │  Bottom Panel (terminal grid)                    │
 * └──────────────────────────────────────────────────┘
 */
export function App() {
  return (
    <div className="flex flex-col h-full bg-[hsl(var(--background))] text-[hsl(var(--foreground))] select-none">
      {/* Top Bar */}
      <header className="flex items-center gap-3 px-4 h-10 shrink-0 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <span className="text-sm font-semibold tracking-wide">Orchestra</span>
        <span className="text-xs text-[hsl(var(--muted-foreground))]">— AI-native IDE</span>
        <div className="ml-auto flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
          <span className="rounded bg-[hsl(var(--muted))] px-2 py-0.5">No workspace open</span>
        </div>
      </header>

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* Left Sidebar — Workspace + File Tree */}
        <aside className="flex flex-col w-56 shrink-0 border-r border-[hsl(var(--border))] bg-[hsl(var(--card))]">
          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            Explorer
          </div>
          <div className="flex-1 overflow-y-auto">
            <FileTree />
          </div>
        </aside>

        {/* Center — Editor */}
        <main className="flex flex-col flex-1 min-w-0">
          {/* Editor takes upper portion */}
          <div className="flex-1 min-h-0">
            <Editor />
          </div>

          {/* Bottom Panel — Terminal Grid */}
          <div className="h-48 shrink-0 border-t border-[hsl(var(--border))]">
            <div className="flex items-center gap-2 px-3 h-8 bg-[hsl(var(--card))] border-b border-[hsl(var(--border))]">
              <span className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                Terminal
              </span>
            </div>
            <div className="h-[calc(100%-2rem)]">
              <TerminalGrid />
            </div>
          </div>
        </main>

        {/* Right Sidebar — Agent Chat */}
        <aside className="flex flex-col w-72 shrink-0 border-l border-[hsl(var(--border))] bg-[hsl(var(--card))]">
          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            Agent
          </div>
          <div className="flex-1 overflow-y-auto">
            <AgentPanel />
          </div>
        </aside>
      </div>
    </div>
  );
}
