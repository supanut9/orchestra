/**
 * skills.ts — Zustand store for SKILL.md management.
 *
 * Drives the SkillManager UI. Enabled state is persisted to localStorage
 * through the skills-bridge so it survives page reloads.
 */

import { create } from 'zustand';
import type { SkillWithMeta } from '@/lib/ai/skills-bridge';
import * as bridge from '@/lib/ai/skills-bridge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SkillsState {
  // ── State ─────────────────────────────────────────────────────────────────
  skills: SkillWithMeta[];
  enabledIds: string[];
  selectedId: string | null;
  loading: boolean;
  error: string | null;
  workspacePath: string | null;

  // ── Actions ───────────────────────────────────────────────────────────────

  /** Load workspace path and refresh the skill list. */
  init: (workspacePath: string) => Promise<void>;

  /** Re-scan skill directories. */
  refresh: () => Promise<void>;

  /** Toggle a skill on/off. */
  toggle: (id: string) => void;

  /** Select a skill for detail view. */
  select: (id: string | null) => void;

  /** Write a sample SKILL.md and refresh. */
  createExample: () => Promise<void>;

  /** Open the skills directory in the OS file manager. */
  openFolder: () => Promise<void>;

  clearError: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useSkillsStore = create<SkillsState>()((set, get) => ({
  skills: [],
  enabledIds: [],
  selectedId: null,
  loading: false,
  error: null,
  workspacePath: null,

  init: async (workspacePath) => {
    set({ workspacePath, loading: true, error: null });
    try {
      const skills = await bridge.listAllSkills(workspacePath);
      const enabledIds = Array.from(bridge.getEnabledIds(workspacePath));
      set({ skills, enabledIds, loading: false });
    } catch (err) {
      set({ loading: false, error: toMessage(err) });
    }
  },

  refresh: async () => {
    const { workspacePath } = get();
    if (!workspacePath) return;
    set({ loading: true, error: null });
    try {
      const skills = await bridge.listAllSkills(workspacePath);
      const enabledIds = Array.from(bridge.getEnabledIds(workspacePath));
      set({ skills, enabledIds, loading: false });
    } catch (err) {
      set({ loading: false, error: toMessage(err) });
    }
  },

  toggle: (id) => {
    const { workspacePath, enabledIds } = get();
    if (!workspacePath) return;
    const currentlyEnabled = enabledIds.includes(id);
    bridge.setEnabled(workspacePath, id, !currentlyEnabled);
    const next = currentlyEnabled ? enabledIds.filter((i) => i !== id) : [...enabledIds, id];
    set({ enabledIds: next });
  },

  select: (id) => set({ selectedId: id }),

  createExample: async () => {
    const { workspacePath } = get();
    if (!workspacePath) return;
    set({ loading: true, error: null });
    try {
      await bridge.createExampleSkill(workspacePath);
      await get().refresh();
    } catch (err) {
      set({ loading: false, error: toMessage(err) });
    }
  },

  openFolder: async () => {
    const { workspacePath } = get();
    if (!workspacePath) return;
    await bridge.openSkillsFolder(workspacePath);
  },

  clearError: () => set({ error: null }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
