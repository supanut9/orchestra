//! File-system watcher — wraps `notify::RecommendedWatcher` with debouncing.
//!
//! Debounce strategy: we collect events in a 100 ms window then emit a single
//! `fs.change` Tauri event per unique path per batch.  This avoids flooding the
//! frontend when editors write files (which can fire create + modify + rename
//! in rapid succession).

use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};

use notify::{
    recommended_watcher, Event, EventHandler, EventKind, RecursiveMode, Result as NotifyResult,
    Watcher,
};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// Payload emitted as `fs.change` — matches `FsChangePayload` in the TS contract.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsChangePayload {
    pub kind: FsChangeKind,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub new_path: Option<String>,
}

/// Matches `FsChangePayload.kind` in `events.ts`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FsChangeKind {
    Create,
    Modify,
    Remove,
    Rename,
}

/// Internal debounce accumulator shared between the notify callback thread and
/// the debounce flush thread.
#[derive(Default)]
struct Debouncer {
    /// path → (kind, optional new_path)
    pending: HashMap<PathBuf, (FsChangeKind, Option<String>)>,
}

/// Build a `RecommendedWatcher` that watches `root_path` and emits debounced
/// `fs.change` events via the supplied `AppHandle`.
pub fn build_watcher(
    root_path: PathBuf,
    app_handle: AppHandle,
) -> notify::Result<notify::RecommendedWatcher> {
    let debouncer: Arc<Mutex<Debouncer>> = Arc::new(Mutex::new(Debouncer::default()));

    // Clone for the flush thread.
    let flush_debouncer = Arc::clone(&debouncer);
    let flush_app = app_handle.clone();

    // Spawn the flush thread — drains the pending map every 100 ms.
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(Duration::from_millis(100));

            let events: Vec<FsChangePayload> = {
                let mut guard = flush_debouncer.lock().unwrap();
                if guard.pending.is_empty() {
                    continue;
                }
                guard
                    .pending
                    .drain()
                    .map(|(path, (kind, new_path))| FsChangePayload {
                        kind,
                        path: path.to_string_lossy().into_owned(),
                        new_path,
                    })
                    .collect()
            };

            for payload in events {
                let _ = flush_app.emit("fs.change", &payload);
            }
        }
    });

    // Build the notify watcher — the callback accumulates events into the
    // debouncer map (latest kind wins for the same path within a window).
    let handler = DebouncingHandler {
        debouncer: Arc::clone(&debouncer),
    };

    let mut watcher = recommended_watcher(handler)?;
    watcher.watch(&root_path, RecursiveMode::Recursive)?;
    Ok(watcher)
}

/// `EventHandler` implementation that funnels raw notify events into the
/// debounce accumulator.
struct DebouncingHandler {
    debouncer: Arc<Mutex<Debouncer>>,
}

impl EventHandler for DebouncingHandler {
    fn handle_event(&mut self, event: NotifyResult<Event>) {
        let event = match event {
            Ok(e) => e,
            Err(_) => return,
        };

        let kind = match &event.kind {
            EventKind::Create(_) => FsChangeKind::Create,
            EventKind::Modify(_) => FsChangeKind::Modify,
            EventKind::Remove(_) => FsChangeKind::Remove,
            EventKind::Access(_) => return, // not interesting
            EventKind::Other => return,
            EventKind::Any => return,
        };

        // For renames notify provides two paths: [from, to].
        let is_rename = matches!(kind, FsChangeKind::Modify)
            && matches!(
                &event.kind,
                EventKind::Modify(notify::event::ModifyKind::Name(_))
            );

        if is_rename && event.paths.len() >= 2 {
            let from = event.paths[0].clone();
            let to = event.paths[1].to_string_lossy().into_owned();
            let mut guard = self.debouncer.lock().unwrap();
            guard
                .pending
                .insert(from, (FsChangeKind::Rename, Some(to)));
            return;
        }

        let mut guard = self.debouncer.lock().unwrap();
        for path in &event.paths {
            guard
                .pending
                .entry(path.clone())
                .or_insert((kind.clone(), None));
        }
    }
}
