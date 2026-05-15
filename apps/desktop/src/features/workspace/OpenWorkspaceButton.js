import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * OpenWorkspaceButton — lets the user pick a folder via the native OS dialog,
 * registers it as the current workspace, and starts the fs watcher.
 */
import { useState } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { FolderOpen } from 'lucide-react';
import { fsOpenWorkspace, fsStartWatching } from '@/lib/ipc';
import { useWorkspaceStore } from '@/stores/workspace';
import { cn } from '@/lib/utils';
export function OpenWorkspaceButton({ className }) {
    const [loading, setLoading] = useState(false);
    const setCurrentWorkspace = useWorkspaceStore((s) => s.setCurrentWorkspace);
    const addRecentWorkspace = useWorkspaceStore((s) => s.addRecentWorkspace);
    async function handleClick() {
        setLoading(true);
        try {
            // Open the native folder picker.
            const selected = await openDialog({ directory: true, multiple: false });
            if (!selected || typeof selected !== 'string')
                return;
            // Ask Rust to validate the path and return a Workspace object.
            const workspace = await fsOpenWorkspace(selected);
            // Update store.
            setCurrentWorkspace(workspace);
            addRecentWorkspace(workspace);
            // Start the fs watcher for live file-tree updates.
            await fsStartWatching(selected);
        }
        catch (err) {
            console.error('[OpenWorkspaceButton] failed to open workspace:', err);
        }
        finally {
            setLoading(false);
        }
    }
    return (_jsxs("button", { type: "button", onClick: handleClick, disabled: loading, className: cn('flex items-center gap-1.5 rounded px-2 py-1 text-xs', 'bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]', 'hover:opacity-90 active:opacity-75', 'disabled:cursor-not-allowed disabled:opacity-50', 'transition-opacity', className), children: [_jsx(FolderOpen, { className: "h-3.5 w-3.5 shrink-0" }), loading ? 'Opening…' : 'Open Folder'] }));
}
