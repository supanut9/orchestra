import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Provider IDs — must match @orchestra/ai-runtime ProviderId.
 * Re-declared here to avoid importing the Node-only package at build time.
 */
export type ProviderId = 'anthropic' | 'openai' | 'google' | 'ollama' | 'openrouter';

export interface AnthropicConfig {
  providerId: 'anthropic';
  apiKey: string;
  model?: string;
}

export interface OpenAIConfig {
  providerId: 'openai';
  apiKey: string;
  model?: string;
}

export interface GoogleConfig {
  providerId: 'google';
  apiKey: string;
  model?: string;
}

export interface OllamaConfig {
  providerId: 'ollama';
  baseUrl?: string;
  model?: string;
}

export interface OpenRouterConfig {
  providerId: 'openrouter';
  apiKey: string;
  model?: string;
}

export type ProviderConfig =
  | AnthropicConfig
  | OpenAIConfig
  | GoogleConfig
  | OllamaConfig
  | OpenRouterConfig;

interface SettingsState {
  // ── State ─────────────────────────────────────────────────────────────────
  providers: Partial<Record<ProviderId, ProviderConfig>>;
  activeProviderId: ProviderId | null;
  activeModelId: string | null;

  // ── Actions ───────────────────────────────────────────────────────────────
  setProviderConfig: (config: ProviderConfig) => void;
  removeProvider: (id: ProviderId) => void;
  setActiveProvider: (id: ProviderId, modelId?: string) => void;
  clearActiveProvider: () => void;
}

const initialState: Pick<SettingsState, 'providers' | 'activeProviderId' | 'activeModelId'> = {
  providers: {},
  activeProviderId: null,
  activeModelId: null,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...initialState,

      setProviderConfig: (config) =>
        set((state) => ({
          providers: {
            ...state.providers,
            [config.providerId]: config,
          },
        })),

      removeProvider: (id) =>
        set((state) => {
          const providers = { ...state.providers };
          delete providers[id];
          return {
            providers,
            activeProviderId: state.activeProviderId === id ? null : state.activeProviderId,
            activeModelId: state.activeProviderId === id ? null : state.activeModelId,
          };
        }),

      setActiveProvider: (id, modelId) =>
        set((state) => ({
          activeProviderId: id,
          activeModelId: modelId ?? state.providers[id]?.model ?? null,
        })),

      clearActiveProvider: () => set({ activeProviderId: null, activeModelId: null }),
    }),
    {
      name: 'orchestra-settings',
      // API keys are stored in localStorage; for production consider
      // encrypting via tauri-plugin-stronghold. For now this matches
      // the workspace store pattern used across the codebase.
      partialize: (state) => ({
        providers: state.providers,
        activeProviderId: state.activeProviderId,
        activeModelId: state.activeModelId,
      }),
    },
  ),
);
