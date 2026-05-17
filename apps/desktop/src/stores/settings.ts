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

/**
 * A named credential profile for a CLI provider. Each account corresponds to
 * its own directory under ~/.orchestra/cli-accounts/<id>/, which Orchestra
 * passes to the CLI via a per-provider env var on spawn (CLAUDE_CONFIG_DIR,
 * CODEX_HOME, GEMINI_HOME). Switching between accounts is just swapping
 * which env var path Orchestra injects — zero filesystem mutation.
 */
export interface CliAccount {
  id: string;
  providerId: CliProviderId;
  label: string;
  /** Absolute path returned by `cli_account_create_dir`. */
  credentialDir: string;
  createdAt: string;
}

/** Env var each CLI consults for its credential / config directory. */
export const CLI_CONFIG_ENV_VAR: Record<CliProviderId, string> = {
  'claude-cli': 'CLAUDE_CONFIG_DIR',
  'codex-cli': 'CODEX_HOME',
  'gemini-cli': 'GEMINI_HOME',
};

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

  /** Multi-account profiles for CLI providers. */
  cliAccounts: CliAccount[];
  /** Active account ID per CLI provider. */
  activeCliAccountId: Partial<Record<CliProviderId, string>>;

  // ── Actions ───────────────────────────────────────────────────────────────
  setProviderConfig: (config: ProviderConfig) => void;
  removeProvider: (id: ProviderId) => void;
  setActiveProvider: (id: ProviderId, modelId?: string) => void;
  clearActiveProvider: () => void;

  /** Add a new CLI account profile. Caller is responsible for ensuring the
   *  credential dir was created via `cliAccountCreateDir`. */
  addCliAccount: (account: CliAccount) => void;
  /** Remove a CLI account profile (the directory is removed separately). */
  removeCliAccount: (id: string) => void;
  /** Switch the active account for a CLI provider. */
  setActiveCliAccount: (providerId: CliProviderId, accountId: string | null) => void;
  /** Rename a CLI account. */
  renameCliAccount: (id: string, label: string) => void;
}

const initialState: Pick<
  SettingsState,
  'providers' | 'activeProviderId' | 'activeModelId' | 'cliAccounts' | 'activeCliAccountId'
> = {
  providers: {},
  activeProviderId: null,
  activeModelId: null,
  cliAccounts: [],
  activeCliAccountId: {},
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

      addCliAccount: (account) =>
        set((state) => {
          // If this is the first account for that provider, mark it active.
          const isFirst = !state.cliAccounts.some((a) => a.providerId === account.providerId);
          return {
            cliAccounts: [...state.cliAccounts, account],
            activeCliAccountId: isFirst
              ? { ...state.activeCliAccountId, [account.providerId]: account.id }
              : state.activeCliAccountId,
          };
        }),

      removeCliAccount: (id) =>
        set((state) => {
          const removed = state.cliAccounts.find((a) => a.id === id);
          if (!removed) return {};
          const remaining = state.cliAccounts.filter((a) => a.id !== id);
          const nextActive = { ...state.activeCliAccountId };
          if (nextActive[removed.providerId] === id) {
            const replacement = remaining.find((a) => a.providerId === removed.providerId);
            if (replacement) {
              nextActive[removed.providerId] = replacement.id;
            } else {
              delete nextActive[removed.providerId];
            }
          }
          return { cliAccounts: remaining, activeCliAccountId: nextActive };
        }),

      setActiveCliAccount: (providerId, accountId) =>
        set((state) => {
          const next = { ...state.activeCliAccountId };
          if (accountId === null) {
            delete next[providerId];
          } else {
            next[providerId] = accountId;
          }
          return { activeCliAccountId: next };
        }),

      renameCliAccount: (id, label) =>
        set((state) => ({
          cliAccounts: state.cliAccounts.map((a) =>
            a.id === id ? { ...a, label: label.trim() || a.label } : a,
          ),
        })),
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
        cliAccounts: state.cliAccounts,
        activeCliAccountId: state.activeCliAccountId,
      }),
    },
  ),
);
