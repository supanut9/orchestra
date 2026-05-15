import { describe, it, expect } from 'vitest';
import { NullEmbedder } from './index.js';
import { MIGRATIONS } from './index.js';
import { ScopeSchema } from './index.js';

describe('memory', () => {
  it('NullEmbedder returns a zero vector of correct length', async () => {
    const embedder = new NullEmbedder(128);
    const vec = await embedder.embed('hello world');
    expect(vec).toHaveLength(128);
    expect(vec.every((v) => v === 0)).toBe(true);
  });

  it('MIGRATIONS contains DDL strings', () => {
    expect(MIGRATIONS.length).toBeGreaterThan(0);
    expect(typeof MIGRATIONS[0]).toBe('string');
  });

  it('ScopeSchema validates expected values', () => {
    expect(ScopeSchema.parse('project')).toBe('project');
    expect(() => ScopeSchema.parse('workspace')).toThrow();
  });
});
