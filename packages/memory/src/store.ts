import { nanoid } from 'nanoid';
import type { MemoryRecord, MemoryRecordPatch, Scope } from './schema.js';
import type { Embedder } from './embeddings.js';
import { NullEmbedder } from './embeddings.js';
import { MIGRATIONS, createVecTableSQL } from './migrations.js';

export interface QueryOptions {
  text: string;
  topK?: number;
  scope?: Scope;
}

/**
 * MemoryStore — local-first SQLite + sqlite-vec memory backend.
 *
 * The constructor is cheap: it stores paths and options but does NOT open the
 * database. Call `init()` before any read/write operations. This keeps the
 * class test-friendly without requiring an actual DB file.
 */
export class MemoryStore {
  private readonly dbPath: string;
  private readonly embedder: Embedder;

  private db: any | null = null;

  constructor(dbPath: string, embedder?: Embedder) {
    this.dbPath = dbPath;
    this.embedder = embedder ?? new NullEmbedder();
  }

  /**
   * Open the database, load sqlite-vec extension, and run migrations.
   * Idempotent — safe to call multiple times.
   */
  async init(): Promise<void> {
    if (this.db) return;

    // Dynamic import keeps better-sqlite3 (native addon) out of the type graph
    // at import time; tests can mock this path.
    const Database = (await import('better-sqlite3')).default;

    const sqliteVec = (await import('sqlite-vec')) as any;

    this.db = new Database(this.dbPath);
    sqliteVec.load(this.db);

    for (const sql of MIGRATIONS) {
      this.db.exec(sql);
    }
    this.db.exec(createVecTableSQL(this.embedder.dimensions));
  }

  private assertInit(): void {
    if (!this.db) {
      throw new Error('MemoryStore not initialised — call init() first');
    }
  }

  /** Insert a new memory record. Returns the stored record with generated id/timestamps. */
  async insert(
    record: Omit<MemoryRecord, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<MemoryRecord> {
    this.assertInit();
    const now = new Date();
    const full: MemoryRecord = {
      ...record,
      id: nanoid(),
      createdAt: now,
      updatedAt: now,
    };

    const embedding = record.embedding ?? (await this.embedder.embed(record.content));

    this.db
      .prepare(
        `INSERT INTO memory_records (id, scope, kind, content, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        full.id,
        full.scope,
        full.kind,
        full.content,
        JSON.stringify(full.metadata),
        full.createdAt.toISOString(),
        full.updatedAt.toISOString(),
      );

    this.db
      .prepare(`INSERT INTO vec_memory (id, embedding) VALUES (?, ?)`)
      .run(full.id, new Float32Array(embedding));

    return { ...full, embedding };
  }

  /**
   * Semantic + keyword query.
   * Stub: in Sprint 1 this will use sqlite-vec ANN search.
   */
  async query(opts: QueryOptions): Promise<MemoryRecord[]> {
    this.assertInit();
    const topK = opts.topK ?? 10;

    let sql = `SELECT * FROM memory_records`;
    const params: unknown[] = [];

    if (opts.scope) {
      sql += ` WHERE scope = ?`;
      params.push(opts.scope);
    }

    sql += ` ORDER BY updated_at DESC LIMIT ?`;
    params.push(topK);

    const rows: any[] = this.db.prepare(sql).all(...params);
    return rows.map(rowToRecord);
  }

  /** Patch an existing record by id. */
  async update(id: string, patch: MemoryRecordPatch): Promise<void> {
    this.assertInit();
    const existing: MemoryRecord | undefined = this.db
      .prepare(`SELECT * FROM memory_records WHERE id = ?`)
      .get(id);

    if (!existing) throw new Error(`MemoryRecord not found: ${id}`);

    const now = new Date();
    const content = patch.content ?? existing.content;
    const kind = patch.kind ?? existing.kind;
    const metadata = patch.metadata ?? JSON.parse(existing.metadata as unknown as string);

    this.db
      .prepare(
        `UPDATE memory_records SET kind = ?, content = ?, metadata = ?, updated_at = ? WHERE id = ?`,
      )
      .run(kind, content, JSON.stringify(metadata), now.toISOString(), id);

    if (patch.embedding) {
      this.db
        .prepare(`UPDATE vec_memory SET embedding = ? WHERE id = ?`)
        .run(new Float32Array(patch.embedding), id);
    } else if (patch.content) {
      const newEmbedding = await this.embedder.embed(content);
      this.db
        .prepare(`UPDATE vec_memory SET embedding = ? WHERE id = ?`)
        .run(new Float32Array(newEmbedding), id);
    }
  }

  /** Delete a record by id. */
  async delete(id: string): Promise<void> {
    this.assertInit();
    this.db.prepare(`DELETE FROM vec_memory WHERE id = ?`).run(id);
    this.db.prepare(`DELETE FROM memory_records WHERE id = ?`).run(id);
  }

  /** List all records for a scope. */
  async list(scope: Scope): Promise<MemoryRecord[]> {
    this.assertInit();

    const rows: any[] = this.db
      .prepare(`SELECT * FROM memory_records WHERE scope = ? ORDER BY updated_at DESC`)
      .all(scope);
    return rows.map(rowToRecord);
  }
}

function rowToRecord(row: any): MemoryRecord {
  return {
    id: row.id,
    scope: row.scope,
    kind: row.kind,
    content: row.content,
    metadata: JSON.parse(row.metadata ?? '{}'),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
