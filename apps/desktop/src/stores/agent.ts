import { create } from 'zustand';
import { nanoid } from 'nanoid';

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  /** Full text content. During streaming this is the accumulated text so far. */
  content: string;
  /** True while this assistant message is still receiving chunks. */
  streaming?: boolean;
  createdAt: Date;
}

// ── Tool-call tracking ─────────────────────────────────────────────────────────

/** Lifecycle states for an in-message tool invocation. */
export type ToolCallStatus = 'running' | 'done' | 'error';

/**
 * Tracks a single shell tool invocation spawned by the agent.
 * Rendered inline inside the message stream as a ShellToolCard.
 */
export interface ShellToolCall {
  /** Vercel AI SDK tool call ID (stable across call→result events). */
  toolCallId: string;
  command: string;
  /** PTY UUID — set once the PTY is spawned; null until then. */
  ptyId: string | null;
  status: ToolCallStatus;
  /** Wall-clock start time (ms). */
  startedAt: number;
  /** Wall-clock finish time (ms) — null while running. */
  finishedAt: number | null;
  /** Accumulated output (populated on done/error). */
  output: string;
  error?: string;
}

interface AgentState {
  // ── Conversation ───────────────────────────────────────────────────────────
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | undefined;
  /** The AbortController for the current in-flight stream (if any). */
  abortController: AbortController | null;

  // ── Shell tool calls ───────────────────────────────────────────────────────
  /** PTY IDs of all shells spawned by the agent this session. */
  activeShellPtyIds: string[];
  /**
   * Tool call records keyed by toolCallId.
   * Populated as the agent fires onToolCall / onToolResult events.
   */
  shellToolCalls: Record<string, ShellToolCall>;

  // ── Actions ───────────────────────────────────────────────────────────────
  /**
   * Append a user message and kick off streaming from the provider.
   * The `streamFn` is injected so the store stays provider-agnostic.
   */
  sendMessage: (
    text: string,
    streamFn: (
      text: string,
      onChunk: (chunk: string) => void,
      signal: AbortSignal,
    ) => Promise<void>,
  ) => Promise<void>;

  /** Cancel the in-flight stream. */
  cancelStream: () => void;

  /** Remove all messages from the current conversation. */
  clearMessages: () => void;

  /** Push a raw message directly (used for system messages / rehydration). */
  appendMessage: (msg: Omit<ChatMessage, 'id' | 'createdAt'>) => void;

  /** Dismiss the current error. */
  clearError: () => void;

  // ── Shell PTY actions ──────────────────────────────────────────────────────

  /**
   * Register a PTY ID spawned by the agent.
   * Called by the agent-tools bridge once ptySpawn resolves.
   */
  recordShellPty: (ptyId: string) => void;

  /**
   * Mark a tool call as started (PTY just spawned).
   * Creates the ShellToolCall record with status='running'.
   */
  startToolCall: (event: {
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
    ptyId?: string;
  }) => void;

  /**
   * Mark a tool call as completed.
   * Updates its status, output, and finishedAt timestamp.
   */
  finishToolCall: (event: { toolCallId: string; result: unknown }) => void;

  /** Remove all shell PTY state (e.g. when clearing the conversation). */
  clearShellState: () => void;
}

export const useAgentStore = create<AgentState>()((set, get) => ({
  messages: [],
  isStreaming: false,
  error: undefined,
  abortController: null,
  activeShellPtyIds: [],
  shellToolCalls: {},

  sendMessage: async (text, streamFn) => {
    if (get().isStreaming) return;

    const userMsg: ChatMessage = {
      id: nanoid(),
      role: 'user',
      content: text,
      createdAt: new Date(),
    };

    const assistantMsgId = nanoid();
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      streaming: true,
      createdAt: new Date(),
    };

    const abortController = new AbortController();

    set((s) => ({
      messages: [...s.messages, userMsg, assistantMsg],
      isStreaming: true,
      error: undefined,
      abortController,
    }));

    try {
      await streamFn(
        text,
        (chunk) => {
          set((s) => ({
            messages: s.messages.map((m) =>
              m.id === assistantMsgId ? { ...m, content: m.content + chunk } : m,
            ),
          }));
        },
        abortController.signal,
      );
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        const message =
          err instanceof Error ? err.message : 'An unknown error occurred while streaming.';
        set((s) => ({
          error: message,
          messages: s.messages.map((m) =>
            m.id === assistantMsgId ? { ...m, streaming: false } : m,
          ),
        }));
      }
    } finally {
      set((s) => ({
        isStreaming: false,
        abortController: null,
        messages: s.messages.map((m) => (m.id === assistantMsgId ? { ...m, streaming: false } : m)),
      }));
    }
  },

  cancelStream: () => {
    const { abortController } = get();
    abortController?.abort();
    set({ isStreaming: false, abortController: null });
  },

  clearMessages: () => set({ messages: [], error: undefined }),

  appendMessage: (msg) =>
    set((s) => ({
      messages: [...s.messages, { ...msg, id: nanoid(), createdAt: new Date() }],
    })),

  clearError: () => set({ error: undefined }),

  // ── Shell PTY actions ──────────────────────────────────────────────────────

  recordShellPty: (ptyId) =>
    set((s) => ({
      activeShellPtyIds: s.activeShellPtyIds.includes(ptyId)
        ? s.activeShellPtyIds
        : [...s.activeShellPtyIds, ptyId],
    })),

  startToolCall: ({ toolCallId, args, ptyId }) => {
    const command = typeof args['command'] === 'string' ? args['command'] : JSON.stringify(args);
    const record: ShellToolCall = {
      toolCallId,
      command,
      ptyId: ptyId ?? null,
      status: 'running',
      startedAt: Date.now(),
      finishedAt: null,
      output: '',
    };
    set((s) => ({
      shellToolCalls: { ...s.shellToolCalls, [toolCallId]: record },
    }));
  },

  finishToolCall: ({ toolCallId, result }) => {
    set((s) => {
      const existing = s.shellToolCalls[toolCallId];
      if (!existing) return {};

      const resultObj =
        result !== null && typeof result === 'object' ? (result as Record<string, unknown>) : {};
      const success = resultObj['success'] !== false;
      const output =
        typeof resultObj['output'] === 'string' ? resultObj['output'] : JSON.stringify(result);
      const error = typeof resultObj['error'] === 'string' ? resultObj['error'] : undefined;

      // Register PTY ID if the result carried it and we didn't have it yet
      const ptyId = typeof resultObj['ptyId'] === 'string' ? resultObj['ptyId'] : existing.ptyId;

      const updated: ShellToolCall = {
        ...existing,
        ptyId,
        status: success ? 'done' : 'error',
        finishedAt: Date.now(),
        output,
        ...(error ? { error } : {}),
      };

      const updatedPtyIds =
        ptyId && !s.activeShellPtyIds.includes(ptyId)
          ? [...s.activeShellPtyIds, ptyId]
          : s.activeShellPtyIds;

      return {
        shellToolCalls: { ...s.shellToolCalls, [toolCallId]: updated },
        activeShellPtyIds: updatedPtyIds,
      };
    });
  },

  clearShellState: () => set({ activeShellPtyIds: [], shellToolCalls: {} }),
}));
