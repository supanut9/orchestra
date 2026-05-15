import { create } from 'zustand';
import { persist } from 'zustand/middleware';
const MAX_RECENT = 10;
const initialState = {
    currentWorkspace: null,
    recentWorkspaces: [],
    openFiles: [],
    activeFilePath: null,
    fileContents: {},
    dirtyFiles: [],
};
export const useWorkspaceStore = create()(persist((set, get) => ({
    ...initialState,
    setCurrentWorkspace: (workspace) => set({ currentWorkspace: workspace }),
    addRecentWorkspace: (workspace) => set((state) => {
        const filtered = state.recentWorkspaces.filter((w) => w.id !== workspace.id);
        return {
            recentWorkspaces: [workspace, ...filtered].slice(0, MAX_RECENT),
        };
    }),
    removeRecentWorkspace: (id) => set((state) => ({
        recentWorkspaces: state.recentWorkspaces.filter((w) => w.id !== id),
    })),
    openFile: (file) => set((state) => {
        const alreadyOpen = state.openFiles.some((f) => f.path === file.path);
        return {
            openFiles: alreadyOpen ? state.openFiles : [...state.openFiles, file],
            activeFilePath: file.path,
        };
    }),
    closeFile: (path) => set((state) => {
        const remaining = state.openFiles.filter((f) => f.path !== path);
        const activePath = state.activeFilePath === path ? (remaining.at(-1)?.path ?? null) : state.activeFilePath;
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
    setFileContents: (path, content) => set((state) => ({
        fileContents: { ...state.fileContents, [path]: content },
    })),
    markDirty: (path, dirty) => set((state) => {
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
}), {
    name: 'orchestra-workspace',
    // Only persist the recent workspaces list; runtime state is ephemeral.
    partialize: (state) => ({
        recentWorkspaces: state.recentWorkspaces,
    }),
}));
