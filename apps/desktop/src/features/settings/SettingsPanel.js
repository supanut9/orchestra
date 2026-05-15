import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useSettingsStore } from '@/stores/settings';
import { testProviderConnection } from '@/lib/ai/provider-registry';
const PROVIDERS = [
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
];
function ProviderRow({ meta }) {
    const { providers, activeProviderId, setProviderConfig, removeProvider, setActiveProvider } = useSettingsStore();
    const saved = providers[meta.id];
    const [apiKey, setApiKey] = useState(saved?.apiKey ?? '');
    const [baseUrl, setBaseUrl] = useState(saved?.baseUrl ?? meta.defaultBaseUrl ?? '');
    const [model, setModel] = useState(saved?.model ?? meta.models[0] ?? '');
    const [testStatus, setTestStatus] = useState('idle');
    const [testError, setTestError] = useState('');
    const [dirty, setDirty] = useState(false);
    const isActive = activeProviderId === meta.id;
    function buildConfig() {
        if (meta.id === 'ollama') {
            const cfg = { providerId: 'ollama' };
            if (baseUrl)
                cfg.baseUrl = baseUrl;
            if (model)
                cfg.model = model;
            return cfg;
        }
        const cfg = { providerId: meta.id, apiKey };
        if (model)
            cfg.model = model;
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
            if (response.length === 0)
                setTestError('Empty response from model.');
        }
        catch (err) {
            setTestStatus('error');
            setTestError(err instanceof Error ? err.message : String(err));
        }
    }
    function handleSetActive() {
        const config = buildConfig();
        setProviderConfig(config);
        setActiveProvider(meta.id, model);
    }
    const canSave = meta.needsApiKey ? apiKey.trim().length > 0 : true;
    return (_jsxs("div", { className: "rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 space-y-3", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-sm font-semibold", children: meta.label }), isActive && (_jsx("span", { className: "text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30", children: "Active" }))] }), saved && (_jsx("button", { onClick: () => {
                            removeProvider(meta.id);
                            setApiKey('');
                            setBaseUrl(meta.defaultBaseUrl ?? '');
                            setTestStatus('idle');
                        }, className: "text-xs text-[hsl(var(--muted-foreground))] hover:text-red-400 transition-colors", children: "Remove" }))] }), meta.needsApiKey && (_jsxs("div", { className: "space-y-1", children: [_jsx("label", { className: "text-xs text-[hsl(var(--muted-foreground))]", children: "API Key" }), _jsx("input", { type: "password", value: apiKey, placeholder: "sk-...", onChange: (e) => {
                            setApiKey(e.target.value);
                            setDirty(true);
                            setTestStatus('idle');
                        }, className: "w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-1.5 text-sm font-mono placeholder-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]" })] })), meta.needsBaseUrl && (_jsxs("div", { className: "space-y-1", children: [_jsx("label", { className: "text-xs text-[hsl(var(--muted-foreground))]", children: "Base URL" }), _jsx("input", { type: "text", value: baseUrl, placeholder: meta.defaultBaseUrl, onChange: (e) => {
                            setBaseUrl(e.target.value);
                            setDirty(true);
                            setTestStatus('idle');
                        }, className: "w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-1.5 text-sm font-mono placeholder-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]" })] })), _jsxs("div", { className: "space-y-1", children: [_jsx("label", { className: "text-xs text-[hsl(var(--muted-foreground))]", children: "Model" }), _jsx("select", { value: model, onChange: (e) => {
                            setModel(e.target.value);
                            setDirty(true);
                        }, className: "w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]", children: meta.models.map((m) => (_jsx("option", { value: m, children: m }, m))) })] }), testStatus === 'error' && testError && (_jsx("p", { className: "text-xs text-red-400 break-words", children: testError })), _jsxs("div", { className: "flex items-center gap-2 flex-wrap", children: [_jsx("button", { onClick: handleSave, disabled: !canSave || !dirty, className: "text-xs px-3 py-1.5 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] disabled:opacity-40 hover:opacity-90 transition-opacity", children: "Save" }), _jsx("button", { onClick: handleTest, disabled: !canSave || testStatus === 'testing', className: "text-xs px-3 py-1.5 rounded border border-[hsl(var(--border))] text-[hsl(var(--foreground))] disabled:opacity-40 hover:bg-[hsl(var(--muted))] transition-colors", children: testStatus === 'testing' ? 'Testing…' : 'Test connection' }), testStatus === 'ok' && (_jsx("span", { className: "text-xs text-green-400 font-medium", children: "Connection OK" })), _jsx("button", { onClick: handleSetActive, disabled: !canSave, className: `ml-auto text-xs px-3 py-1.5 rounded border transition-colors ${isActive
                            ? 'border-green-500/50 text-green-400 bg-green-500/10'
                            : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:border-[hsl(var(--foreground))]'}`, children: isActive ? 'Active provider' : 'Set as active' })] })] }));
}
// ── Main settings panel ────────────────────────────────────────────────────
export function SettingsPanel() {
    return (_jsxs("div", { className: "flex flex-col h-full overflow-y-auto p-4 space-y-4", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-sm font-semibold mb-1", children: "AI Providers" }), _jsx("p", { className: "text-xs text-[hsl(var(--muted-foreground))]", children: "Configure API keys for cloud providers or point to a local Ollama instance. API keys are stored in browser localStorage \u2014 do not share the app profile." })] }), PROVIDERS.map((p) => (_jsx(ProviderRow, { meta: p }, p.id)))] }));
}
