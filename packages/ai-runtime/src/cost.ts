import type { ProviderId } from './providers.js';
import type { Cost } from './types.js';

/**
 * Per-million-token rates in USD cents (input / output).
 * Rates as of May 2026 — best estimates; update when providers change pricing.
 *
 * Format: `<providerId>/<modelId>` → { input, output } in USD cents per 1M tokens.
 */
const RATE_TABLE: Record<string, { input: number; output: number }> = {
  // ── Anthropic ───────────────────────────────────────────────────────────────
  'anthropic/claude-opus-4-5': { input: 1500, output: 7500 },
  'anthropic/claude-sonnet-4-7': { input: 300, output: 1500 },
  'anthropic/claude-sonnet-4-5': { input: 300, output: 1500 },
  'anthropic/claude-haiku-4-5': { input: 80, output: 400 },
  'anthropic/claude-3-5-haiku-20241022': { input: 80, output: 400 },

  // ── OpenAI ──────────────────────────────────────────────────────────────────
  'openai/gpt-4o': { input: 250, output: 1000 },
  'openai/gpt-4o-mini': { input: 15, output: 60 },
  'openai/gpt-4-turbo': { input: 1000, output: 3000 },
  'openai/o1': { input: 1500, output: 6000 },
  'openai/o1-mini': { input: 300, output: 1200 },
  'openai/o3-mini': { input: 110, output: 440 },

  // ── Google ──────────────────────────────────────────────────────────────────
  'google/gemini-2.5-pro': { input: 125, output: 1000 },
  'google/gemini-2.5-flash': { input: 15, output: 60 },
  'google/gemini-2.0-flash': { input: 10, output: 40 },
  'google/gemini-1.5-pro': { input: 125, output: 500 },
  'google/gemini-1.5-flash': { input: 7, output: 30 },

  // ── OpenRouter (pass-through pricing — approximate) ─────────────────────────
  'openrouter/anthropic/claude-sonnet-4-7': { input: 300, output: 1500 },
  'openrouter/openai/gpt-4o': { input: 250, output: 1000 },
  'openrouter/google/gemini-2.5-pro': { input: 125, output: 1000 },
  'openrouter/meta-llama/llama-3.3-70b-instruct': { input: 60, output: 80 },
  'openrouter/mistralai/mistral-large': { input: 200, output: 600 },

  // ── Ollama — free (local) ────────────────────────────────────────────────────
  'ollama/llama3.2': { input: 0, output: 0 },
  'ollama/llama3.1': { input: 0, output: 0 },
  'ollama/llama3': { input: 0, output: 0 },
  'ollama/mistral': { input: 0, output: 0 },
  'ollama/codellama': { input: 0, output: 0 },
  'ollama/qwen2.5-coder': { input: 0, output: 0 },
};

/**
 * Estimate cost for a given usage.
 * Returns a zeroed Cost when the model is not in the rate table.
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
