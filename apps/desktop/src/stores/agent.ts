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

interface AgentState {
  // ── State ─────────────────────────────────────────────────────────────────
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | undefined;
  /** The AbortController for the current in-flight stream (if any). */
  abortController: AbortController | null;

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
}

export const useAgentStore = create<AgentState>()((set, get) => ({
  messages: [],
  isStreaming: false,
  error: undefined,
  abortController: null,

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
}));
