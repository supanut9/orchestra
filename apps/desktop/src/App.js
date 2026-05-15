import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { FileTree } from '@/features/workspace/FileTree';
import { OpenWorkspaceButton } from '@/features/workspace/OpenWorkspaceButton';
import { Editor } from '@/features/editor/Editor';
import { AgentPanel } from '@/features/agents/AgentPanel';
import { TerminalGrid } from '@/features/terminal/TerminalGrid';
import { ServiceDashboard } from '@/features/services/ServiceDashboard';
import { useWorkspaceStore } from '@/stores/workspace';
import { cn } from '@/lib/utils';
export function App() {
    const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace);
    const [bottomTab, setBottomTab] = useState('terminal');
    return (_jsxs("div", { className: "flex h-full select-none flex-col bg-[hsl(var(--background))] text-[hsl(var(--foreground))]", children: [_jsxs("header", { className: "flex h-10 shrink-0 items-center gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4", children: [_jsx("span", { className: "text-sm font-semibold tracking-wide", children: "Orchestra" }), _jsx("span", { className: "text-xs text-[hsl(var(--muted-foreground))]", children: "\u2014 AI-native IDE" }), _jsxs("div", { className: "ml-auto flex items-center gap-2 text-xs", children: [currentWorkspace ? (_jsx("span", { className: "rounded bg-[hsl(var(--muted))] px-2 py-0.5", children: currentWorkspace.name })) : (_jsx("span", { className: "rounded bg-[hsl(var(--muted))] px-2 py-0.5 text-[hsl(var(--muted-foreground))]", children: "No workspace open" })), _jsx(OpenWorkspaceButton, {})] })] }), _jsxs("div", { className: "flex min-h-0 flex-1", children: [_jsxs("aside", { className: "flex w-56 shrink-0 flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--card))]", children: [_jsx("div", { className: "px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]", children: "Explorer" }), _jsx("div", { className: "flex-1 overflow-y-auto", children: _jsx(FileTree, {}) })] }), _jsxs("main", { className: "flex min-w-0 flex-1 flex-col", children: [_jsx("div", { className: "min-h-0 flex-1", children: _jsx(Editor, {}) }), _jsxs("div", { className: "h-64 shrink-0 border-t border-[hsl(var(--border))]", children: [_jsxs("div", { className: "flex h-8 items-center gap-0 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2", children: [_jsx(BottomTabButton, { active: bottomTab === 'terminal', onClick: () => setBottomTab('terminal'), children: "Terminal" }), _jsx(BottomTabButton, { active: bottomTab === 'services', onClick: () => setBottomTab('services'), children: "Services" })] }), _jsx("div", { className: "h-[calc(100%-2rem)]", children: bottomTab === 'terminal' ? _jsx(TerminalGrid, {}) : _jsx(ServiceDashboard, {}) })] })] }), _jsxs("aside", { className: "flex w-80 shrink-0 flex-col border-l border-[hsl(var(--border))] bg-[hsl(var(--card))]", children: [_jsx("div", { className: "px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]", children: "Agent" }), _jsx("div", { className: "flex min-h-0 flex-1 flex-col", children: _jsx(AgentPanel, {}) })] })] })] }));
}
function BottomTabButton({ active, onClick, children, }) {
    return (_jsx("button", { type: "button", onClick: onClick, className: cn('h-full px-3 text-xs font-medium uppercase tracking-wider transition-colors', active
            ? 'border-b-2 border-[hsl(var(--accent))] text-[hsl(var(--foreground))]'
            : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'), children: children }));
}
