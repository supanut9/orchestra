import { useRef, useEffect, useState, useCallback, type KeyboardEvent } from 'react';
import { useAgentStore } from '@/stores/agent';
import type { ChatMessage as ChatMessageType, ShellToolCall } from '@/stores/agent';
import { useSettingsStore } from '@/stores/settings';
import type { ProviderId } from '@/stores/settings';
import { useCurrentWorkspace } from '@/stores/workspace';
import { streamMessage } from '@/lib/ai/provider-registry';
import { createShellRunner, streamWithTools } from '@/lib/ai/agent-tools';
import { persistConversationTurn } from '@/lib/ai/memory-bridge';
import { isCliProvider } from '@/stores/settings';
import { ChatMessage } from './ChatMessage';
import { ShellToolCard } from './ShellToolCard';
import { SettingsPanel } from '@/features/settings/SettingsPanel';

// ── Provider display metadata ──────────────────────────────────────────────

const PROVIDER_LABELS: Record<ProviderId, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  ollama: 'Ollama',
  openrouter: 'OpenRouter',
  'claude-cli': 'Claude CLI',
  'codex-cli': 'Codex CLI',
  'gemini-cli': 'Gemini CLI',
};

// ── Main component ─────────────────────────────────────────────────────────

export function AgentPanel() {
  const {
    messages,
    isStreaming,
    error,
    sendMessage,
    cancelStream,
    clearMessages,
    clearError,
    activeShellPtyIds,
    shellToolCalls,
    startToolCall,
    finishToolCall,
    recordShellPty,
  } = useAgentStore();
  const { providers, activeProviderId, activeModelId, setActiveProvider } = useSettingsStore();
  const currentWorkspace = useCurrentWorkspace();

  const [input, setInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  /** Whether the agent is allowed to run shell commands. */
  const [shellEnabled, setShellEnabled] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  /** Stable session ID for this panel mount — used as PTY owner. */
  const sessionIdRef = useRef(`panel-${Date.now()}`);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const activeConfig = activeProviderId ? providers[activeProviderId] : null;
  const workspacePath = currentWorkspace?.folders[0]?.path ?? null;

  /**
   * Build the conversation history for multi-turn context.
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

  /** Jump to terminal tab — dispatched by ShellToolCard. */
  const handleJumpToTerminal = useCallback((ptyId: string) => {
    // Emit a custom DOM event that TerminalGrid (Lane B) can listen to.
    window.dispatchEvent(new CustomEvent('orchestra:focus-terminal', { detail: { ptyId } }));
  }, []);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming || !activeConfig) return;

    setInput('');

    const history = buildHistory();
    const config = activeConfig;
    const sessionId = sessionIdRef.current;

    sendMessage(text, async (prompt, onChunk, signal) => {
      const allMessages = [...history, { role: 'user' as const, content: prompt }];

      void persistConversationTurn(workspacePath, sessionId, 'user', prompt);

      let assistantBuffer = '';
      const captureOnChunk = (chunk: string) => {
        assistantBuffer += chunk;
        onChunk(chunk);
      };

      // CLI providers (claude-cli / codex-cli / gemini-cli) don't go through
      // Vercel AI SDK and can't use the shellTool path. Fall back to plain
      // streaming so the CLI still works; tools will be supported once we
      // wire shell calls into the CLI prompt in a later sprint.
      const useTools = shellEnabled && !isCliProvider(config);

      if (useTools) {
        // Tool-enabled path: import shellTool lazily to avoid loading it before needed
        const { shellTool } = await import('@orchestra/ai-runtime');
        const runShellCommand = createShellRunner(sessionId, workspacePath);

        const tools = {
          shell: shellTool(runShellCommand, {
            onSpawn: (ptyId, command) => {
              // Find the matching toolCallId from the store (populated by onToolCall below)
              recordShellPty(ptyId);
              // Update any running tool call that matches this command with the ptyId
              const calls = useAgentStore.getState().shellToolCalls;
              const match = Object.values(calls).find(
                (c) => c.command === command && c.status === 'running' && !c.ptyId,
              );
              if (match) {
                useAgentStore.setState((s) => ({
                  shellToolCalls: {
                    ...s.shellToolCalls,
                    [match.toolCallId]: { ...match, ptyId },
                  },
                }));
              }
            },
          }),
        };

        await streamWithTools({
          config,
          messages: allMessages,
          tools,
          onChunk: captureOnChunk,
          signal,
          onToolCall: (event) => {
            startToolCall(event);
          },
          onToolResult: (event) => {
            finishToolCall(event);
          },
        });
      } else {
        // Plain streaming — no tools
        await streamMessage({
          config,
          messages: allMessages,
          onChunk: captureOnChunk,
          signal,
        });
      }

      void persistConversationTurn(workspacePath, sessionId, 'assistant', assistantBuffer);
    });
  }, [
    input,
    isStreaming,
    activeConfig,
    buildHistory,
    sendMessage,
    shellEnabled,
    workspacePath,
    startToolCall,
    finishToolCall,
    recordShellPty,
  ]);

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

      {/* Active shells badge */}
      {activeShellPtyIds.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-1 text-[11px] text-yellow-400 border-b border-[hsl(var(--border))] bg-yellow-400/5 shrink-0">
          <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 shrink-0" />
          <span>
            Agent has {activeShellPtyIds.length} live terminal
            {activeShellPtyIds.length !== 1 ? 's' : ''}
          </span>
          {activeShellPtyIds.map((id) => (
            <button
              key={id}
              onClick={() => handleJumpToTerminal(id)}
              className="ml-1 px-1.5 py-0.5 rounded border border-yellow-400/30 hover:bg-yellow-400/10 transition-colors font-mono text-[10px]"
              title={`Jump to terminal ${id}`}
            >
              {id.slice(0, 8)}
            </button>
          ))}
        </div>
      )}

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
          <div key={msg.id}>
            <ChatMessage message={msg} />
            {/* Render tool call cards inline after each assistant message */}
            {msg.role === 'assistant' &&
              (Object.values(shellToolCalls) as ShellToolCall[])
                .filter((tc) => {
                  // Show tool calls that were initiated during this message's streaming window.
                  // We approximate by checking if the toolCall started at or after this message.
                  return tc.startedAt >= msg.createdAt.getTime() - 500;
                })
                .map((tc) => (
                  <ShellToolCard
                    key={tc.toolCallId}
                    toolCall={tc}
                    onJumpToTerminal={handleJumpToTerminal}
                  />
                ))}
          </div>
        ))}

        {/* Error toast */}
        {error && (
          <div className="mx-1 mb-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400 flex items-start gap-2">
            <span className="flex-1 break-words">{error}</span>
            <button
              onClick={clearError}
              className="shrink-0 font-bold hover:text-red-300 transition-colors"
            >
              x
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Compose box */}
      <div className="shrink-0 border-t border-[hsl(var(--border))] p-2">
        {/* Shell tool toggle — disabled for CLI providers (not yet supported) */}
        <div className="flex items-center gap-2 mb-1.5 px-1">
          <label
            className={`flex items-center gap-1.5 select-none ${
              activeConfig && isCliProvider(activeConfig) ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
            }`}
            title={
              activeConfig && isCliProvider(activeConfig)
                ? 'Shell tools are not supported with CLI providers yet (Sprint 5).'
                : 'Let the agent run shell commands in a PTY you can watch.'
            }
          >
            <input
              type="checkbox"
              checked={shellEnabled && !(activeConfig && isCliProvider(activeConfig))}
              disabled={!!(activeConfig && isCliProvider(activeConfig))}
              onChange={(e) => setShellEnabled(e.target.checked)}
              className="w-3 h-3 rounded accent-[hsl(var(--primary))]"
            />
            <span className="text-[10px] text-[hsl(var(--muted-foreground))]">Shell tools</span>
          </label>
          {shellEnabled && activeConfig && !isCliProvider(activeConfig) && (
            <span className="text-[10px] text-yellow-400/80">
              Agent may run commands in your terminal
            </span>
          )}
          {activeConfig && isCliProvider(activeConfig) && (
            <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
              (Not available for CLI providers)
            </span>
          )}
        </div>

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
