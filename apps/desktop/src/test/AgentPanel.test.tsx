import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from '@testing-library/react';

// ── Mock Tauri APIs ────────────────────────────────────────────────────────
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => undefined),
}));

// ── Mock @orchestra/ai-runtime (Node-only native deps) ─────────────────────
vi.mock('@orchestra/ai-runtime', () => ({
  createProvider: vi.fn(() => ({ modelId: 'mock-model' })),
  defaultModels: {
    anthropic: 'claude-sonnet-4-7',
    openai: 'gpt-4o',
    google: 'gemini-2.5-pro',
    ollama: 'llama3.2',
    openrouter: 'anthropic/claude-sonnet-4-7',
  },
  listAvailableProviders: vi.fn(() => []),
}));

// ── Mock @orchestra/ai-runtime/stream ──────────────────────────────────────
vi.mock('@orchestra/ai-runtime/stream', () => ({
  streamText: vi.fn(() => ({
    textStream: (async function* () {
      yield 'mocked response';
    })(),
  })),
}));

// ── Mock @orchestra/memory ─────────────────────────────────────────────────
vi.mock('@orchestra/memory', () => ({
  MemoryStore: vi.fn().mockImplementation(() => ({
    init: vi.fn().mockResolvedValue(undefined),
    insert: vi.fn().mockResolvedValue({}),
    list: vi.fn().mockResolvedValue([]),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

function wrapper(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('AgentPanel', () => {
  it('renders empty state when no provider is configured', async () => {
    const { AgentPanel } = await import('@/features/agents/AgentPanel');
    const { useSettingsStore } = await import('@/stores/settings');

    act(() => {
      useSettingsStore.getState().clearActiveProvider();
    });

    wrapper(<AgentPanel />);
    expect(screen.getByText(/No provider configured/i)).toBeInTheDocument();
    expect(screen.getByText(/Open Settings/i)).toBeInTheDocument();
  });

  it('renders compose textarea when a provider is active', async () => {
    const { AgentPanel } = await import('@/features/agents/AgentPanel');
    const { useSettingsStore } = await import('@/stores/settings');

    act(() => {
      useSettingsStore.getState().setProviderConfig({ providerId: 'anthropic', apiKey: 'sk-x' });
      useSettingsStore.getState().setActiveProvider('anthropic', 'claude-sonnet-4-7');
    });

    wrapper(<AgentPanel />);
    expect(screen.getByPlaceholderText(/Type a message/i)).toBeInTheDocument();
  });

  it('always renders Config button', async () => {
    const { AgentPanel } = await import('@/features/agents/AgentPanel');
    wrapper(<AgentPanel />);
    expect(screen.getByText('Config')).toBeInTheDocument();
  });

  it('shows settings panel when Config button is clicked', async () => {
    const { AgentPanel } = await import('@/features/agents/AgentPanel');
    const { useSettingsStore } = await import('@/stores/settings');

    act(() => {
      useSettingsStore.getState().clearActiveProvider();
    });

    const { getByText } = wrapper(<AgentPanel />);
    act(() => {
      getByText('Config').click();
    });

    expect(screen.getByText(/AI Providers/i)).toBeInTheDocument();
  });
});
