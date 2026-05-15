import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act } from '@testing-library/react';
// ── Mock Tauri APIs (not available in jsdom) ────────────────────────────────
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn().mockResolvedValue(null),
}));
vi.mock('@tauri-apps/api/event', () => ({
    listen: vi.fn().mockResolvedValue(() => undefined),
}));
// ── Settings store ─────────────────────────────────────────────────────────
describe('useSettingsStore', () => {
    // Dynamic import inside tests to avoid circular dependency issues with Zustand persist
    it('sets and retrieves a provider config', async () => {
        const { useSettingsStore } = await import('@/stores/settings');
        act(() => {
            useSettingsStore.getState().setProviderConfig({
                providerId: 'anthropic',
                apiKey: 'sk-test-123',
                model: 'claude-sonnet-4-7',
            });
        });
        const state = useSettingsStore.getState();
        expect(state.providers['anthropic']).toBeDefined();
        expect(state.providers['anthropic'].apiKey).toBe('sk-test-123');
    });
    it('sets and clears active provider', async () => {
        const { useSettingsStore } = await import('@/stores/settings');
        act(() => {
            useSettingsStore.getState().setActiveProvider('openai', 'gpt-4o');
        });
        const state = useSettingsStore.getState();
        expect(state.activeProviderId).toBe('openai');
        expect(state.activeModelId).toBe('gpt-4o');
        act(() => {
            useSettingsStore.getState().clearActiveProvider();
        });
        expect(useSettingsStore.getState().activeProviderId).toBeNull();
    });
    it('removes a provider and clears active if removed', async () => {
        const { useSettingsStore } = await import('@/stores/settings');
        act(() => {
            useSettingsStore.getState().setProviderConfig({ providerId: 'openai', apiKey: 'sk-oai' });
            useSettingsStore.getState().setActiveProvider('openai');
        });
        act(() => {
            useSettingsStore.getState().removeProvider('openai');
        });
        const state = useSettingsStore.getState();
        expect(state.providers['openai']).toBeUndefined();
        expect(state.activeProviderId).toBeNull();
    });
});
// ── Agent store ────────────────────────────────────────────────────────────
describe('useAgentStore', () => {
    beforeEach(async () => {
        const { useAgentStore } = await import('@/stores/agent');
        act(() => {
            useAgentStore.getState().clearMessages();
        });
    });
    it('starts with empty messages', async () => {
        const { useAgentStore } = await import('@/stores/agent');
        expect(useAgentStore.getState().messages).toHaveLength(0);
    });
    it('appendMessage adds a message', async () => {
        const { useAgentStore } = await import('@/stores/agent');
        act(() => {
            useAgentStore.getState().appendMessage({ role: 'user', content: 'Hello' });
        });
        const msgs = useAgentStore.getState().messages;
        expect(msgs).toHaveLength(1);
        expect(msgs[0].role).toBe('user');
        expect(msgs[0].content).toBe('Hello');
        expect(msgs[0].id).toBeTruthy();
    });
    it('clearMessages empties the list', async () => {
        const { useAgentStore } = await import('@/stores/agent');
        act(() => {
            useAgentStore.getState().appendMessage({ role: 'assistant', content: 'Hi there' });
        });
        act(() => {
            useAgentStore.getState().clearMessages();
        });
        expect(useAgentStore.getState().messages).toHaveLength(0);
    });
    it('sendMessage streams correctly via injected streamFn', async () => {
        const { useAgentStore } = await import('@/stores/agent');
        const streamFn = vi.fn(async (_text, onChunk) => {
            onChunk('Hello ');
            onChunk('world');
        });
        await act(async () => {
            await useAgentStore.getState().sendMessage('test', streamFn);
        });
        const msgs = useAgentStore.getState().messages;
        expect(msgs).toHaveLength(2);
        expect(msgs[0].role).toBe('user');
        expect(msgs[0].content).toBe('test');
        expect(msgs[1].role).toBe('assistant');
        expect(msgs[1].content).toBe('Hello world');
        expect(msgs[1].streaming).toBe(false);
        expect(useAgentStore.getState().isStreaming).toBe(false);
    });
    it('sendMessage captures error from streamFn', async () => {
        const { useAgentStore } = await import('@/stores/agent');
        const streamFn = vi.fn(async () => {
            throw new Error('Network error');
        });
        await act(async () => {
            await useAgentStore.getState().sendMessage('test', streamFn);
        });
        const state = useAgentStore.getState();
        expect(state.error).toBe('Network error');
        expect(state.isStreaming).toBe(false);
    });
    it('cancelStream aborts and clears streaming flag', async () => {
        const { useAgentStore } = await import('@/stores/agent');
        act(() => {
            useAgentStore.setState({ isStreaming: true, abortController: new AbortController() });
        });
        act(() => {
            useAgentStore.getState().cancelStream();
        });
        expect(useAgentStore.getState().isStreaming).toBe(false);
        expect(useAgentStore.getState().abortController).toBeNull();
    });
});
