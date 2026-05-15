/**
 * SQL DDL for the memory store.
 * Applied in order by MemoryStore.init().
 */

export const CREATE_MEMORY_RECORDS = `
CREATE TABLE IF NOT EXISTS memory_records (
  id          TEXT    PRIMARY KEY,
  scope       TEXT    NOT NULL CHECK (scope IN ('project', 'user', 'session')),
  kind        TEXT    NOT NULL,
  content     TEXT    NOT NULL,
  metadata    TEXT    NOT NULL DEFAULT '{}',
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);
`;

export const CREATE_MEMORY_RECORDS_SCOPE_IDX = `
CREATE INDEX IF NOT EXISTS idx_memory_records_scope
  ON memory_records (scope);
`;

export const CREATE_MEMORY_RECORDS_KIND_IDX = `
CREATE INDEX IF NOT EXISTS idx_memory_records_kind
  ON memory_records (scope, kind);
`;

/**
 * sqlite-vec virtual table for semantic search.
 * Dimensionality is parameterised at runtime — use createVecTable(dims).
 */
export function createVecTableSQL(dimensions: number): string {
  return `
CREATE VIRTUAL TABLE IF NOT EXISTS vec_memory
  USING vec0 (
    id          TEXT PRIMARY KEY,
    embedding   FLOAT[${dimensions}]
  );
`;
}

/** All DDL statements in execution order (vec table excluded — needs runtime dims). */
export const MIGRATIONS: string[] = [
  CREATE_MEMORY_RECORDS,
  CREATE_MEMORY_RECORDS_SCOPE_IDX,
  CREATE_MEMORY_RECORDS_KIND_IDX,
];
