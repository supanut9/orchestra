import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createTauriJSONStorage } from '@/lib/storage';

/**
 * Provider IDs.
 *
 * "API" providers (anthropic / openai / google / ollama / openrouter) use the
 * Vercel AI SDK with an API key.
 *
 * "CLI" providers (claude-cli / codex-cli / gemini-cli) spawn the matching
 * local CLI binary via the Tauri PTY backend and stream its stdout. Uses the
 * CLI's own auth (e.g. Claude Code's OAuth-backed Max subscription), so no
 * API key is needed.
 */
export type ProviderId =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'ollama'
  | 'openrouter'
  | 'claude-cli'
  | 'codex-cli'
  | 'gemini-cli';

export type CliProviderId = 'claude-cli' | 'codex-cli' | 'gemini-cli';

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

/**
 * Common shape for CLI providers — no API key needed, just the binary path.
 * `args` is a templated argv (use `{PROMPT}` as the user-message placeholder)
 * that defaults to a sensible per-provider invocation.
 */
export interface CliProviderConfig {
  providerId: CliProviderId;
  /** Absolute path to the CLI binary (or just the name if it's on PATH). */
  binaryPath: string;
  /**
   * argv template. `{PROMPT}` is replaced with the user message at call time.
   * Default is set per-provider in DEFAULT_CLI_ARGS below.
   */
  args?: string[];
  /** Optional model override passed to the CLI (only some CLIs support this). */
  model?: string;
}

/** Sensible argv defaults for each supported CLI. */
export const DEFAULT_CLI_ARGS: Record<CliProviderId, string[]> = {
  'claude-cli': ['-p', '{PROMPT}'],
  'codex-cli': ['exec', '{PROMPT}'],
  'gemini-cli': ['-p', '{PROMPT}'],
};

/** Common install paths to probe when the user hasn't set a binary path. */
export const DEFAULT_CLI_PATHS: Record<CliProviderId, string[]> = {
  'claude-cli': ['/opt/homebrew/bin/claude', '/usr/local/bin/claude', 'claude'],
  'codex-cli': ['/opt/homebrew/bin/codex', '/usr/local/bin/codex', 'codex'],
  'gemini-cli': ['/opt/homebrew/bin/gemini', '/usr/local/bin/gemini', 'gemini'],
};

export type ProviderConfig =
  | AnthropicConfig
  | OpenAIConfig
  | GoogleConfig
  | OllamaConfig
  | OpenRouterConfig
  | CliProviderConfig;

/** Type guard: is this provider a CLI-backed one (no API key)? */
export function isCliProvider(config: ProviderConfig): config is CliProviderConfig {
  return (
    config.providerId === 'claude-cli' ||
    config.providerId === 'codex-cli' ||
    config.providerId === 'gemini-cli'
  );
}

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
      // Persist to a Tauri-backed JSON file so settings survive WKWebView
      // localStorage wipes. For production consider encrypting API keys
      // via tauri-plugin-stronghold.
      storage: createTauriJSONStorage('orchestra-settings.json'),
      partialize: (state) => ({
        providers: state.providers,
        activeProviderId: state.activeProviderId,
        activeModelId: state.activeModelId,
      }),
    },
  ),
);
