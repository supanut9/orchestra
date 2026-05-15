# @orchestra/memory

Local-first memory store for Orchestra IDE, backed by SQLite + sqlite-vec. Provides:

- **MemoryStore** — insert, query (semantic + keyword), update, delete, list by scope
- **Embedder interface** — `NullEmbedder` (zeros) + `LocalEmbedder` stub (ONNX, Sprint 1)
- **Schema** — Zod-validated `MemoryRecord` with `project | user | session` scope
- **Migrations** — DDL strings for `memory_records` table and `vec_memory` virtual table

## Status

**pre-alpha** — Sprint 0 scaffold. DB is lazy-init; `LocalEmbedder` not implemented; sqlite-vec ANN search wired in Sprint 1.

## Usage (future)

```ts
import { MemoryStore } from '@orchestra/memory';

const store = new MemoryStore('.orchestra/memory.db');
await store.init();

const record = await store.insert({
  scope: 'project',
  kind: 'fact',
  content: 'The auth module uses JWT RS256',
  metadata: {},
});

const results = await store.query({ text: 'auth JWT', topK: 5, scope: 'project' });
```

## Development

```bash
pnpm build        # tsup ESM bundle + .d.ts
pnpm dev          # watch mode
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest run
```
