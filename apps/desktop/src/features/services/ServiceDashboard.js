import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * ServiceDashboard — the service orchestrator UI.
 *
 * Shows all services discovered in the current workspace and lets the user
 * run, stop, or restart each one individually, or start everything at once
 * with "Run All".
 *
 * State management:
 *   - `services`    — list of detected services (from `services_detect`)
 *   - `serviceMap`  — Map<name, ptyId> tracking which service is bound to
 *                     which live PTY; persisted in component state
 *   - `statusMap`   — Map<ptyId, PtyStatus> for status dot colours
 *   - `spawnedIds`  — array passed to `TerminalGrid` so it opens the right tabs
 *
 * The component expects the parent (App.tsx) to provide the workspace path.
 * For now it reads from the Zustand workspace store (set by Lane A).
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { Play, Square, RotateCcw, Zap, RefreshCw } from 'lucide-react';
import { servicesDetect, servicesRunAll, servicesRunOne } from '@/lib/ipc/services';
import { ptyKill, subscribeToPtyStatus } from '@/lib/ipc/pty';
import { useWorkspaceStore } from '@/stores/workspace';
import { TerminalGrid } from '@/features/terminal/TerminalGrid';
// ── Source badge ───────────────────────────────────────────────────────────────
const SOURCE_LABELS = {
    orchestraYaml: 'orchestra',
    dockerCompose: 'compose',
    procfile: 'procfile',
    packageJsonScript: 'pkg.json',
};
const SOURCE_COLOURS = {
    orchestraYaml: 'bg-violet-900/60 text-violet-300',
    dockerCompose: 'bg-blue-900/60 text-blue-300',
    procfile: 'bg-green-900/60 text-green-300',
    packageJsonScript: 'bg-amber-900/60 text-amber-300',
};
function SourceBadge({ source }) {
    return (_jsx("span", { className: `text-[10px] font-mono px-1.5 py-0.5 rounded ${SOURCE_COLOURS[source]}`, children: SOURCE_LABELS[source] }));
}
// ── Status dot ─────────────────────────────────────────────────────────────────
function statusDotClass(status) {
    switch (status) {
        case 'running':
            return 'bg-green-500';
        case 'idle':
            return 'bg-yellow-400';
        case 'crashed':
            return 'bg-red-500';
        case 'exited':
            return 'bg-neutral-500';
        default:
            return 'bg-neutral-700'; // not started
    }
}
function ServiceRow({ service, ptyId, ptyStatus, onRun, onStop, onRestart, isLoading, }) {
    const isRunning = ptyId !== undefined && ptyStatus === 'running';
    const isStopped = ptyId === undefined || ptyStatus === 'exited' || ptyStatus === 'crashed';
    return (_jsxs("div", { className: "flex items-center gap-3 px-4 py-2.5 border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]/30", children: [_jsx("span", { className: `inline-block w-2 h-2 rounded-full shrink-0 ${statusDotClass(isRunning ? ptyStatus : undefined)}`, title: ptyStatus ?? 'stopped' }), _jsx("span", { className: "text-sm font-mono font-medium flex-1 min-w-0 truncate", children: service.name }), _jsx(SourceBadge, { source: service.source }), _jsx("span", { className: "hidden sm:block text-xs text-[hsl(var(--muted-foreground))] font-mono truncate max-w-[200px]", title: service.command.join(' '), children: service.command.join(' ') }), _jsxs("div", { className: "flex items-center gap-1 shrink-0", children: [isStopped && (_jsxs("button", { onClick: onRun, disabled: isLoading, className: "flex items-center gap-1 text-xs px-2 py-1 rounded bg-green-900/50 text-green-300 hover:bg-green-900/80 disabled:opacity-50 disabled:cursor-not-allowed", title: "Run", children: [_jsx(Play, { size: 11 }), "Run"] })), isRunning && (_jsxs(_Fragment, { children: [_jsxs("button", { onClick: onRestart, disabled: isLoading, className: "flex items-center gap-1 text-xs px-2 py-1 rounded bg-yellow-900/50 text-yellow-300 hover:bg-yellow-900/80 disabled:opacity-50", title: "Restart", children: [_jsx(RotateCcw, { size: 11 }), "Restart"] }), _jsxs("button", { onClick: onStop, disabled: isLoading, className: "flex items-center gap-1 text-xs px-2 py-1 rounded bg-red-900/50 text-red-300 hover:bg-red-900/80 disabled:opacity-50", title: "Stop", children: [_jsx(Square, { size: 11 }), "Stop"] })] }))] })] }));
}
// ── ServiceDashboard ────────────────────────────────────────────────────────────
export function ServiceDashboard() {
    const workspace = useWorkspaceStore((s) => s.currentWorkspace);
    const [services, setServices] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    // name → ptyId for services that are running
    const [serviceMap, setServiceMap] = useState(new Map());
    // ptyId → current status
    const [statusMap, setStatusMap] = useState(new Map());
    // IDs of most recently spawned PTYs — passed to TerminalGrid so it refreshes
    const [spawnedIds, setSpawnedIds] = useState([]);
    // Per-row loading state
    const [rowLoading, setRowLoading] = useState(new Set());
    const unlistenRef = useRef(null);
    // ── Detect services ────────────────────────────────────────────────────────
    const detectServices = useCallback(async (path) => {
        setLoading(true);
        setError(null);
        try {
            const detected = await servicesDetect(path);
            setServices(detected);
        }
        catch (err) {
            setError(String(err));
        }
        finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        if (!workspace?.path)
            return;
        void detectServices(workspace.path);
    }, [workspace?.path, detectServices]);
    // ── Subscribe to PTY status ────────────────────────────────────────────────
    useEffect(() => {
        let mounted = true;
        subscribeToPtyStatus((payload) => {
            if (!mounted)
                return;
            setStatusMap((prev) => {
                const next = new Map(prev);
                next.set(payload.ptyId, payload.status);
                return next;
            });
            // If this PTY exited/crashed, remove it from the service map.
            if (payload.status === 'exited' || payload.status === 'crashed') {
                setServiceMap((prev) => {
                    const next = new Map(prev);
                    for (const [name, id] of next.entries()) {
                        if (id === payload.ptyId) {
                            next.delete(name);
                            break;
                        }
                    }
                    return next;
                });
            }
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
    }, []);
    // ── Run all services ────────────────────────────────────────────────────────
    const handleRunAll = useCallback(async () => {
        if (!workspace?.path)
            return;
        setLoading(true);
        setError(null);
        try {
            const ids = await servicesRunAll(workspace.path);
            // Map service names to their PTY IDs in the same order.
            const newMap = new Map(serviceMap);
            services.forEach((svc, i) => {
                const id = ids[i];
                if (id) {
                    newMap.set(svc.name, id);
                    setStatusMap((prev) => new Map(prev).set(id, 'running'));
                }
            });
            setServiceMap(newMap);
            setSpawnedIds(ids);
        }
        catch (err) {
            setError(String(err));
        }
        finally {
            setLoading(false);
        }
    }, [workspace?.path, services, serviceMap]);
    // ── Run one service ─────────────────────────────────────────────────────────
    const handleRunOne = useCallback(async (name) => {
        if (!workspace?.path)
            return;
        setRowLoading((prev) => new Set(prev).add(name));
        try {
            const ptyId = await servicesRunOne(workspace.path, name);
            setServiceMap((prev) => new Map(prev).set(name, ptyId));
            setStatusMap((prev) => new Map(prev).set(ptyId, 'running'));
            setSpawnedIds([ptyId]);
        }
        catch (err) {
            setError(String(err));
        }
        finally {
            setRowLoading((prev) => {
                const next = new Set(prev);
                next.delete(name);
                return next;
            });
        }
    }, [workspace?.path]);
    // ── Stop one service ────────────────────────────────────────────────────────
    const handleStop = useCallback(async (name) => {
        const ptyId = serviceMap.get(name);
        if (!ptyId)
            return;
        setRowLoading((prev) => new Set(prev).add(name));
        try {
            await ptyKill(ptyId);
            setServiceMap((prev) => {
                const next = new Map(prev);
                next.delete(name);
                return next;
            });
            setStatusMap((prev) => {
                const next = new Map(prev);
                next.set(ptyId, 'exited');
                return next;
            });
        }
        catch (err) {
            setError(String(err));
        }
        finally {
            setRowLoading((prev) => {
                const next = new Set(prev);
                next.delete(name);
                return next;
            });
        }
    }, [serviceMap]);
    // ── Restart one service ─────────────────────────────────────────────────────
    const handleRestart = useCallback(async (name) => {
        // Stop first (if running), then start.
        await handleStop(name);
        await handleRunOne(name);
    }, [handleStop, handleRunOne]);
    // ── Render ─────────────────────────────────────────────────────────────────
    if (!workspace) {
        return (_jsx("div", { className: "flex h-full items-center justify-center text-sm text-[hsl(var(--muted-foreground))]", children: "Open a workspace to detect services" }));
    }
    return (_jsxs("div", { className: "flex flex-col h-full overflow-hidden", children: [_jsxs("div", { className: "flex items-center gap-2 px-4 h-10 shrink-0 bg-[hsl(var(--card))] border-b border-[hsl(var(--border))]", children: [_jsx("span", { className: "text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]", children: "Services" }), _jsx("span", { className: "text-[hsl(var(--muted-foreground))] text-xs", children: services.length > 0 ? `${services.length} detected` : '' }), _jsxs("div", { className: "ml-auto flex items-center gap-2", children: [_jsx("button", { onClick: () => void detectServices(workspace.path), disabled: loading, className: "flex items-center gap-1 text-xs px-2 py-1 rounded hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] disabled:opacity-50", title: "Re-scan workspace for services", children: _jsx(RefreshCw, { size: 12, className: loading ? 'animate-spin' : '' }) }), services.length > 0 && (_jsxs("button", { onClick: handleRunAll, disabled: loading, className: "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-green-700 hover:bg-green-600 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed", children: [_jsx(Zap, { size: 12 }), "Run All"] }))] })] }), error && (_jsxs("div", { className: "px-4 py-2 text-xs bg-red-950 text-red-300 border-b border-red-800", children: [error, _jsx("button", { onClick: () => setError(null), className: "ml-2 underline", children: "dismiss" })] })), _jsx("div", { className: "flex-1 overflow-y-auto min-h-0", children: loading && services.length === 0 ? (_jsx("div", { className: "flex h-full items-center justify-center text-sm text-[hsl(var(--muted-foreground))]", children: "Scanning workspace\u2026" })) : services.length === 0 ? (_jsxs("div", { className: "flex flex-col gap-2 h-full items-center justify-center text-sm text-[hsl(var(--muted-foreground))]", children: [_jsx("p", { children: "No services detected." }), _jsxs("p", { className: "text-xs opacity-70", children: ["Add a ", _jsx("code", { children: "Procfile" }), ", ", _jsx("code", { children: "docker-compose.yml" }), ",", ' ', _jsx("code", { children: "package.json" }), " scripts, or ", _jsx("code", { children: "orchestra.yaml" }), "."] })] })) : (_jsx("div", { children: services.map((svc) => {
                        const ptyId = serviceMap.get(svc.name);
                        return (_jsx(ServiceRow, { service: svc, ptyId: ptyId, ptyStatus: ptyId ? statusMap.get(ptyId) : undefined, onRun: () => void handleRunOne(svc.name), onStop: () => void handleStop(svc.name), onRestart: () => void handleRestart(svc.name), isLoading: rowLoading.has(svc.name) }, svc.name));
                    }) })) }), spawnedIds.length > 0 && (_jsx("div", { className: "h-64 shrink-0 border-t border-[hsl(var(--border))]", children: _jsx(TerminalGrid, { ptyIds: spawnedIds }) }))] }));
}
