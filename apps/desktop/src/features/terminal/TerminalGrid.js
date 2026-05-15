import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * TerminalGrid — multi-tab terminal panel for the bottom pane of the IDE.
 *
 * Tab bar features:
 *   - One tab per live PTY (label + owner badge + status dot + close button)
 *   - Active tab selection
 *   - PTY status dot: green = running, yellow = starting, red = crashed,
 *     grey = exited
 *   - Owner badge: "user" (no badge) | "agent: <sessionId>" (purple pill)
 *   - Empty state when no PTYs are active
 *
 * Event wiring:
 *   - Polls `pty_list` on mount to hydrate initial tab state
 *   - Subscribes to `pty.status` to mark tabs exited/crashed in real time
 *   - Supports external injection of new ptyIds via the `ptyIds` prop (used
 *     by ServiceDashboard after `services_run_all`)
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { X, Bot, User } from 'lucide-react';
import { ptyList, ptyKill, subscribeToPtyStatus } from '@/lib/ipc/pty';
import { Terminal } from './Terminal';
// ── Status helpers ─────────────────────────────────────────────────────────────
function statusDotClass(status) {
    switch (status) {
        case 'running':
            return 'bg-green-500';
        case 'idle':
            return 'bg-yellow-400';
        case 'crashed':
            return 'bg-red-500';
        case 'exited':
        default:
            return 'bg-neutral-500';
    }
}
function Tab({ info, isActive, onSelect, onClose }) {
    const isAgent = info.owner.kind === 'agent';
    return (_jsxs("button", { onClick: onSelect, className: [
            'flex items-center gap-1.5 px-3 h-full text-xs font-mono border-r border-[hsl(var(--border))] shrink-0',
            'max-w-[160px] truncate',
            isActive
                ? 'bg-[hsl(var(--background))] text-[hsl(var(--foreground))]'
                : 'bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--background))]/60',
        ].join(' '), title: `${info.label} — ${info.cwd}`, children: [_jsx("span", { className: `inline-block w-1.5 h-1.5 rounded-full shrink-0 ${statusDotClass(info.status)}` }), _jsx("span", { className: "truncate", children: info.label }), isAgent && (_jsxs("span", { className: "flex items-center gap-0.5 px-1 py-0 rounded text-[10px] bg-purple-900/60 text-purple-300 shrink-0", title: `Owned by agent: ${info.owner.sessionId}`, children: [_jsx(Bot, { size: 10 }), "AI"] })), !isAgent && info.status === 'running' && (_jsx("span", { className: "text-[hsl(var(--muted-foreground))] shrink-0", children: _jsx(User, { size: 10 }) })), _jsx("button", { onClick: (e) => {
                    e.stopPropagation();
                    onClose();
                }, className: "ml-1 rounded hover:bg-[hsl(var(--muted))] p-0.5 shrink-0 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]", title: "Close terminal", "aria-label": `Close ${info.label}`, children: _jsx(X, { size: 10 }) })] }));
}
// ── Main component ─────────────────────────────────────────────────────────────
export function TerminalGrid({ ptyIds: externalPtyIds } = {}) {
    const [ptys, setPtys] = useState([]);
    const [activeId, setActiveId] = useState(null);
    const unlistenRef = useRef(null);
    // ── Load initial PTY list ──────────────────────────────────────────────────
    const refreshList = useCallback(async () => {
        try {
            const list = await ptyList();
            setPtys(list);
            setActiveId((prev) => {
                if (prev && list.some((p) => p.id === prev))
                    return prev;
                return list[0]?.id ?? null;
            });
        }
        catch (err) {
            console.error('[TerminalGrid] pty_list error:', err);
        }
    }, []);
    useEffect(() => {
        void refreshList();
    }, [refreshList]);
    // ── Handle externally-injected PTY IDs (from ServiceDashboard) ────────────
    useEffect(() => {
        if (!externalPtyIds || externalPtyIds.length === 0)
            return;
        // After services_run_all, the manager has new PTYs. Refresh the list and
        // activate the first newly-spawned PTY.
        void refreshList().then(() => {
            setActiveId(externalPtyIds[0] ?? null);
        });
    }, [externalPtyIds, refreshList]);
    // ── Subscribe to status events ────────────────────────────────────────────
    useEffect(() => {
        let mounted = true;
        subscribeToPtyStatus((payload) => {
            if (!mounted)
                return;
            // Update status in the list and, if this PTY exited while active,
            // switch focus to the nearest remaining tab.
            setPtys((currentPtys) => {
                const updated = currentPtys.map((p) => p.id === payload.ptyId ? { ...p, status: payload.status } : p);
                if (payload.status === 'exited' || payload.status === 'crashed') {
                    setActiveId((prev) => {
                        if (prev !== payload.ptyId)
                            return prev;
                        const remaining = updated.filter((p) => p.id !== payload.ptyId);
                        return remaining[0]?.id ?? null;
                    });
                }
                return updated;
            });
        }).then((unlisten) => {
            if (mounted)
                unlistenRef.current = unlisten;
            else
                unlisten();
        });
        return () => {
            mounted = false;
            unlistenRef.current?.();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    // ── Close (kill) a terminal ────────────────────────────────────────────────
    const handleClose = useCallback(async (ptyId) => {
        try {
            await ptyKill(ptyId);
        }
        catch (err) {
            console.error('[TerminalGrid] pty_kill error:', err);
        }
        // Optimistic removal — the status event will also fire, but we remove
        // immediately so the UI feels snappy.  Use functional updates to avoid
        // stale closure over `ptys`.
        setPtys((current) => {
            const next = current.filter((p) => p.id !== ptyId);
            setActiveId((prev) => {
                if (prev !== ptyId)
                    return prev;
                return next[0]?.id ?? null;
            });
            return next;
        });
    }, []);
    // ── Render ─────────────────────────────────────────────────────────────────
    if (ptys.length === 0) {
        return (_jsx("div", { className: "flex h-full items-center justify-center text-sm text-[hsl(var(--muted-foreground))] bg-[#0d0d0d] font-mono select-none", children: "Run a service or spawn a terminal to begin" }));
    }
    return (_jsxs("div", { className: "flex flex-col h-full bg-[#0d0d0d]", children: [_jsx("div", { className: "flex items-center h-8 shrink-0 bg-[hsl(var(--card))] border-b border-[hsl(var(--border))] overflow-x-auto scrollbar-none", children: ptys.map((info) => (_jsx(Tab, { info: info, isActive: info.id === activeId, onSelect: () => setActiveId(info.id), onClose: () => void handleClose(info.id) }, info.id))) }), _jsx("div", { className: "flex-1 min-h-0 relative", children: ptys.map((info) => (_jsx("div", { className: "absolute inset-0", style: { display: info.id === activeId ? 'block' : 'none' }, children: _jsx(Terminal, { ptyId: info.id, label: info.label, isActive: info.id === activeId, onClose: () => void handleClose(info.id) }) }, info.id))) })] }));
}
