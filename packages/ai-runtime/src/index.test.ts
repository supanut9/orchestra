import { describe, it, expect } from 'vitest';
import { defaultModels, providerModels, listAvailableProviders, estimateCost } from './index.js';

describe('ai-runtime', () => {
  it('exports defaultModels with expected providers', () => {
    expect(defaultModels).toHaveProperty('anthropic');
    expect(defaultModels).toHaveProperty('openai');
    expect(defaultModels).toHaveProperty('google');
    expect(defaultModels).toHaveProperty('ollama');
    expect(defaultModels).toHaveProperty('openrouter');
  });

  it('providerModels includes multiple models per provider', () => {
    for (const id of ['anthropic', 'openai', 'google', 'ollama', 'openrouter'] as const) {
      expect(providerModels[id].length).toBeGreaterThan(0);
    }
  });

  it('listAvailableProviders returns 5 providers', () => {
    const providers = listAvailableProviders();
    expect(providers).toHaveLength(5);
    const ids = providers.map((p) => p.id);
    expect(ids).toContain('anthropic');
    expect(ids).toContain('openai');
    expect(ids).toContain('google');
    expect(ids).toContain('ollama');
    expect(ids).toContain('openrouter');
  });

  it('all providers support streaming', () => {
    const providers = listAvailableProviders();
    for (const p of providers) {
      expect(p.supportsStreaming).toBe(true);
    }
  });

  it('estimateCost returns zeroed cost for unknown model', () => {
    const cost = estimateCost(
      { inputTokens: 1000, outputTokens: 500 },
      'anthropic',
      'unknown-model',
    );
    expect(cost.estimatedUsdCents).toBe(0);
    expect(cost.totalTokens).toBe(1500);
  });

  it('estimateCost returns non-zero for known model', () => {
    const cost = estimateCost(
      { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      'anthropic',
      'claude-sonnet-4-7',
    );
    // 300 cents input + 1500 cents output = 1800 cents
    expect(cost.estimatedUsdCents).toBe(1800);
  });

  it('ollama models have zero cost (free local inference)', () => {
    const cost = estimateCost(
      { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      'ollama',
      'llama3.2',
    );
    expect(cost.estimatedUsdCents).toBe(0);
  });
});
