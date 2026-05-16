/**
 * Workspace store — manages multi-folder workspaces.
 *
 * A workspace is a named collection of project folders from arbitrary
 * filesystem locations. The user can have many workspaces, switch between
 * them, and add/remove folders within each.
 *
 * The "active" workspace's folders are what the Explorer renders.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { nanoid } from 'nanoid';
import type { Workspace, WorkspaceFolder, FolderInfo, FileNode } from '@/lib/ipc';

interface WorkspaceState {
  // ── State ────────────────────────────────────────────────────────────────

  /** All known workspaces. */
  workspaces: Workspace[];
  /** Currently active workspace ID. `null` only when no workspaces exist. */
  activeWorkspaceId: string | null;

  /** Open editor tabs (across all workspaces). */
  openFiles: FileNode[];
  activeFilePath: string | null;

  /** In-memory file content cache (path → text). */
  fileContents: Record<string, string>;
  /** Paths that have been edited but not saved. */
  dirtyFiles: string[];

  // ── Derived ──────────────────────────────────────────────────────────────

  /** The currently active workspace, or null. */
  currentWorkspace: Workspace | null;

  // ── Workspace management ─────────────────────────────────────────────────

  /** Create a new (empty) workspace and switch to it. */
  createWorkspace: (name: string) => Workspace;
  /** Delete a workspace. If it's the active one, switch to another (or null). */
  deleteWorkspace: (id: string) => void;
  /** Switch the active workspace. */
  switchWorkspace: (id: string) => void;
  /** Rename a workspace. */
  renameWorkspace: (id: string, name: string) => void;

  // ── Folder management within the active workspace ────────────────────────

  /** Add a folder to the active workspace. Creates a default workspace if none exists. */
  addFolder: (folder: FolderInfo, workspaceId?: string) => void;
  /** Remove a folder from a workspace by path. */
  removeFolder: (workspaceId: string, folderPath: string) => void;
  /** Rename a folder's display name. */
  renameFolder: (workspaceId: string, folderPath: string, name: string) => void;

  // ── Editor / files ───────────────────────────────────────────────────────

  openFile: (file: FileNode) => void;
  closeFile: (path: string) => void;
  setActiveFile: (path: string | null) => void;
  setFileContents: (path: string, content: string) => void;
  markDirty: (path: string, dirty: boolean) => void;
  getFileContent: (path: string) => string | undefined;

  reset: () => void;
}

const initialState: Pick<
  WorkspaceState,
  | 'workspaces'
  | 'activeWorkspaceId'
  | 'openFiles'
  | 'activeFilePath'
  | 'fileContents'
  | 'dirtyFiles'
> = {
  workspaces: [],
  activeWorkspaceId: null,
  openFiles: [],
  activeFilePath: null,
  fileContents: {},
  dirtyFiles: [],
};

function findWorkspace(workspaces: Workspace[], id: string | null): Workspace | null {
  if (!id) return null;
  return workspaces.find((w) => w.id === id) ?? null;
}

function makeWorkspace(name: string): Workspace {
  return {
    id: nanoid(),
    name,
    folders: [],
    createdAt: new Date().toISOString(),
  };
}

function makeFolder(info: FolderInfo): WorkspaceFolder {
  return {
    path: info.path,
    name: info.name,
    addedAt: new Date().toISOString(),
  };
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      ...initialState,

      get currentWorkspace() {
        return findWorkspace(get().workspaces, get().activeWorkspaceId);
      },

      // ── Workspace management ─────────────────────────────────────────────

      createWorkspace: (name) => {
        const ws = makeWorkspace(name.trim() || 'New Workspace');
        set((state) => ({
          workspaces: [...state.workspaces, ws],
          activeWorkspaceId: ws.id,
        }));
        return ws;
      },

      deleteWorkspace: (id) =>
        set((state) => {
          const remaining = state.workspaces.filter((w) => w.id !== id);
          const activeWorkspaceId =
            state.activeWorkspaceId === id ? (remaining[0]?.id ?? null) : state.activeWorkspaceId;
          return { workspaces: remaining, activeWorkspaceId };
        }),

      switchWorkspace: (id) =>
        set((state) => {
          if (!state.workspaces.some((w) => w.id === id)) return {};
          return { activeWorkspaceId: id };
        }),

      renameWorkspace: (id, name) =>
        set((state) => ({
          workspaces: state.workspaces.map((w) =>
            w.id === id ? { ...w, name: name.trim() || w.name } : w,
          ),
        })),

      // ── Folder management ────────────────────────────────────────────────

      addFolder: (folder, workspaceId) =>
        set((state) => {
          let workspaces = state.workspaces;
          let targetId = workspaceId ?? state.activeWorkspaceId;

          // If no workspace exists, create a default one named after the folder.
          if (!targetId) {
            const fresh = makeWorkspace(`${folder.name} workspace`);
            workspaces = [...workspaces, fresh];
            targetId = fresh.id;
          }

          const wsFolder = makeFolder(folder);
          workspaces = workspaces.map((w) => {
            if (w.id !== targetId) return w;
            // Skip duplicates by path.
            if (w.folders.some((f) => f.path === wsFolder.path)) return w;
            return { ...w, folders: [...w.folders, wsFolder] };
          });
          return { workspaces, activeWorkspaceId: targetId };
        }),

      removeFolder: (workspaceId, folderPath) =>
        set((state) => ({
          workspaces: state.workspaces.map((w) =>
            w.id === workspaceId
              ? { ...w, folders: w.folders.filter((f) => f.path !== folderPath) }
              : w,
          ),
        })),

      renameFolder: (workspaceId, folderPath, name) =>
        set((state) => ({
          workspaces: state.workspaces.map((w) =>
            w.id === workspaceId
              ? {
                  ...w,
                  folders: w.folders.map((f) =>
                    f.path === folderPath ? { ...f, name: name.trim() || f.name } : f,
                  ),
                }
              : w,
          ),
        })),

      // ── Editor / files ───────────────────────────────────────────────────

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
          if (dirty && !already) return { dirtyFiles: [...state.dirtyFiles, path] };
          if (!dirty && already) return { dirtyFiles: state.dirtyFiles.filter((p) => p !== path) };
          return {};
        }),

      getFileContent: (path) => get().fileContents[path],

      reset: () => set({ ...initialState }),
    }),
    {
      name: 'orchestra-workspace',
      version: 2,
      // Persist workspaces + active id only. Editor / file state is ephemeral.
      partialize: (state) => ({
        workspaces: state.workspaces,
        activeWorkspaceId: state.activeWorkspaceId,
      }),
      // Migrate the old `recentWorkspaces: Workspace[]` shape (where Workspace
      // had a single `path` field) into the new multi-folder shape.
      migrate: (persisted: unknown, version) => {
        if (version >= 2 || !persisted || typeof persisted !== 'object') {
          return persisted as object;
        }
        // v1 → v2: map each legacy `{id, name, path}` to a workspace with one folder.
        const legacy = persisted as {
          recentWorkspaces?: Array<{ id: string; name: string; path: string; openedAt?: string }>;
          currentWorkspace?: { id: string; name: string; path: string; openedAt?: string } | null;
        };
        const sources = [...(legacy.recentWorkspaces ?? [])];
        if (legacy.currentWorkspace && !sources.some((s) => s.id === legacy.currentWorkspace?.id)) {
          sources.unshift(legacy.currentWorkspace);
        }
        const workspaces: Workspace[] = sources.map((s) => ({
          id: s.id,
          name: s.name,
          folders: [
            { path: s.path, name: s.name, addedAt: s.openedAt ?? new Date().toISOString() },
          ],
          createdAt: s.openedAt ?? new Date().toISOString(),
        }));
        return {
          workspaces,
          activeWorkspaceId: legacy.currentWorkspace?.id ?? workspaces[0]?.id ?? null,
        };
      },
    },
  ),
);

// ── Selectors ──────────────────────────────────────────────────────────────

/** Hook helper to read the currently-active workspace as a value (not getter). */
export function useCurrentWorkspace(): Workspace | null {
  return useWorkspaceStore((s) => {
    if (!s.activeWorkspaceId) return null;
    return s.workspaces.find((w) => w.id === s.activeWorkspaceId) ?? null;
  });
}

/** Hook helper for the primary folder path of the active workspace. */
export function usePrimaryFolderPath(): string | null {
  return useWorkspaceStore((s) => {
    const ws = s.activeWorkspaceId ? s.workspaces.find((w) => w.id === s.activeWorkspaceId) : null;
    return ws?.folders[0]?.path ?? null;
  });
}
