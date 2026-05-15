import { useRef, useEffect, useState, useCallback, type KeyboardEvent } from 'react';
import { useAgentStore } from '@/stores/agent';
import type { ChatMessage as ChatMessageType } from '@/stores/agent';
import { useSettingsStore } from '@/stores/settings';
import type { ProviderId } from '@/stores/settings';
import { streamMessage } from '@/lib/ai/provider-registry';
import { ChatMessage } from './ChatMessage';
import { SettingsPanel } from '@/features/settings/SettingsPanel';

// ── Provider display metadata ──────────────────────────────────────────────

const PROVIDER_LABELS: Record<ProviderId, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  ollama: 'Ollama',
  openrouter: 'OpenRouter',
};

// ── Main component ─────────────────────────────────────────────────────────

export function AgentPanel() {
  const { messages, isStreaming, error, sendMessage, cancelStream, clearMessages, clearError } =
    useAgentStore();
  const { providers, activeProviderId, activeModelId, setActiveProvider } = useSettingsStore();

  const [input, setInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
  const buildHistory = useCallback(
    (): { role: 'user' | 'assistant'; content: string }[] =>
      messages
        .filter(
          (m): m is ChatMessageType & { role: 'user' | 'assistant' } =>
            m.role === 'user' || m.role === 'assistant',
        )
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    [messages],
  );

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming || !activeConfig) return;

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

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // ── Settings overlay ─────────────────────────────────────────────────────
  if (showSettings) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-3 py-2 border-b border-[hsl(var(--border))] shrink-0">
          <span className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            Provider Settings
          </span>
          <button
            onClick={() => setShowSettings(false)}
            className="text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors px-2 py-1 rounded hover:bg-[hsl(var(--muted))]"
          >
            Back
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <SettingsPanel />
        </div>
      </div>
    );
  }

  // ── Main chat UI ─────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Provider selector header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[hsl(var(--border))] shrink-0">
        <select
          value={activeProviderId ?? ''}
          onChange={(e) => {
            const id = e.target.value as ProviderId;
            if (id) setActiveProvider(id);
          }}
          className="flex-1 rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
        >
          <option value="">— Select provider —</option>
          {(Object.keys(providers) as ProviderId[]).map((id) => (
            <option key={id} value={id}>
              {PROVIDER_LABELS[id]} ({providers[id]?.model ?? 'default'})
            </option>
          ))}
        </select>

        <button
          onClick={() => setShowSettings(true)}
          title="Configure providers"
          className="shrink-0 text-xs px-2 py-1 rounded border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors"
        >
          Config
        </button>

        {messages.length > 0 && (
          <button
            onClick={clearMessages}
            title="Clear conversation"
            className="shrink-0 text-xs px-2 py-1 rounded border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-red-400 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Message list */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-2 px-4">
            {activeConfig ? (
              <>
                <p className="text-sm font-medium text-[hsl(var(--foreground))]">Ready to chat</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Using <span className="font-medium">{PROVIDER_LABELS[activeProviderId!]}</span>
                  {activeModelId && (
                    <>
                      {' / '}
                      <span className="font-mono">{activeModelId}</span>
                    </>
                  )}
                </p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Type a message below or press Cmd+Enter to send
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                  No provider configured
                </p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Click Config to add an API key and select an AI provider.
                </p>
                <button
                  onClick={() => setShowSettings(true)}
                  className="mt-2 text-xs px-3 py-1.5 rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-opacity"
                >
                  Open Settings
                </button>
              </>
            )}
          </div>
        )}

        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}

        {/* Error toast */}
        {error && (
          <div className="mx-1 mb-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400 flex items-start gap-2">
            <span className="flex-1 break-words">{error}</span>
            <button
              onClick={clearError}
              className="shrink-0 font-bold hover:text-red-300 transition-colors"
            >
              ×
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Compose box */}
      <div className="shrink-0 border-t border-[hsl(var(--border))] p-2">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              activeConfig ? 'Type a message… (Cmd+Enter to send)' : 'Configure a provider first…'
            }
            disabled={!activeConfig || isStreaming}
            rows={3}
            className="flex-1 resize-none rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm placeholder-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))] disabled:opacity-50"
          />

          <div className="flex flex-col gap-1">
            {isStreaming ? (
              <button
                onClick={cancelStream}
                className="px-3 py-2 rounded text-xs bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30 transition-colors"
              >
                Stop
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim() || !activeConfig}
                className="px-3 py-2 rounded text-xs bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                Send
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
