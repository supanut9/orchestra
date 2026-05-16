//! Persistent memory store backed by SQLite via `rusqlite`.
//!
//! Each workspace gets its own database file at
//! `<workspace>/.orchestra/memory.sqlite`.  The store is cheap to clone because
//! the underlying connection is wrapped in `Arc<Mutex<…>>`.

use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;

use super::schema::SCHEMA;

// ── Public types ─────────────────────────────────────────────────────────────

/// A fully persisted memory record returned from the store.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryRecord {
    pub id: String,
    pub scope: String,
    pub kind: String,
    pub content: String,
    pub metadata: JsonValue,
    pub created_at: String,
    pub updated_at: String,
}

/// Input required to create a new memory record.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewMemoryRecord {
    pub scope: String,
    pub kind: String,
    pub content: String,
    pub metadata: Option<JsonValue>,
}

/// Optional patch fields for updating an existing record.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MemoryPatch {
    pub content: Option<String>,
    pub kind: Option<String>,
    pub metadata: Option<JsonValue>,
}

/// Options for the `query` operation.
///
/// `text` is matched with `LIKE %…%` against the `content` column.
/// sqlite-vec ANN search is deferred to Sprint 4.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MemoryQueryOpts {
    pub text: Option<String>,
    pub scope: Option<String>,
    pub top_k: Option<u32>,
}

// ── Store ─────────────────────────────────────────────────────────────────────

/// Thread-safe SQLite-backed memory store.
#[derive(Clone)]
pub struct MemoryStore {
    conn: Arc<Mutex<Connection>>,
}

impl MemoryStore {
    /// Open (or create) the SQLite database at `db_path`, run the DDL schema,
    /// and return a ready-to-use store.
    pub fn open(db_path: &Path) -> Result<Self> {
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("create db dir {}", parent.display()))?;
        }

        let conn = Connection::open(db_path)
            .with_context(|| format!("open sqlite db {}", db_path.display()))?;

        conn.execute_batch(SCHEMA).context("apply memory schema")?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    /// Insert a new memory record and return the stored record.
    pub fn insert(&self, record: NewMemoryRecord) -> Result<MemoryRecord> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = iso_now();
        let metadata_str = serde_json::to_string(
            &record.metadata.unwrap_or(JsonValue::Object(Default::default())),
        )?;

        let conn = self.conn.lock().expect("memory store mutex poisoned");
        conn.execute(
            "INSERT INTO memory_records (id, scope, kind, content, metadata, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                id,
                record.scope,
                record.kind,
                record.content,
                metadata_str,
                now,
                now,
            ],
        )
        .context("insert memory record")?;

        Ok(MemoryRecord {
            id,
            scope: record.scope,
            kind: record.kind,
            content: record.content,
            metadata: serde_json::from_str(&metadata_str)?,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    /// Fetch a single record by id.
    pub fn get(&self, id: &str) -> Result<Option<MemoryRecord>> {
        let conn = self.conn.lock().expect("memory store mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT id, scope, kind, content, metadata, created_at, updated_at
             FROM memory_records WHERE id = ?1",
        )?;
        let mut rows = stmt.query(rusqlite::params![id])?;
        if let Some(row) = rows.next()? {
            Ok(Some(row_to_record(row)?))
        } else {
            Ok(None)
        }
    }

    /// Query records using LIKE-based text search and/or scope filter.
    ///
    /// Note: sqlite-vec ANN search is deferred to Sprint 4; this uses
    /// `LIKE '%text%'` on the `content` column which is adequate for Sprint 3.
    pub fn query(&self, opts: MemoryQueryOpts) -> Result<Vec<MemoryRecord>> {
        let top_k = opts.top_k.unwrap_or(50) as i64;
        let conn = self.conn.lock().expect("memory store mutex poisoned");

        // Build owned strings for the SQL fragments before borrowing them as
        // &str slices — avoids "borrowed value does not live long enough" if we
        // tried to build them inline.
        let scope_fragment = opts.scope.as_ref().map(|_| "scope = ?1".to_owned());
        let text_fragment = opts.text.as_ref().map(|_| {
            // param index shifts if scope is also present
            let idx = if opts.scope.is_some() { 2 } else { 1 };
            format!("content LIKE ?{idx}")
        });

        let conditions: Vec<&str> = [scope_fragment.as_deref(), text_fragment.as_deref()]
            .into_iter()
            .flatten()
            .collect();

        let where_clause = if conditions.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", conditions.join(" AND "))
        };

        // The LIMIT placeholder always comes last.
        let limit_idx = conditions.len() + 1;
        let sql = format!(
            "SELECT id, scope, kind, content, metadata, created_at, updated_at
             FROM memory_records {where_clause}
             ORDER BY updated_at DESC
             LIMIT ?{limit_idx}"
        );

        // Build the parameter list in the same order as the placeholders.
        let text_like = opts.text.as_ref().map(|t| format!("%{}%", t));

        let mut stmt = conn.prepare(&sql)?;

        // We use a macro-generated params list so rusqlite can type-erase correctly.
        let rows: Vec<MemoryRecord> = match (&opts.scope, &text_like) {
            (Some(scope), Some(like)) => stmt
                .query_map(rusqlite::params![scope, like, top_k], row_to_record)?
                .collect::<rusqlite::Result<Vec<_>>>()?,
            (Some(scope), None) => stmt
                .query_map(rusqlite::params![scope, top_k], row_to_record)?
                .collect::<rusqlite::Result<Vec<_>>>()?,
            (None, Some(like)) => stmt
                .query_map(rusqlite::params![like, top_k], row_to_record)?
                .collect::<rusqlite::Result<Vec<_>>>()?,
            (None, None) => stmt
                .query_map(rusqlite::params![top_k], row_to_record)?
                .collect::<rusqlite::Result<Vec<_>>>()?,
        };

        Ok(rows)
    }

    /// List all records for a given scope, newest first.
    pub fn list(&self, scope: &str) -> Result<Vec<MemoryRecord>> {
        let conn = self.conn.lock().expect("memory store mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT id, scope, kind, content, metadata, created_at, updated_at
             FROM memory_records WHERE scope = ?1
             ORDER BY updated_at DESC",
        )?;
        let rows = stmt.query_map(rusqlite::params![scope], row_to_record)?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .context("list memory records")
    }

    /// Apply a partial patch to an existing record and return the updated record.
    pub fn update(&self, id: &str, patch: MemoryPatch) -> Result<MemoryRecord> {
        // Fetch the current record first so we can merge fields.
        let existing = self
            .get(id)?
            .ok_or_else(|| anyhow::anyhow!("memory record not found: {id}"))?;

        let now = iso_now();
        let new_content = patch.content.unwrap_or(existing.content.clone());
        let new_kind = patch.kind.unwrap_or(existing.kind.clone());
        let new_metadata = patch.metadata.unwrap_or(existing.metadata.clone());
        let metadata_str = serde_json::to_string(&new_metadata)?;

        let conn = self.conn.lock().expect("memory store mutex poisoned");
        conn.execute(
            "UPDATE memory_records SET kind = ?1, content = ?2, metadata = ?3, updated_at = ?4
             WHERE id = ?5",
            rusqlite::params![new_kind, new_content, metadata_str, now, id],
        )
        .context("update memory record")?;

        Ok(MemoryRecord {
            id: existing.id,
            scope: existing.scope,
            kind: new_kind,
            content: new_content,
            metadata: new_metadata,
            created_at: existing.created_at,
            updated_at: now,
        })
    }

    /// Delete a record by id.
    pub fn delete(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().expect("memory store mutex poisoned");
        conn.execute(
            "DELETE FROM memory_records WHERE id = ?1",
            rusqlite::params![id],
        )
        .context("delete memory record")?;
        Ok(())
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn row_to_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<MemoryRecord> {
    let metadata_str: String = row.get(4)?;
    let metadata: JsonValue =
        serde_json::from_str(&metadata_str).unwrap_or(JsonValue::Object(Default::default()));
    Ok(MemoryRecord {
        id: row.get(0)?,
        scope: row.get(1)?,
        kind: row.get(2)?,
        content: row.get(3)?,
        metadata,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

/// Returns the current time as an RFC 3339-ish ISO-8601 string using only
/// `std` (no `chrono` required).
fn iso_now() -> String {
    // SystemTime gives us seconds + nanoseconds since UNIX_EPOCH.
    let dur = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = dur.as_secs();
    // Convert Unix timestamp to a calendar representation (UTC).
    // We use a simple integer decomposition; accuracy to the second is fine.
    let (year, month, day, hour, min, sec) = unix_to_ymd_hms(secs);
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{min:02}:{sec:02}Z")
}

/// Decompose a Unix epoch (seconds) into (year, month, day, hour, min, sec) UTC.
fn unix_to_ymd_hms(mut secs: u64) -> (u64, u64, u64, u64, u64, u64) {
    let sec = secs % 60;
    secs /= 60;
    let min = secs % 60;
    secs /= 60;
    let hour = secs % 24;
    let mut days = secs / 24;

    // Gregorian calendar decomposition (days since 1970-01-01)
    let mut year = 1970u64;
    loop {
        let leap = is_leap(year);
        let days_in_year = if leap { 366 } else { 365 };
        if days < days_in_year {
            break;
        }
        days -= days_in_year;
        year += 1;
    }
    let leap = is_leap(year);
    let month_days: [u64; 12] = if leap {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    let mut month = 1u64;
    for &md in &month_days {
        if days < md {
            break;
        }
        days -= md;
        month += 1;
    }
    let day = days + 1;
    (year, month, day, hour, min, sec)
}

fn is_leap(y: u64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}
