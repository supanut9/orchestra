import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useRef, useEffect, useState, useCallback } from 'react';
import { useAgentStore } from '@/stores/agent';
import { useSettingsStore } from '@/stores/settings';
import { streamMessage } from '@/lib/ai/provider-registry';
import { ChatMessage } from './ChatMessage';
import { SettingsPanel } from '@/features/settings/SettingsPanel';
// ── Provider display metadata ──────────────────────────────────────────────
const PROVIDER_LABELS = {
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    google: 'Google',
    ollama: 'Ollama',
    openrouter: 'OpenRouter',
};
// ── Main component ─────────────────────────────────────────────────────────
export function AgentPanel() {
    const { messages, isStreaming, error, sendMessage, cancelStream, clearMessages, clearError } = useAgentStore();
    const { providers, activeProviderId, activeModelId, setActiveProvider } = useSettingsStore();
    const [input, setInput] = useState('');
    const [showSettings, setShowSettings] = useState(false);
    const messagesEndRef = useRef(null);
    const textareaRef = useRef(null);
    // Auto-scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);
    const activeConfig = activeProviderId ? providers[activeProviderId] : null;
    /**
     * Build the conversation history for multi-turn context.
     * We pass the full history EXCEPT the last message because sendMessage
     * will append the new user message itself.
     */
    const buildHistory = useCallback(() => messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.content })), [messages]);
    const handleSend = useCallback(() => {
        const text = input.trim();
        if (!text || isStreaming || !activeConfig)
            return;
        setInput('');
        const history = buildHistory();
        const config = activeConfig;
        sendMessage(text, async (prompt, onChunk, signal) => {
            await streamMessage({
                config,
                messages: [...history, { role: 'user', content: prompt }],
                onChunk,
                signal,
            });
        });
    }, [input, isStreaming, activeConfig, buildHistory, sendMessage]);
    const handleKeyDown = useCallback((e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            handleSend();
        }
    }, [handleSend]);
    // ── Settings overlay ─────────────────────────────────────────────────────
    if (showSettings) {
        return (_jsxs("div", { className: "flex flex-col h-full", children: [_jsxs("div", { className: "flex items-center justify-between px-3 py-2 border-b border-[hsl(var(--border))] shrink-0", children: [_jsx("span", { className: "text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]", children: "Provider Settings" }), _jsx("button", { onClick: () => setShowSettings(false), className: "text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors px-2 py-1 rounded hover:bg-[hsl(var(--muted))]", children: "Back" })] }), _jsx("div", { className: "flex-1 min-h-0 overflow-y-auto", children: _jsx(SettingsPanel, {}) })] }));
    }
    // ── Main chat UI ─────────────────────────────────────────────────────────
    return (_jsxs("div", { className: "flex flex-col h-full", children: [_jsxs("div", { className: "flex items-center gap-2 px-3 py-2 border-b border-[hsl(var(--border))] shrink-0", children: [_jsxs("select", { value: activeProviderId ?? '', onChange: (e) => {
                            const id = e.target.value;
                            if (id)
                                setActiveProvider(id);
                        }, className: "flex-1 rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]", children: [_jsx("option", { value: "", children: "\u2014 Select provider \u2014" }), Object.keys(providers).map((id) => (_jsxs("option", { value: id, children: [PROVIDER_LABELS[id], " (", providers[id]?.model ?? 'default', ")"] }, id)))] }), _jsx("button", { onClick: () => setShowSettings(true), title: "Configure providers", className: "shrink-0 text-xs px-2 py-1 rounded border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors", children: "Config" }), messages.length > 0 && (_jsx("button", { onClick: clearMessages, title: "Clear conversation", className: "shrink-0 text-xs px-2 py-1 rounded border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-red-400 transition-colors", children: "Clear" }))] }), _jsxs("div", { className: "flex-1 min-h-0 overflow-y-auto px-3 py-3", children: [messages.length === 0 && (_jsx("div", { className: "flex flex-col items-center justify-center h-full text-center gap-2 px-4", children: activeConfig ? (_jsxs(_Fragment, { children: [_jsx("p", { className: "text-sm font-medium text-[hsl(var(--foreground))]", children: "Ready to chat" }), _jsxs("p", { className: "text-xs text-[hsl(var(--muted-foreground))]", children: ["Using ", _jsx("span", { className: "font-medium", children: PROVIDER_LABELS[activeProviderId] }), activeModelId && (_jsxs(_Fragment, { children: [' / ', _jsx("span", { className: "font-mono", children: activeModelId })] }))] }), _jsx("p", { className: "text-xs text-[hsl(var(--muted-foreground))]", children: "Type a message below or press Cmd+Enter to send" })] })) : (_jsxs(_Fragment, { children: [_jsx("p", { className: "text-sm font-medium text-[hsl(var(--foreground))]", children: "No provider configured" }), _jsx("p", { className: "text-xs text-[hsl(var(--muted-foreground))]", children: "Click Config to add an API key and select an AI provider." }), _jsx("button", { onClick: () => setShowSettings(true), className: "mt-2 text-xs px-3 py-1.5 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-opacity", children: "Open Settings" })] })) })), messages.map((msg) => (_jsx(ChatMessage, { message: msg }, msg.id))), error && (_jsxs("div", { className: "mx-1 mb-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400 flex items-start gap-2", children: [_jsx("span", { className: "flex-1 break-words", children: error }), _jsx("button", { onClick: clearError, className: "shrink-0 font-bold hover:text-red-300 transition-colors", children: "\u00D7" })] })), _jsx("div", { ref: messagesEndRef })] }), _jsx("div", { className: "shrink-0 border-t border-[hsl(var(--border))] p-2", children: _jsxs("div", { className: "flex gap-2 items-end", children: [_jsx("textarea", { ref: textareaRef, value: input, onChange: (e) => setInput(e.target.value), onKeyDown: handleKeyDown, placeholder: activeConfig ? 'Type a message… (Cmd+Enter to send)' : 'Configure a provider first…', disabled: !activeConfig || isStreaming, rows: 3, className: "flex-1 resize-none rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm placeholder-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))] disabled:opacity-50" }), _jsx("div", { className: "flex flex-col gap-1", children: isStreaming ? (_jsx("button", { onClick: cancelStream, className: "px-3 py-2 rounded text-xs bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30 transition-colors", children: "Stop" })) : (_jsx("button", { onClick: handleSend, disabled: !input.trim() || !activeConfig, className: "px-3 py-2 rounded text-xs bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] disabled:opacity-40 hover:opacity-90 transition-opacity", children: "Send" })) })] }) })] }));
}
