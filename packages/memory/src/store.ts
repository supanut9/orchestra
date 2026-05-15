import { nanoid } from 'nanoid';
import type { MemoryRecord, MemoryRecordPatch, Scope } from './schema.js';
import type { Embedder } from './embeddings.js';
import { NullEmbedder } from './embeddings.js';
import { MIGRATIONS, createVecTableSQL } from './migrations.js';

export interface QueryOptions {
  text?: string;
  topK?: number;
  scope?: Scope;
}

export interface NewMemoryRecord {
  scope: Scope;
  kind: string;
  content: string;
  metadata?: Record<string, unknown>;
  embedding?: number[];
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
  /** Whether the sqlite-vec extension was successfully loaded. */
  private vecAvailable = false;

  constructor(dbPath: string, embedder?: Embedder) {
    this.dbPath = dbPath;
    this.embedder = embedder ?? new NullEmbedder();
  }

  /**
   * Open the database, attempt to load sqlite-vec extension, and run migrations.
   * Idempotent — safe to call multiple times.
   * If sqlite-vec is unavailable the store still works without semantic search.
   */
  async init(): Promise<void> {
    if (this.db) return;

    // Dynamic import keeps better-sqlite3 (native addon) out of the type graph
    // at import time; tests can mock this path.
    const Database = (await import('better-sqlite3')).default;

    this.db = new Database(this.dbPath);

    // Attempt to load sqlite-vec; degrade gracefully if unavailable.
    try {
      const sqliteVec = (await import('sqlite-vec')) as any;
      sqliteVec.load(this.db);
      this.vecAvailable = true;
    } catch (err) {
      console.warn(
        '[MemoryStore] sqlite-vec extension not available — semantic search disabled.',
        err instanceof Error ? err.message : err,
      );
      this.vecAvailable = false;
    }

    for (const sql of MIGRATIONS) {
      this.db.exec(sql);
    }

    if (this.vecAvailable) {
      try {
        this.db.exec(createVecTableSQL(this.embedder.dimensions));
      } catch (err) {
        console.warn('[MemoryStore] Could not create vec_memory table:', err);
        this.vecAvailable = false;
      }
    }
  }

  private assertInit(): void {
    if (!this.db) {
      throw new Error('MemoryStore not initialised — call init() first');
    }
  }

  /** Insert a new memory record. Returns the stored record with generated id/timestamps. */
  async insert(record: NewMemoryRecord): Promise<MemoryRecord> {
    this.assertInit();
    const now = new Date();
    const full: MemoryRecord = {
      scope: record.scope,
      kind: record.kind,
      content: record.content,
      metadata: record.metadata ?? {},
      id: nanoid(),
      createdAt: now,
      updatedAt: now,
    };

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

    if (this.vecAvailable) {
      try {
        const embedding = record.embedding ?? (await this.embedder.embed(record.content));
        this.db
          .prepare(`INSERT INTO vec_memory (id, embedding) VALUES (?, ?)`)
          .run(full.id, new Float32Array(embedding));
        return { ...full, embedding };
      } catch (err) {
        console.warn('[MemoryStore] Failed to insert embedding:', err);
      }
    }

    return full;
  }

  /**
   * Semantic + keyword query.
   * Uses vec ANN search when sqlite-vec is available and text is provided.
   * Falls back to LIKE %text% on content column.
   */
  async query(opts: QueryOptions): Promise<MemoryRecord[]> {
    this.assertInit();
    const topK = opts.topK ?? 10;

    // If vec is available and we have a search text, try ANN.
    if (this.vecAvailable && opts.text) {
      try {
        const queryVec = await this.embedder.embed(opts.text);
        let sql = `
          SELECT mr.*
          FROM memory_records mr
          INNER JOIN (
            SELECT id, distance
            FROM vec_memory
            WHERE embedding MATCH ?
            ORDER BY distance
            LIMIT ?
          ) vm ON mr.id = vm.id
        `;
        const params: unknown[] = [new Float32Array(queryVec), topK];

        if (opts.scope) {
          sql = `
            SELECT mr.*
            FROM memory_records mr
            INNER JOIN (
              SELECT id, distance
              FROM vec_memory
              WHERE embedding MATCH ?
              ORDER BY distance
              LIMIT ?
            ) vm ON mr.id = vm.id
            WHERE mr.scope = ?
          `;
          params.push(opts.scope);
        }

        const rows: any[] = this.db.prepare(sql).all(...params);
        return rows.map(rowToRecord);
      } catch (err) {
        console.warn('[MemoryStore] Vec ANN query failed, falling back to LIKE search:', err);
      }
    }

    // Keyword / scope fallback
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (opts.scope) {
      conditions.push('scope = ?');
      params.push(opts.scope);
    }

    if (opts.text) {
      conditions.push('content LIKE ?');
      params.push(`%${opts.text}%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT * FROM memory_records ${where} ORDER BY updated_at DESC LIMIT ?`;
    params.push(topK);

    const rows: any[] = this.db.prepare(sql).all(...params);
    return rows.map(rowToRecord);
  }

  /** List all records for a scope, newest first. */
  async list(scope: Scope): Promise<MemoryRecord[]> {
    this.assertInit();

    const rows: any[] = this.db
      .prepare(`SELECT * FROM memory_records WHERE scope = ? ORDER BY updated_at DESC`)
      .all(scope);
    return rows.map(rowToRecord);
  }

  /** Patch an existing record by id. Returns the updated record. */
  async update(id: string, patch: MemoryRecordPatch): Promise<MemoryRecord> {
    this.assertInit();
    const existingRow: any = this.db.prepare(`SELECT * FROM memory_records WHERE id = ?`).get(id);

    if (!existingRow) throw new Error(`MemoryRecord not found: ${id}`);

    const existing = rowToRecord(existingRow);
    const now = new Date();
    const content = patch.content ?? existing.content;
    const kind = patch.kind ?? existing.kind;
    const metadata = patch.metadata ?? existing.metadata;

    this.db
      .prepare(
        `UPDATE memory_records SET kind = ?, content = ?, metadata = ?, updated_at = ? WHERE id = ?`,
      )
      .run(kind, content, JSON.stringify(metadata), now.toISOString(), id);

    if (this.vecAvailable) {
      try {
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
      } catch (err) {
        console.warn('[MemoryStore] Failed to update embedding:', err);
      }
    }

    return { ...existing, kind, content, metadata, updatedAt: now };
  }

  /** Delete a record by id. */
  async delete(id: string): Promise<void> {
    this.assertInit();
    if (this.vecAvailable) {
      try {
        this.db.prepare(`DELETE FROM vec_memory WHERE id = ?`).run(id);
      } catch {
        // vec table may not have the record; ignore
      }
    }
    this.db.prepare(`DELETE FROM memory_records WHERE id = ?`).run(id);
  }

  /** Close the database connection. Safe to call multiple times. */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.vecAvailable = false;
    }
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
