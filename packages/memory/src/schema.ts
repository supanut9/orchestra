import { z } from 'zod';

export const ScopeSchema = z.enum(['project', 'user', 'session']);
export type Scope = z.infer<typeof ScopeSchema>;

export const MemoryRecordSchema = z.object({
  id: z.string(),
  scope: ScopeSchema,
  /** Semantic kind, e.g. "fact", "preference", "code-snippet", "error". */
  kind: z.string(),
  content: z.string(),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.date(),
  updatedAt: z.date(),
  /** Float32 embedding vector — optional at write time; populated by Embedder. */
  embedding: z.array(z.number()).optional(),
});

export type MemoryRecord = z.infer<typeof MemoryRecordSchema>;

export type MemoryRecordPatch = Partial<
  Pick<MemoryRecord, 'content' | 'kind' | 'metadata' | 'embedding'>
>;
