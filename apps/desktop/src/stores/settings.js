import { create } from 'zustand';
import { persist } from 'zustand/middleware';
const initialState = {
    providers: {},
    activeProviderId: null,
    activeModelId: null,
};
export const useSettingsStore = create()(persist((set) => ({
    ...initialState,
    setProviderConfig: (config) => set((state) => ({
        providers: {
            ...state.providers,
            [config.providerId]: config,
        },
    })),
    removeProvider: (id) => set((state) => {
        const providers = { ...state.providers };
        delete providers[id];
        return {
            providers,
            activeProviderId: state.activeProviderId === id ? null : state.activeProviderId,
            activeModelId: state.activeProviderId === id ? null : state.activeModelId,
        };
    }),
    setActiveProvider: (id, modelId) => set((state) => ({
        activeProviderId: id,
        activeModelId: modelId ?? state.providers[id]?.model ?? null,
    })),
    clearActiveProvider: () => set({ activeProviderId: null, activeModelId: null }),
}), {
    name: 'orchestra-settings',
    // API keys are stored in localStorage; for production consider
    // encrypting via tauri-plugin-stronghold. For now this matches
    // the workspace store pattern used across the codebase.
    partialize: (state) => ({
        providers: state.providers,
        activeProviderId: state.activeProviderId,
        activeModelId: state.activeModelId,
    }),
}));
