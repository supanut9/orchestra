import { describe, it, expect } from 'vitest';
import { defaultModels, estimateCost } from './index.js';

describe('ai-runtime', () => {
  it('exports defaultModels with expected providers', () => {
    expect(defaultModels).toHaveProperty('anthropic');
    expect(defaultModels).toHaveProperty('openai');
    expect(defaultModels).toHaveProperty('google');
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
});
