import type { ProviderId } from './providers.js';
import type { Cost } from './types.js';

/**
 * Per-million-token rates in USD cents.
 * Stub values — update with real pricing before Sprint 1.
 */
const RATE_TABLE: Record<string, { input: number; output: number }> = {
  'anthropic/claude-sonnet-4-5': { input: 300, output: 1500 },
  'anthropic/claude-3-haiku-20240307': { input: 25, output: 125 },
  'openai/gpt-4o': { input: 250, output: 1000 },
  'openai/gpt-4o-mini': { input: 15, output: 60 },
  'google/gemini-2.0-flash': { input: 10, output: 40 },
};

/**
 * Estimate cost for a given usage.
 * Returns zeroed Cost when the model is not in the rate table.
 */
export function estimateCost(
  usage: Pick<Cost, 'inputTokens' | 'outputTokens'>,
  providerId: ProviderId,
  model: string,
): Cost {
  const key = `${providerId}/${model}`;
  const rates = RATE_TABLE[key];

  const inputCents = rates ? (usage.inputTokens / 1_000_000) * rates.input : 0;
  const outputCents = rates ? (usage.outputTokens / 1_000_000) * rates.output : 0;

  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.inputTokens + usage.outputTokens,
    estimatedUsdCents: inputCents + outputCents,
  };
}
