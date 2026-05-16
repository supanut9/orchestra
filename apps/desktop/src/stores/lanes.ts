/**
 * Lanes store — manages the parallel task lane lifecycle.
 *
 * State flows:  proposed → approved → running → merged | discarded
 *
 * The store is intentionally NOT persisted (persist middleware omitted) so
 * that lanes are ephemeral within a session.  Persistence across restarts
 * can be added in Sprint 3 via `zustand/middleware` + `tauri-plugin-store`.
 */

import { create } from 'zustand';

// ── Types ─────────────────────────────────────────────────────────────────────

export type LaneStatus = 'proposed' | 'approved' | 'running' | 'merged' | 'discarded';

export interface Lane {
  /** Stable identifier — matches the LangGraph LanePlan.id */
  id: string;
  /** Short human-readable title (e.g. "Research & design") */
  title: string;
  /** Longer description of what the agent should accomplish */
  description: string;
  status: LaneStatus;
  /** Absolute path to the git worktree directory once the lane is approved */
  worktreePath?: string;
  /** Git branch checked out inside the worktree (full ref name) */
  branchName?: string;
  /** PTY ID assigned by Lane B's pty_spawn command */
  ptyId?: string;
  /** Agent session ID used to correlate streamed messages */
  agentSessionId?: string;
  /** ISO-8601 timestamp set when the lane is created */
  createdAt: string;
  /** ISO-8601 timestamp set when the lane reaches a terminal state */
  completedAt?: string;
}

// ── Store interface ───────────────────────────────────────────────────────────

interface LanesState {
  // ── State ──────────────────────────────────────────────────────────────────

  /** Ordered list of all lanes (newest first within each status group). */
  lanes: Lane[];

  /** The user's current goal text (persisted here so the input survives
   *  re-renders but is cleared when the user calls clearAll). */
  goal: string;

  /** True while the coordinator is generating lane proposals. */
  isProposing: boolean;

  /** Non-null when the coordinator request or a worktree command fails. */
  error: string | null;

  // ── Actions ────────────────────────────────────────────────────────────────

  setGoal: (goal: string) => void;
  setProposing: (value: boolean) => void;
  setError: (error: string | null) => void;

  /**
   * Replace the proposed lanes list.  Called after `Coordinator.decomposeTask`
   * resolves.  Any existing proposed/approved lanes are replaced; running,
   * merged, and discarded lanes are kept.
   */
  addLanes: (lanes: Omit<Lane, 'status' | 'createdAt'>[]) => void;

  /**
   * Transition a lane from `proposed` → `approved`.
   * The worktree and PTY haven't been created yet at this point.
   */
  approveLane: (id: string) => void;

  /**
   * Transition a lane from `approved` → `running` and record the IDs of the
   * worktree path, branch, PTY, and agent session that were created for it.
   */
  markLaneRunning: (
    id: string,
    opts: {
      worktreePath: string;
      branchName: string;
      ptyId: string;
      agentSessionId: string;
    },
  ) => void;

  /**
   * Transition a lane from `running` → `merged`.
   * Called after `git_worktree_merge` succeeds.
   */
  markLaneMerged: (id: string) => void;

  /**
   * Transition any non-terminal lane → `discarded`.
   * Called when the user clicks "Discard" or when worktree creation fails.
   */
  discardLane: (id: string) => void;

  /** Remove all lanes and reset the goal field. */
  clearAll: () => void;
}

// ── Implementation ────────────────────────────────────────────────────────────

function isoNow(): string {
  return new Date().toISOString();
}

export const useLanesStore = create<LanesState>()((set) => ({
  lanes: [],
  goal: '',
  isProposing: false,
  error: null,

  setGoal: (goal) => set({ goal }),

  setProposing: (value) => set({ isProposing: value }),

  setError: (error) => set({ error }),

  addLanes: (incoming) =>
    set((state) => {
      // Keep lanes that are already in a terminal or running state
      const kept = state.lanes.filter(
        (l) => l.status === 'running' || l.status === 'merged' || l.status === 'discarded',
      );

      const newLanes: Lane[] = incoming.map((lp) => {
        const lane: Lane = {
          id: lp.id,
          title: lp.title,
          description: lp.description,
          status: 'proposed' as LaneStatus,
          createdAt: isoNow(),
        };
        if (lp.worktreePath !== undefined) lane.worktreePath = lp.worktreePath;
        if (lp.branchName !== undefined) lane.branchName = lp.branchName;
        if (lp.ptyId !== undefined) lane.ptyId = lp.ptyId;
        if (lp.agentSessionId !== undefined) lane.agentSessionId = lp.agentSessionId;
        return lane;
      });

      return { lanes: [...kept, ...newLanes], error: null };
    }),

  approveLane: (id) =>
    set((state) => ({
      lanes: state.lanes.map((l) =>
        l.id === id && l.status === 'proposed' ? { ...l, status: 'approved' } : l,
      ),
    })),

  markLaneRunning: (id, { worktreePath, branchName, ptyId, agentSessionId }) =>
    set((state) => ({
      lanes: state.lanes.map((l) =>
        l.id === id && l.status === 'approved'
          ? { ...l, status: 'running', worktreePath, branchName, ptyId, agentSessionId }
          : l,
      ),
    })),

  markLaneMerged: (id) =>
    set((state) => ({
      lanes: state.lanes.map((l) =>
        l.id === id && l.status === 'running'
          ? { ...l, status: 'merged', completedAt: isoNow() }
          : l,
      ),
    })),

  discardLane: (id) =>
    set((state) => ({
      lanes: state.lanes.map((l) =>
        l.id === id && l.status !== 'merged'
          ? { ...l, status: 'discarded', completedAt: isoNow() }
          : l,
      ),
    })),

  clearAll: () => set({ lanes: [], goal: '', error: null, isProposing: false }),
}));
