import { create } from 'zustand';
import { nanoid } from 'nanoid';
export const useAgentStore = create()((set, get) => ({
    messages: [],
    isStreaming: false,
    error: undefined,
    abortController: null,
    sendMessage: async (text, streamFn) => {
        if (get().isStreaming)
            return;
        const userMsg = {
            id: nanoid(),
            role: 'user',
            content: text,
            createdAt: new Date(),
        };
        const assistantMsgId = nanoid();
        const assistantMsg = {
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
            await streamFn(text, (chunk) => {
                set((s) => ({
                    messages: s.messages.map((m) => m.id === assistantMsgId ? { ...m, content: m.content + chunk } : m),
                }));
            }, abortController.signal);
        }
        catch (err) {
            if (err?.name !== 'AbortError') {
                const message = err instanceof Error ? err.message : 'An unknown error occurred while streaming.';
                set((s) => ({
                    error: message,
                    messages: s.messages.map((m) => m.id === assistantMsgId ? { ...m, streaming: false } : m),
                }));
            }
        }
        finally {
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
    appendMessage: (msg) => set((s) => ({
        messages: [...s.messages, { ...msg, id: nanoid(), createdAt: new Date() }],
    })),
    clearError: () => set({ error: undefined }),
}));
