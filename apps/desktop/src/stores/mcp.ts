/**
 * mcp.ts — Zustand store for MCP server management.
 *
 * Coordinates with mcp-bridge.ts for actual lifecycle operations.
 * All async actions catch errors and surface them via the `error` field.
 */

import { create } from 'zustand';
import type { MCPServer, MCPServerConfig, MCPTool } from '@orchestra/mcp-client';
import * as bridge from '@/lib/ai/mcp-bridge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MCPServerWithTools extends MCPServer {
  /** Loaded lazily when the server is selected. */
  tools?: MCPTool[];
}

interface MCPState {
  // ── State ─────────────────────────────────────────────────────────────────
  servers: MCPServerWithTools[];
  selectedId: string | null;
  loading: boolean;
  error: string | null;

  /** The workspace path currently managed. */
  workspacePath: string | null;

  // ── Actions ───────────────────────────────────────────────────────────────

  /** Set the workspace and refresh the server list. */
  init: (workspacePath: string) => Promise<void>;

  /** Refresh server list from the bridge. */
  refresh: () => Promise<void>;

  /** Select a server and eagerly load its tools. */
  setSelected: (id: string | null) => Promise<void>;

  /** Start a server. */
  startServer: (id: string) => Promise<void>;

  /** Stop a server. */
  stopServer: (id: string) => Promise<void>;

  /** Restart a server. */
  restartServer: (id: string) => Promise<void>;

  /** Add a new server config and persist. */
  addServer: (id: string, config: MCPServerConfig) => Promise<void>;

  /** Remove a server config and persist. */
  removeServer: (id: string) => Promise<void>;

  /** Force-reload config from disk (e.g. after external edit). */
  reloadConfig: () => Promise<void>;

  /** Clear any error. */
  clearError: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useMCPStore = create<MCPState>()((set, get) => ({
  servers: [],
  selectedId: null,
  loading: false,
  error: null,
  workspacePath: null,

  init: async (workspacePath) => {
    set({ workspacePath, loading: true, error: null });
    try {
      const servers = await bridge.getStatus(workspacePath);
      set({ servers, loading: false });
    } catch (err) {
      set({ loading: false, error: toMessage(err) });
    }
  },

  refresh: async () => {
    const { workspacePath } = get();
    if (!workspacePath) return;
    set({ loading: true, error: null });
    try {
      const servers = await bridge.getStatus(workspacePath);
      set({ servers, loading: false });
    } catch (err) {
      set({ loading: false, error: toMessage(err) });
    }
  },

  setSelected: async (id) => {
    set({ selectedId: id });
    if (!id) return;

    const { workspacePath, servers } = get();
    if (!workspacePath) return;

    // Lazily load tools for the selected server
    const existing = servers.find((s) => s.id === id);
    if (existing?.tools) return; // already loaded

    try {
      const tools = await bridge.listTools(workspacePath, id);
      set((state) => ({
        servers: state.servers.map((s) => (s.id === id ? { ...s, tools } : s)),
      }));
    } catch (err) {
      console.warn('[mcp-store] listTools failed:', err);
    }
  },

  startServer: async (id) => {
    const { workspacePath } = get();
    if (!workspacePath) return;
    set((state) => ({
      servers: state.servers.map((s) => (s.id === id ? { ...s, status: 'starting' } : s)),
    }));
    try {
      await bridge.startServer(workspacePath, id);
      set((state) => ({
        servers: state.servers.map((s) => (s.id === id ? { ...s, status: 'running' } : s)),
      }));
    } catch (err) {
      set((state) => ({
        servers: state.servers.map((s) =>
          s.id === id ? { ...s, status: 'error', error: toMessage(err) } : s,
        ),
        error: toMessage(err),
      }));
    }
  },

  stopServer: async (id) => {
    const { workspacePath } = get();
    if (!workspacePath) return;
    try {
      await bridge.stopServer(workspacePath, id);
      set((state) => ({
        servers: state.servers.map((s) => (s.id === id ? { ...s, status: 'stopped' } : s)),
      }));
    } catch (err) {
      set({ error: toMessage(err) });
    }
  },

  restartServer: async (id) => {
    const { workspacePath } = get();
    if (!workspacePath) return;
    set((state) => ({
      servers: state.servers.map((s) => (s.id === id ? { ...s, status: 'starting' } : s)),
    }));
    try {
      await bridge.restartServer(workspacePath, id);
      set((state) => ({
        servers: state.servers.map((s) => (s.id === id ? { ...s, status: 'running' } : s)),
      }));
    } catch (err) {
      set((state) => ({
        servers: state.servers.map((s) =>
          s.id === id ? { ...s, status: 'error', error: toMessage(err) } : s,
        ),
        error: toMessage(err),
      }));
    }
  },

  addServer: async (id, config) => {
    const { workspacePath } = get();
    if (!workspacePath) return;
    set({ loading: true, error: null });
    try {
      await bridge.addServer(workspacePath, id, config);
      const servers = await bridge.getStatus(workspacePath);
      set({ servers, loading: false });
    } catch (err) {
      set({ loading: false, error: toMessage(err) });
    }
  },

  removeServer: async (id) => {
    const { workspacePath } = get();
    if (!workspacePath) return;
    set({ loading: true, error: null });
    try {
      await bridge.removeServer(workspacePath, id);
      const servers = await bridge.getStatus(workspacePath);
      set({
        servers,
        loading: false,
        selectedId: get().selectedId === id ? null : get().selectedId,
      });
    } catch (err) {
      set({ loading: false, error: toMessage(err) });
    }
  },

  reloadConfig: async () => {
    bridge.invalidate();
    await get().refresh();
  },

  clearError: () => set({ error: null }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
