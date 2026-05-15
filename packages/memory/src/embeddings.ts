/**
 * Embedder interface — anything that turns text into a float vector.
 * Concrete implementations (local ONNX model, OpenAI, etc.) come in Sprint 1.
 */
export interface Embedder {
  readonly dimensions: number;
  embed(text: string): Promise<number[]>;
}

/**
 * NullEmbedder — returns a zero vector of the configured dimensionality.
 * Useful for tests and pre-embedding scaffolding.
 */
export class NullEmbedder implements Embedder {
  readonly dimensions: number;

  constructor(dimensions = 384) {
    this.dimensions = dimensions;
  }

  async embed(_text: string): Promise<number[]> {
    return new Array<number>(this.dimensions).fill(0);
  }
}

/**
 * LocalEmbedder — placeholder for a local ONNX / Transformers.js model.
 * Throws NotImplementedError until Sprint 1.
 */
export class LocalEmbedder implements Embedder {
  readonly dimensions = 384;

  async embed(_text: string): Promise<number[]> {
    throw new Error('LocalEmbedder is not yet implemented — use NullEmbedder in tests');
  }
}
