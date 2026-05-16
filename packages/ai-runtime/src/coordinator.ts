import { generateObject } from 'ai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import type { LanePlan } from './types.js';

// ── Zod schemas for structured output ─────────────────────────────────────────

const LanePlanSchema = z.object({
  title: z.string().describe('Short title for the work lane (≤60 chars)'),
  description: z
    .string()
    .describe('What this lane accomplishes and the key steps involved (1–3 sentences)'),
  dependsOn: z
    .array(z.string())
    .optional()
    .default([])
    .describe('Titles of lanes that must finish before this lane can start'),
});

const DecomposeOutputSchema = z.object({
  lanes: z
    .array(LanePlanSchema)
    .min(1)
    .max(8)
    .describe('Ordered list of parallel (or lightly sequenced) work lanes'),
});

// ── Public types ───────────────────────────────────────────────────────────────

export interface CoordinatorOptions {
  /**
   * A Vercel AI SDK LanguageModel instance (created via `createProvider`).
   * When omitted the coordinator returns mock lanes — offline-friendly and
   * useful for UI development without an API key.
   */
  model?: LanguageModel;

  /**
   * Hard cap on the number of lanes the LLM may propose.
   * Defaults to 4. Values above 8 are clamped to 8 by the schema.
   */
  maxLanes?: number;
}

// ── Coordinator ────────────────────────────────────────────────────────────────

/**
 * Coordinator decomposes a high-level engineering goal into parallel lane
 * plans using a structured-output LLM call.
 *
 * **Current implementation** — single `generateObject` call (decompose step).
 *
 * **Sprint 4 next step** — replace this with a proper
 * `@langchain/langgraph` StateGraph with three nodes:
 *   1. `decompose`  — initial lane proposal (this call)
 *   2. `critique`   — second LLM pass validates dependency graph, detects
 *                     missing test / docs lanes, rewrites bad titles
 *   3. `refine`     — merge critique feedback and emit final lanes
 *
 * The multi-node graph is deliberately deferred until the single-call path
 * is validated in production; LangGraph state management adds complexity that
 * is only worth paying when the extra passes measurably improve quality.
 */
export class Coordinator {
  constructor(private readonly opts: CoordinatorOptions = {}) {}

  /**
   * Decompose `goal` into an array of `LanePlan` objects.
   *
   * Falls back to mock lanes when no model is configured so the desktop UI
   * remains usable without an API key (e.g. CI, offline demo).
   */
  async decomposeTask(goal: string): Promise<LanePlan[]> {
    if (!this.opts.model) {
      return mockLanes(goal);
    }

    const maxLanes = this.opts.maxLanes ?? 4;

    const { object } = await generateObject({
      model: this.opts.model,
      schema: DecomposeOutputSchema,
      prompt: buildDecomposerPrompt(goal, maxLanes),
    });

    return object.lanes.map((l) => ({
      id: nanoid(),
      title: l.title,
      description: l.description,
      dependsOn: l.dependsOn ?? [],
    }));
  }
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function buildDecomposerPrompt(goal: string, maxLanes: number): string {
  return `You are the Coordinator for Orchestra IDE — an AI-native desktop IDE that runs software engineering tasks in parallel "lanes", each with its own git worktree, AI agent session, and terminal.

Your job is to decompose the software engineering goal below into ${maxLanes} or fewer parallel work lanes.

Rules:
- Each lane must be independently executable (own git worktree, own agent).
- Keep lanes focused — one clear concern per lane.
- Prefer parallel execution over sequential chains; only add a dependsOn when a lane genuinely cannot start until another finishes.
- Use "dependsOn" sparingly. Most lanes should have an empty dependsOn array.
- Title: ≤ 60 characters, imperative mood ("Add auth middleware", not "Authentication").
- Description: 1–3 sentences describing what the lane accomplishes and the key files or systems it touches.
- Include a dedicated testing / QA lane when the goal involves production code changes.
- Do NOT exceed ${maxLanes} lanes.

Goal: ${goal}

Respond with JSON only — no markdown fences, no prose before or after the JSON.`;
}

/**
 * Offline / no-model fallback — returns three generic lanes so the Lane Board
 * UI renders without requiring an API key.
 */
function mockLanes(goal: string): LanePlan[] {
  return [
    {
      id: nanoid(),
      title: 'Research & design',
      description: `Analyse requirements for: ${goal}. Produce a design document and identify key interfaces before implementation begins.`,
      dependsOn: [],
    },
    {
      id: nanoid(),
      title: 'Implementation',
      description:
        'Write the core code changes in a dedicated worktree, following the design produced in the Research lane.',
      dependsOn: [],
    },
    {
      id: nanoid(),
      title: 'Tests & docs',
      description:
        'Write unit and integration tests, update README and changelog to reflect the new behaviour.',
      dependsOn: [],
    },
  ];
}
