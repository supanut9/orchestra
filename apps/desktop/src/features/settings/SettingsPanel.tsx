import { useState, useEffect } from 'react';
import { useSettingsStore, DEFAULT_CLI_PATHS } from '@/stores/settings';
import type {
  ProviderId,
  ProviderConfig,
  CliProviderId,
  CliProviderConfig,
} from '@/stores/settings';
import { testProviderConnection } from '@/lib/ai/provider-registry';
import { detectBinary } from '@/lib/ipc/system';

/** Strip the `-cli` suffix → "claude-cli" → "claude". */
function cliBinaryName(id: CliProviderId): string {
  return id.replace(/-cli$/, '');
}

// ── Provider metadata ──────────────────────────────────────────────────────

interface ProviderMeta {
  id: ProviderId;
  label: string;
  needsApiKey: boolean;
  needsBaseUrl: boolean;
  /** CLI providers are auth-by-subprocess; no API key, no base URL. */
  isCli?: boolean;
  defaultBaseUrl?: string;
  models: string[];
}

const CLI_IDS: CliProviderId[] = ['claude-cli', 'codex-cli', 'gemini-cli'];

function isCliId(id: ProviderId): id is CliProviderId {
  return (CLI_IDS as ProviderId[]).includes(id);
}

const PROVIDERS: ProviderMeta[] = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    needsApiKey: true,
    needsBaseUrl: false,
    models: [
      'claude-sonnet-4-7',
      'claude-sonnet-4-5',
      'claude-opus-4-5',
      'claude-haiku-4-5',
      'claude-3-5-haiku-20241022',
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    needsApiKey: true,
    needsBaseUrl: false,
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o1', 'o1-mini', 'o3-mini'],
  },
  {
    id: 'google',
    label: 'Google Gemini',
    needsApiKey: true,
    needsBaseUrl: false,
    models: [
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
    ],
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    needsApiKey: false,
    needsBaseUrl: true,
    defaultBaseUrl: 'http://localhost:11434/v1',
    models: ['llama3.2', 'llama3.1', 'llama3', 'mistral', 'codellama', 'qwen2.5-coder'],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    needsApiKey: true,
    needsBaseUrl: false,
    models: [
      'anthropic/claude-sonnet-4-7',
      'openai/gpt-4o',
      'google/gemini-2.5-pro',
      'meta-llama/llama-3.3-70b-instruct',
      'mistralai/mistral-large',
    ],
  },
  // ── CLI providers — use local CLI binaries with their own auth ──────────
  {
    id: 'claude-cli',
    label: 'Claude Code CLI (uses Max sub)',
    needsApiKey: false,
    needsBaseUrl: false,
    isCli: true,
    models: [],
  },
  {
    id: 'codex-cli',
    label: 'OpenAI Codex CLI',
    needsApiKey: false,
    needsBaseUrl: false,
    isCli: true,
    models: [],
  },
  {
    id: 'gemini-cli',
    label: 'Gemini CLI',
    needsApiKey: false,
    needsBaseUrl: false,
    isCli: true,
    models: [],
  },
];

// ── Provider row form ──────────────────────────────────────────────────────

interface ProviderRowProps {
  meta: ProviderMeta;
}

function ProviderRow({ meta }: ProviderRowProps) {
  const { providers, activeProviderId, setProviderConfig, removeProvider, setActiveProvider } =
    useSettingsStore();

  const saved = providers[meta.id];

  const cliDefault =
    meta.isCli && isCliId(meta.id) ? (DEFAULT_CLI_PATHS[meta.id][0] ?? meta.id.replace('-cli', '')) : '';

  const [detecting, setDetecting] = useState(false);
  const [detectStatus, setDetectStatus] = useState<'idle' | 'found' | 'not-found'>('idle');
  const [apiKey, setApiKey] = useState<string>((saved as any)?.apiKey ?? '');
  const [baseUrl, setBaseUrl] = useState<string>(
    (saved as any)?.baseUrl ?? meta.defaultBaseUrl ?? '',
  );
  const [binaryPath, setBinaryPath] = useState<string>(
    (saved as any)?.binaryPath ?? cliDefault,
  );
  const [model, setModel] = useState<string>(saved?.model ?? meta.models[0] ?? '');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [testError, setTestError] = useState<string>('');
  const [dirty, setDirty] = useState(false);

  const isActive = activeProviderId === meta.id;

  // Auto-detect CLI binary on first mount if no path is saved.
  useEffect(() => {
    if (!meta.isCli || !isCliId(meta.id) || saved) return;
    setDetecting(true);
    detectBinary(cliBinaryName(meta.id))
      .then((found) => {
        if (found) {
          setBinaryPath(found);
          setDetectStatus('found');
        } else {
          setDetectStatus('not-found');
        }
      })
      .catch(() => setDetectStatus('not-found'))
      .finally(() => setDetecting(false));
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDetect() {
    if (!isCliId(meta.id)) return;
    setDetecting(true);
    setDetectStatus('idle');
    try {
      const found = await detectBinary(cliBinaryName(meta.id));
      if (found) {
        setBinaryPath(found);
        setDetectStatus('found');
        setDirty(true);
      } else {
        setDetectStatus('not-found');
      }
    } catch {
      setDetectStatus('not-found');
    } finally {
      setDetecting(false);
    }
  }

  function buildConfig(): ProviderConfig {
    if (meta.isCli && isCliId(meta.id)) {
      const cfg: CliProviderConfig = { providerId: meta.id, binaryPath };
      if (model) cfg.model = model;
      return cfg;
    }
    if (meta.id === 'ollama') {
      const cfg: ProviderConfig = { providerId: 'ollama' };
      if (baseUrl) cfg.baseUrl = baseUrl;
      if (model) cfg.model = model;
      return cfg;
    }
    const cfg = { providerId: meta.id, apiKey } as ProviderConfig;
    if (model) cfg.model = model;
    return cfg;
  }

  function handleSave() {
    setProviderConfig(buildConfig());
    setDirty(false);
  }

  async function handleTest() {
    setTestStatus('testing');
    setTestError('');
    try {
      const config = buildConfig();
      const response = await testProviderConnection(config);
      setTestStatus(response.length > 0 ? 'ok' : 'error');
      if (response.length === 0) setTestError('Empty response from model.');
    } catch (err) {
      setTestStatus('error');
      setTestError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleSetActive() {
    const config = buildConfig();
    setProviderConfig(config);
    setActiveProvider(meta.id, model);
  }

  const canSave = meta.isCli
    ? binaryPath.trim().length > 0
    : meta.needsApiKey
      ? apiKey.trim().length > 0
      : true;

  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{meta.label}</span>
          {isActive && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
              Active
            </span>
          )}
        </div>
        {saved && (
          <button
            onClick={() => {
              removeProvider(meta.id);
              setApiKey('');
              setBaseUrl(meta.defaultBaseUrl ?? '');
              setTestStatus('idle');
            }}
            className="text-xs text-[hsl(var(--muted-foreground))] hover:text-red-400 transition-colors"
          >
            Remove
          </button>
        )}
      </div>

      {/* API Key */}
      {meta.needsApiKey && (
        <div className="space-y-1">
          <label className="text-xs text-[hsl(var(--muted-foreground))]">API Key</label>
          <input
            type="password"
            value={apiKey}
            placeholder="sk-..."
            onChange={(e) => {
              setApiKey(e.target.value);
              setDirty(true);
              setTestStatus('idle');
            }}
            className="w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-1.5 text-sm font-mono placeholder-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
          />
        </div>
      )}

      {/* Base URL (Ollama) */}
      {meta.needsBaseUrl && (
        <div className="space-y-1">
          <label className="text-xs text-[hsl(var(--muted-foreground))]">Base URL</label>
          <input
            type="text"
            value={baseUrl}
            placeholder={meta.defaultBaseUrl}
            onChange={(e) => {
              setBaseUrl(e.target.value);
              setDirty(true);
              setTestStatus('idle');
            }}
            className="w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-1.5 text-sm font-mono placeholder-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
          />
        </div>
      )}

      {/* Binary path (CLI providers) */}
      {meta.isCli && (
        <div className="space-y-1">
          <label className="text-xs text-[hsl(var(--muted-foreground))]">
            Binary path
            <span className="ml-1 text-[10px] text-[hsl(var(--muted-foreground))]">
              (uses the CLI&apos;s own auth — no API key needed)
            </span>
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={binaryPath}
              placeholder={detecting ? 'Detecting…' : cliDefault}
              onChange={(e) => {
                setBinaryPath(e.target.value);
                setDirty(true);
                setTestStatus('idle');
                setDetectStatus('idle');
              }}
              className="flex-1 rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-1.5 text-sm font-mono placeholder-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
            />
            <button
              type="button"
              onClick={() => void handleDetect()}
              disabled={detecting}
              className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-3 py-1.5 text-xs hover:bg-[hsl(var(--muted))]/80 disabled:opacity-50"
              title="Run `which` via the user's login shell to find the CLI"
            >
              {detecting ? '…' : 'Detect'}
            </button>
          </div>
          {detectStatus === 'found' && (
            <p className="text-[10px] text-green-400">✓ Found via login shell.</p>
          )}
          {detectStatus === 'not-found' && (
            <p className="text-[10px] text-yellow-400">
              Not found on PATH. Install with the official instructions, then click Detect.
            </p>
          )}
        </div>
      )}

      {/* Model select — only for non-CLI providers (CLIs pick their own) */}
      {!meta.isCli && meta.models.length > 0 && (
        <div className="space-y-1">
          <label className="text-xs text-[hsl(var(--muted-foreground))]">Model</label>
          <select
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              setDirty(true);
            }}
            className="w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
          >
            {meta.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Test error message */}
      {testStatus === 'error' && testError && (
        <p className="text-xs text-red-400 break-words">{testError}</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={handleSave}
          disabled={!canSave || !dirty}
          className="text-xs px-3 py-1.5 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          Save
        </button>

        <button
          onClick={handleTest}
          disabled={!canSave || testStatus === 'testing'}
          className="text-xs px-3 py-1.5 rounded border border-[hsl(var(--border))] text-[hsl(var(--foreground))] disabled:opacity-40 hover:bg-[hsl(var(--muted))] transition-colors"
        >
          {testStatus === 'testing' ? 'Testing…' : 'Test connection'}
        </button>

        {testStatus === 'ok' && (
          <span className="text-xs text-green-400 font-medium">Connection OK</span>
        )}

        <button
          onClick={handleSetActive}
          disabled={!canSave}
          className={`ml-auto text-xs px-3 py-1.5 rounded border transition-colors ${
            isActive
              ? 'border-green-500/50 text-green-400 bg-green-500/10'
              : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:border-[hsl(var(--foreground))]'
          }`}
        >
          {isActive ? 'Active provider' : 'Set as active'}
        </button>
      </div>
    </div>
  );
}

// ── Main settings panel ────────────────────────────────────────────────────

export function SettingsPanel() {
  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold mb-1">AI Providers</h2>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          Configure API keys for cloud providers or point to a local Ollama instance. API keys are
          stored in browser localStorage — do not share the app profile.
        </p>
      </div>

      {PROVIDERS.map((p) => (
        <ProviderRow key={p.id} meta={p} />
      ))}
    </div>
  );
}
