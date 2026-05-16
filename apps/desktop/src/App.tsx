import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileTree } from '@/features/workspace/FileTree';
import { OpenWorkspaceButton } from '@/features/workspace/OpenWorkspaceButton';
import { WorkspaceSwitcher } from '@/features/workspace/WorkspaceSwitcher';
import { CommandPalette, type PaletteCommand } from '@/features/workspace/CommandPalette';
import { useWorkspaceStore } from '@/stores/workspace';
import { servicesRunAll } from '@/lib/ipc/services';
import { UpdateChecker } from '@/features/updater/UpdateChecker';
import { VersionBadge } from '@/features/about/VersionBadge';
import { Editor } from '@/features/editor/Editor';
import { AgentPanel } from '@/features/agents/AgentPanel';
import { TerminalGrid } from '@/features/terminal/TerminalGrid';
import { ServiceDashboard } from '@/features/services/ServiceDashboard';
import { LaneBoard } from '@/features/lanes/LaneBoard';
import { MCPManager } from '@/features/mcp/MCPManager';
import { SkillManager } from '@/features/skills/SkillManager';
import { MemoryHub } from '@/features/memory/MemoryHub';
import { useCurrentWorkspace } from '@/stores/workspace';
import { cn } from '@/lib/utils';

type BottomTab = 'terminal' | 'services' | 'lanes' | 'mcp' | 'skills' | 'memory';

const BOTTOM_HEIGHT_KEY = 'orchestra.bottomPanel.height';
const BOTTOM_HEIGHT_DEFAULT = 288; // matches old h-72 (18rem @ 16px)
const BOTTOM_HEIGHT_MIN = 80;
const BOTTOM_HEIGHT_MAX_RATIO = 0.85; // max % of viewport height

function loadBottomHeight(): number {
  if (typeof window === 'undefined') return BOTTOM_HEIGHT_DEFAULT;
  const raw = window.localStorage.getItem(BOTTOM_HEIGHT_KEY);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= BOTTOM_HEIGHT_MIN ? n : BOTTOM_HEIGHT_DEFAULT;
}

export function App() {
  const currentWorkspace = useCurrentWorkspace();
  const [bottomTab, setBottomTab] = useState<BottomTab>('terminal');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [bottomHeight, setBottomHeight] = useState<number>(() => loadBottomHeight());
  const draggingRef = useRef(false);

  useEffect(() => {
    window.localStorage.setItem(BOTTOM_HEIGHT_KEY, String(bottomHeight));
  }, [bottomHeight]);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const maxH = window.innerHeight * BOTTOM_HEIGHT_MAX_RATIO;
      const next = Math.min(Math.max(window.innerHeight - ev.clientY, BOTTOM_HEIGHT_MIN), maxH);
      setBottomHeight(next);
    };
    const onUp = () => {
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  const openFiles = useWorkspaceStore((s) => s.openFiles);
  const setActiveFile = useWorkspaceStore((s) => s.setActiveFile);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const commands = useMemo<PaletteCommand[]>(() => {
    const tabs: BottomTab[] = ['terminal', 'services', 'lanes', 'mcp', 'skills', 'memory'];
    const tabCmds: PaletteCommand[] = tabs.map((t) => ({
      id: `view:${t}`,
      group: 'View',
      title: `Show ${t.charAt(0).toUpperCase() + t.slice(1)} panel`,
      run: () => setBottomTab(t),
    }));

    const fileCmds: PaletteCommand[] = openFiles.map((f) => ({
      id: `file:${f.path}`,
      group: 'File',
      title: f.name,
      hint: f.path,
      run: () => setActiveFile(f.path),
    }));

    const workspacePath = currentWorkspace?.folders[0]?.path;
    const actionCmds: PaletteCommand[] = [];
    if (workspacePath) {
      actionCmds.push({
        id: 'services:run-all',
        group: 'Action',
        title: 'Run all services',
        run: async () => {
          setBottomTab('services');
          await servicesRunAll(workspacePath);
        },
      });
    }

    return [...tabCmds, ...fileCmds, ...actionCmds];
  }, [openFiles, setActiveFile, currentWorkspace]);

  return (
    <div className="flex h-full select-none flex-col bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <header className="flex h-10 shrink-0 items-center gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4">
        <span className="text-sm font-semibold tracking-wide">Orchestra</span>
        <VersionBadge />
        <span className="text-xs text-[hsl(var(--muted-foreground))]">— AI-native IDE</span>
        <div className="ml-auto flex items-center gap-2 text-xs">
          <UpdateChecker />
          <WorkspaceSwitcher />
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

          <div
            role="separator"
            aria-orientation="horizontal"
            onMouseDown={startResize}
            onDoubleClick={() => setBottomHeight(BOTTOM_HEIGHT_DEFAULT)}
            className="h-1 shrink-0 cursor-row-resize bg-[hsl(var(--border))] hover:bg-[hsl(var(--accent))] transition-colors"
            title="Drag to resize · double-click to reset"
          />

          <div
            className="shrink-0 border-t border-[hsl(var(--border))]"
            style={{ height: `${bottomHeight}px` }}
          >
            <div className="flex h-8 items-center gap-0 overflow-x-auto border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2">
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
              <BottomTabButton active={bottomTab === 'lanes'} onClick={() => setBottomTab('lanes')}>
                Lanes
              </BottomTabButton>
              <BottomTabButton active={bottomTab === 'mcp'} onClick={() => setBottomTab('mcp')}>
                MCP
              </BottomTabButton>
              <BottomTabButton
                active={bottomTab === 'skills'}
                onClick={() => setBottomTab('skills')}
              >
                Skills
              </BottomTabButton>
              <BottomTabButton
                active={bottomTab === 'memory'}
                onClick={() => setBottomTab('memory')}
              >
                Memory
              </BottomTabButton>
            </div>
            <div className="h-[calc(100%-2rem)]">
              {bottomTab === 'terminal' && <TerminalGrid />}
              {bottomTab === 'services' && <ServiceDashboard />}
              {bottomTab === 'lanes' && <LaneBoard />}
              {bottomTab === 'mcp' && <MCPManager />}
              {bottomTab === 'skills' && <SkillManager />}
              {bottomTab === 'memory' && <MemoryHub />}
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

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={commands}
      />
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
