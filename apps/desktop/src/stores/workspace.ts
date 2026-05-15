import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Workspace, FileNode } from '@/lib/ipc';

interface WorkspaceState {
  // ── State ────────────────────────────────────────────────────────────────
  currentWorkspace: Workspace | null;
  recentWorkspaces: Workspace[];
  openFiles: FileNode[];
  activeFilePath: string | null;

  /** In-memory file content cache (path → text). */
  fileContents: Record<string, string>;
  /** Paths that have been edited but not saved. Use array for serializability. */
  dirtyFiles: string[];

  // ── Actions ──────────────────────────────────────────────────────────────
  setCurrentWorkspace: (workspace: Workspace | null) => void;
  addRecentWorkspace: (workspace: Workspace) => void;
  removeRecentWorkspace: (id: string) => void;
  openFile: (file: FileNode) => void;
  closeFile: (path: string) => void;
  setActiveFile: (path: string | null) => void;

  /** Store/update the content for a given file path. */
  setFileContents: (path: string, content: string) => void;
  /** Mark (or un-mark) a file as having unsaved changes. */
  markDirty: (path: string, dirty: boolean) => void;
  /** Retrieve cached file content (returns undefined if not loaded). */
  getFileContent: (path: string) => string | undefined;

  reset: () => void;
}

const MAX_RECENT = 10;

const initialState: Pick<
  WorkspaceState,
  | 'currentWorkspace'
  | 'recentWorkspaces'
  | 'openFiles'
  | 'activeFilePath'
  | 'fileContents'
  | 'dirtyFiles'
> = {
  currentWorkspace: null,
  recentWorkspaces: [],
  openFiles: [],
  activeFilePath: null,
  fileContents: {},
  dirtyFiles: [],
};

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
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
          // Clean up cached content and dirty state for the closed file.
          const { [path]: _removed, ...restContents } = state.fileContents;
          const dirtyFiles = state.dirtyFiles.filter((p) => p !== path);
          return {
            openFiles: remaining,
            activeFilePath: activePath,
            fileContents: restContents,
            dirtyFiles,
          };
        }),

      setActiveFile: (path) => set({ activeFilePath: path }),

      setFileContents: (path, content) =>
        set((state) => ({
          fileContents: { ...state.fileContents, [path]: content },
        })),

      markDirty: (path, dirty) =>
        set((state) => {
          const already = state.dirtyFiles.includes(path);
          if (dirty && !already) {
            return { dirtyFiles: [...state.dirtyFiles, path] };
          }
          if (!dirty && already) {
            return { dirtyFiles: state.dirtyFiles.filter((p) => p !== path) };
          }
          return {};
        }),

      getFileContent: (path) => get().fileContents[path],

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
