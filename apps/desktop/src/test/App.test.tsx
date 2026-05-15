import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from '../App';

// Mock Tauri IPC — not available in jsdom
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => undefined),
}));

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('App layout smoke test', () => {
  it('renders the top bar with project name', () => {
    renderWithProviders(<App />);
    expect(screen.getByText('Orchestra')).toBeInTheDocument();
  });

  it('renders the Explorer sidebar label', () => {
    renderWithProviders(<App />);
    expect(screen.getByText('Explorer')).toBeInTheDocument();
  });

  it('renders the Agent sidebar label', () => {
    renderWithProviders(<App />);
    expect(screen.getByText('Agent')).toBeInTheDocument();
  });

  it('renders the Terminal panel label', () => {
    renderWithProviders(<App />);
    expect(screen.getByText('Terminal')).toBeInTheDocument();
  });
});
