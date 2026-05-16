/// SQL DDL executed once when a database is first opened.
pub const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS memory_records (
  id          TEXT PRIMARY KEY,
  scope       TEXT NOT NULL,
  kind        TEXT NOT NULL,
  content     TEXT NOT NULL,
  metadata    TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memory_scope ON memory_records (scope);
CREATE INDEX IF NOT EXISTS idx_memory_kind  ON memory_records (kind);
";
