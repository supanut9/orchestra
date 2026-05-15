import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Workspace, FileNode } from '@/lib/ipc';

interface WorkspaceState {
  // ── State ────────────────────────────────────────────────────────────────
  currentWorkspace: Workspace | null;
  recentWorkspaces: Workspace[];
  openFiles: FileNode[];
  activeFilePath: string | null;

  // ── Actions ──────────────────────────────────────────────────────────────
  setCurrentWorkspace: (workspace: Workspace | null) => void;
  addRecentWorkspace: (workspace: Workspace) => void;
  removeRecentWorkspace: (id: string) => void;
  openFile: (file: FileNode) => void;
  closeFile: (path: string) => void;
  setActiveFile: (path: string | null) => void;
  reset: () => void;
}

const MAX_RECENT = 10;

const initialState: Pick<
  WorkspaceState,
  'currentWorkspace' | 'recentWorkspaces' | 'openFiles' | 'activeFilePath'
> = {
  currentWorkspace: null,
  recentWorkspaces: [],
  openFiles: [],
  activeFilePath: null,
};

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      ...initialState,

      setCurrentWorkspace: (workspace) => set({ currentWorkspace: workspace }),

      addRecentWorkspace: (workspace) =>
        set((state) => {
          const filtered = state.recentWorkspaces.filter((w) => w.id !== workspace.id);
          return {
            recentWorkspaces: [workspace, ...filtered].slice(0, MAX_RECENT),
          };
        }),

      removeRecentWorkspace: (id) =>
        set((state) => ({
          recentWorkspaces: state.recentWorkspaces.filter((w) => w.id !== id),
        })),

      openFile: (file) =>
        set((state) => {
          const alreadyOpen = state.openFiles.some((f) => f.path === file.path);
          return {
            openFiles: alreadyOpen ? state.openFiles : [...state.openFiles, file],
            activeFilePath: file.path,
          };
        }),

      closeFile: (path) =>
        set((state) => {
          const remaining = state.openFiles.filter((f) => f.path !== path);
          const activePath =
            state.activeFilePath === path ? (remaining.at(-1)?.path ?? null) : state.activeFilePath;
          return { openFiles: remaining, activeFilePath: activePath };
        }),

      setActiveFile: (path) => set({ activeFilePath: path }),

      reset: () => set(initialState),
    }),
    {
      name: 'orchestra-workspace',
      // Only persist the recent workspaces list; runtime state is ephemeral.
      partialize: (state) => ({
        recentWorkspaces: state.recentWorkspaces,
      }),
    },
  ),
);
