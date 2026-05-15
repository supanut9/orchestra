/**
 * provider-registry.ts
 *
 * Thin browser-side wrapper that:
 * 1. Converts the settings-store ProviderConfig into Vercel AI SDK LanguageModel
 *    instances via @orchestra/ai-runtime (dynamically imported so native deps
 *    don't break the renderer bundle at import time).
 * 2. Caches instantiated models by a stable JSON key of the config.
 * 3. Exposes `streamMessage` and `testProviderConnection` so feature components
 *    never need to import `ai` or `@orchestra/ai-runtime` directly.
 *
 * Caching strategy:
 *   Key = JSON.stringify(config) — stable while config values are unchanged.
 *   When the user updates an API key or model, the key changes and a fresh
 *   LanguageModel is instantiated. The cache is a plain Map with at most ~5
 *   entries (one per provider), so no eviction is needed.
 */

import type { ProviderConfig } from '@/stores/settings';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LanguageModel = any;

// Map<configKey, LanguageModel>
const cache = new Map<string, LanguageModel>();

function configKey(config: ProviderConfig): string {
  return JSON.stringify(config);
}

/**
 * Return a cached (or freshly created) LanguageModel for the given config.
 * Throws if @orchestra/ai-runtime is unavailable or config is invalid.
 */
export async function getProviderModel(config: ProviderConfig): Promise<LanguageModel> {
  const key = configKey(config);
  const cached = cache.get(key);
  if (cached) return cached;

  const { createProvider } = await import('@orchestra/ai-runtime');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = createProvider(config as any);
  cache.set(key, model);
  return model;
}

/**
 * Stream a multi-turn conversation message through the given provider config.
 * Calls onChunk for each text delta; respects the AbortSignal.
 *
 * This is the single streaming entry-point for feature components —
 * they never need to import `ai` or `@orchestra/ai-runtime` directly.
 */
export async function streamMessage(opts: {
  config: ProviderConfig;
  messages: { role: 'user' | 'assistant'; content: string }[];
  onChunk: (chunk: string) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const model = await getProviderModel(opts.config);
  // @orchestra/ai-runtime/stream re-exports streamText from the ai package,
  // keeping `ai` out of apps/desktop's direct dependency list.
  const { streamText } = await import('@orchestra/ai-runtime/stream');
  const result = streamText({
    model,
    messages: opts.messages,
    ...(opts.signal ? { abortSignal: opts.signal } : {}),
  });
  for await (const chunk of result.textStream) {
    if (opts.signal?.aborted) break;
    opts.onChunk(chunk);
  }
}

/**
 * Test a provider config by streaming a one-shot "Say OK" prompt.
 * Returns the trimmed response text or throws on failure.
 */
export async function testProviderConnection(config: ProviderConfig): Promise<string> {
  const model = await getProviderModel(config);
  const { streamText } = await import('@orchestra/ai-runtime/stream');
  const result = streamText({
    model,
    prompt: 'Reply with exactly one word: OK',
    maxTokens: 10,
  });
  let text = '';
  for await (const chunk of result.textStream) {
    text += chunk;
  }
  return text.trim();
}

/** Evict the cached model for a specific config (e.g. after API key update). */
export function evictProvider(config: ProviderConfig): void {
  cache.delete(configKey(config));
}

/** Clear the entire model cache. */
export function clearProviderCache(): void {
  cache.clear();
}
