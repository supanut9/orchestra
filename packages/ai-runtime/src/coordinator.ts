import { nanoid } from 'nanoid';
import type { LanePlan } from './types.js';

/**
 * Coordinator decomposes a high-level goal into parallel lane plans.
 *
 * Sprint 0 scaffold: returns mock lanes. Sprint 1 will wire this to
 * @langchain/langgraph StateGraph (decompose → dispatch → verify) with
 * real LLM-backed nodes via the provider registry.
 */
export class Coordinator {
  async decomposeTask(goal: string): Promise<LanePlan[]> {
    return [
      {
        id: nanoid(),
        title: 'Research & design',
        description: `Analyse requirements for: ${goal}`,
        dependsOn: [],
      },
      {
        id: nanoid(),
        title: 'Implementation',
        description: 'Write the code changes',
        dependsOn: [],
      },
      {
        id: nanoid(),
        title: 'Tests & docs',
        description: 'Write tests and update documentation',
        dependsOn: [],
      },
    ];
  }
}
