/// Git worktree commands for Lane E — parallel task lanes (Sprint 2).
///
/// All commands take `repo_path: String` as their first argument so they are
/// stateless and can be called from any lane without shared mutable state.
use std::fs;
use std::path::{Path, PathBuf};

use git2::{DiffDelta, DiffHunk as Git2DiffHunk, DiffLine as Git2DiffLine, Repository, Status};
use serde::{Deserialize, Serialize};

// ── Return types ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusInfo {
    pub branch: String,
    pub head: String,
    pub is_clean: bool,
    pub modified: Vec<String>,
    pub untracked: Vec<String>,
    pub staged: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeInfo {
    pub id: String,
    pub path: String,
    pub branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffLineEntry {
    #[serde(rename = "type")]
    pub line_type: String, // "add" | "del" | "context"
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffHunkEntry {
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    pub lines: Vec<DiffLineEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub path: String,
    pub status: String, // "added" | "modified" | "deleted" | "renamed"
    pub additions: u32,
    pub deletions: u32,
    pub hunks: Vec<DiffHunkEntry>,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn worktree_path(repo_path: &str, lane_id: &str) -> PathBuf {
    Path::new(repo_path)
        .join(".orchestra")
        .join("worktrees")
        .join(lane_id)
}

fn map_err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Return branch, HEAD SHA, and working-tree status for `repo_path`.
#[tauri::command]
pub fn git_status(repo_path: String) -> Result<GitStatusInfo, String> {
    let repo = Repository::open(&repo_path).map_err(map_err)?;

    // HEAD reference → branch name + short SHA
    let head = repo.head().map_err(map_err)?;
    let branch = head
        .shorthand()
        .unwrap_or("HEAD")
        .to_string();

    let head_oid = head.target().map(|o| o.to_string()).unwrap_or_default();
    // Show first 8 hex chars as a short SHA
    let head_short = head_oid.chars().take(8).collect::<String>();

    let mut opts = git2::StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_ignored(false);

    let statuses = repo.statuses(Some(&mut opts)).map_err(map_err)?;

    let mut modified = Vec::new();
    let mut untracked = Vec::new();
    let mut staged = Vec::new();

    for entry in statuses.iter() {
        let path = entry
            .path()
            .unwrap_or("")
            .to_string();
        let s = entry.status();

        if s.contains(Status::WT_NEW) {
            untracked.push(path.clone());
        }
        if s.intersects(
            Status::WT_MODIFIED
                | Status::WT_DELETED
                | Status::WT_RENAMED
                | Status::WT_TYPECHANGE,
        ) {
            modified.push(path.clone());
        }
        if s.intersects(
            Status::INDEX_NEW
                | Status::INDEX_MODIFIED
                | Status::INDEX_DELETED
                | Status::INDEX_RENAMED
                | Status::INDEX_TYPECHANGE,
        ) {
            staged.push(path.clone());
        }
    }

    let is_clean = modified.is_empty() && untracked.is_empty() && staged.is_empty();

    Ok(GitStatusInfo {
        branch,
        head: head_short,
        is_clean,
        modified,
        untracked,
        staged,
    })
}

/// Create a new git worktree at `.orchestra/worktrees/<lane_id>` on a new
/// branch named `branch_name` pointing at HEAD.
///
/// Equivalent to: `git worktree add -b <branch_name> <worktree_path> HEAD`
#[tauri::command]
pub fn git_worktree_add(
    repo_path: String,
    lane_id: String,
    branch_name: String,
) -> Result<WorktreeInfo, String> {
    let repo = Repository::open(&repo_path).map_err(map_err)?;

    let wt_path = worktree_path(&repo_path, &lane_id);

    // Create parent dirs if they don't exist
    if let Some(parent) = wt_path.parent() {
        fs::create_dir_all(parent).map_err(map_err)?;
    }

    // Resolve HEAD commit so we can create the branch there
    let head = repo.head().map_err(map_err)?;
    let head_commit = head
        .peel_to_commit()
        .map_err(map_err)?;

    // Create the branch (fail if it already exists — guard against duplicates)
    let branch = repo
        .branch(&branch_name, &head_commit, false)
        .map_err(|e| format!("Failed to create branch '{}': {}", branch_name, e))?;

    let branch_ref = branch.into_reference();
    let ref_name = branch_ref
        .name()
        .ok_or("branch ref has no name")?
        .to_string();

    // Add the worktree
    let mut wt_opts = git2::WorktreeAddOptions::new();
    wt_opts.reference(Some(&branch_ref));

    repo.worktree(&lane_id, &wt_path, Some(&wt_opts))
        .map_err(|e| format!("Failed to add worktree: {}", e))?;

    Ok(WorktreeInfo {
        id: lane_id,
        path: wt_path
            .to_string_lossy()
            .into_owned(),
        branch: ref_name,
    })
}

/// Remove the worktree for `lane_id`: prune the git metadata and delete the
/// directory on disk.
#[tauri::command]
pub fn git_worktree_remove(repo_path: String, lane_id: String) -> Result<(), String> {
    let repo = Repository::open(&repo_path).map_err(map_err)?;

    let wt_path = worktree_path(&repo_path, &lane_id);

    // Prune the git worktree entry
    match repo.find_worktree(&lane_id) {
        Ok(wt) => {
            let mut prune_opts = git2::WorktreePruneOptions::new();
            prune_opts.valid(true); // prune even if the directory still exists
            wt.prune(Some(&mut prune_opts))
                .map_err(|e| format!("Failed to prune worktree: {}", e))?;
        }
        Err(_) => {
            // Worktree may already be pruned; continue to directory cleanup
        }
    }

    // Recursively remove the directory
    if wt_path.exists() {
        fs::remove_dir_all(&wt_path)
            .map_err(|e| format!("Failed to remove worktree directory: {}", e))?;
    }

    Ok(())
}

/// List all worktrees registered in this repository.
#[tauri::command]
pub fn git_worktree_list(repo_path: String) -> Result<Vec<WorktreeInfo>, String> {
    let repo = Repository::open(&repo_path).map_err(map_err)?;

    let names = repo.worktrees().map_err(map_err)?;
    let mut result = Vec::new();

    for name in names.iter().flatten() {
        if let Ok(wt) = repo.find_worktree(name) {
            let path = wt
                .path()
                .to_string_lossy()
                .into_owned();

            // Derive branch from worktree HEAD
            let branch = if let Ok(wt_repo) = Repository::open(wt.path()) {
                wt_repo
                    .head()
                    .ok()
                    .and_then(|h| h.shorthand().map(|s| s.to_string()))
                    .unwrap_or_default()
            } else {
                String::new()
            };

            result.push(WorktreeInfo {
                id: name.to_string(),
                path,
                branch,
            });
        }
    }

    Ok(result)
}

/// Return the diff between the worktree branch for `lane_id` and its merge
/// base with the current HEAD of the main repository.
///
/// File-level additions/deletions and full hunk data are included so the UI
/// can render both a compact summary and a full diff viewer.
#[tauri::command]
pub fn git_worktree_diff(repo_path: String, lane_id: String) -> Result<Vec<FileDiff>, String> {
    let wt_path = worktree_path(&repo_path, &lane_id);
    let wt_repo = Repository::open(&wt_path).map_err(map_err)?;

    // Diff the working tree against HEAD of the worktree branch
    let head = wt_repo.head().map_err(map_err)?;
    let head_tree = head
        .peel_to_tree()
        .map_err(map_err)?;

    let mut diff_opts = git2::DiffOptions::new();
    diff_opts.ignore_whitespace_eol(false);

    let diff = wt_repo
        .diff_tree_to_workdir_with_index(Some(&head_tree), Some(&mut diff_opts))
        .map_err(map_err)?;

    // Collect per-file info with hunk detail
    struct FileAccumulator {
        path: String,
        status: String,
        additions: u32,
        deletions: u32,
        hunks: Vec<DiffHunkEntry>,
        current_hunk: Option<DiffHunkEntry>,
    }

    use std::cell::RefCell;
    let files: RefCell<Vec<FileAccumulator>> = RefCell::new(Vec::new());

    diff.foreach(
        // file callback
        &mut |delta: DiffDelta<'_>, _progress: f32| -> bool {
            let path = delta
                .new_file()
                .path()
                .or_else(|| delta.old_file().path())
                .map(|p| p.to_string_lossy().into_owned())
                .unwrap_or_default();

            let status = match delta.status() {
                git2::Delta::Added => "added",
                git2::Delta::Deleted => "deleted",
                git2::Delta::Modified => "modified",
                git2::Delta::Renamed => "renamed",
                _ => "modified",
            }
            .to_string();

            files.borrow_mut().push(FileAccumulator {
                path,
                status,
                additions: 0,
                deletions: 0,
                hunks: Vec::new(),
                current_hunk: None,
            });
            true
        },
        None, // binary callback
        // hunk callback
        Some(&mut |_delta: DiffDelta<'_>, hunk: Git2DiffHunk<'_>| -> bool {
            let entry = DiffHunkEntry {
                old_start: hunk.old_start(),
                old_lines: hunk.old_lines(),
                new_start: hunk.new_start(),
                new_lines: hunk.new_lines(),
                lines: Vec::new(),
            };
            if let Some(acc) = files.borrow_mut().last_mut() {
                if let Some(prev) = acc.current_hunk.take() {
                    acc.hunks.push(prev);
                }
                acc.current_hunk = Some(entry);
            }
            true
        }),
        // line callback
        Some(&mut |_delta: DiffDelta<'_>, _hunk: Option<Git2DiffHunk<'_>>, line: Git2DiffLine<'_>| -> bool {
            let (line_type, is_add, is_del) = match line.origin() {
                '+' => ("add", true, false),
                '-' => ("del", false, true),
                _ => ("context", false, false),
            };

            let text = std::str::from_utf8(line.content())
                .unwrap_or("")
                .trim_end_matches('\n')
                .to_string();

            let entry = DiffLineEntry {
                line_type: line_type.to_string(),
                text,
            };

            if let Some(acc) = files.borrow_mut().last_mut() {
                if is_add {
                    acc.additions += 1;
                }
                if is_del {
                    acc.deletions += 1;
                }
                if let Some(hunk) = acc.current_hunk.as_mut() {
                    hunk.lines.push(entry);
                }
            }
            true
        }),
    )
    .map_err(map_err)?;

    // Flush final pending hunk for each file
    let mut result = Vec::new();
    for mut acc in files.into_inner() {
        if let Some(hunk) = acc.current_hunk.take() {
            acc.hunks.push(hunk);
        }
        result.push(FileDiff {
            path: acc.path,
            status: acc.status,
            additions: acc.additions,
            deletions: acc.deletions,
            hunks: acc.hunks,
        });
    }

    Ok(result)
}

/// Merge the worktree branch for `lane_id` into `target_branch` (typically
/// "main").  The merge is performed inside the main repository — not the
/// worktree — so that the working tree of the main checkout is updated.
///
/// On merge conflict this command returns an error; conflict resolution UI is
/// planned for Sprint 3.
#[tauri::command]
pub fn git_worktree_merge(
    repo_path: String,
    lane_id: String,
    target_branch: String,
) -> Result<(), String> {
    let repo = Repository::open(&repo_path).map_err(map_err)?;

    // Find the branch created for this lane (stored as "orchestra/<lane_id>")
    let lane_branch_name = format!("orchestra/{}", lane_id);

    let lane_ref = repo
        .find_branch(&lane_branch_name, git2::BranchType::Local)
        .map_err(|_| format!("Branch '{}' not found", lane_branch_name))?;

    let lane_commit = lane_ref
        .into_reference()
        .peel_to_commit()
        .map_err(map_err)?;

    // Checkout target branch
    let target_ref = repo
        .find_branch(&target_branch, git2::BranchType::Local)
        .map_err(|_| format!("Target branch '{}' not found", target_branch))?;

    let target_obj = target_ref
        .into_reference()
        .peel(git2::ObjectType::Commit)
        .map_err(map_err)?;

    repo.checkout_tree(&target_obj, None).map_err(map_err)?;
    repo.set_head(&format!("refs/heads/{}", target_branch))
        .map_err(map_err)?;

    // Perform the merge
    let annotated = repo
        .find_annotated_commit(lane_commit.id())
        .map_err(map_err)?;

    let (merge_analysis, _) = repo.merge_analysis(&[&annotated]).map_err(map_err)?;

    if merge_analysis.is_up_to_date() {
        return Ok(());
    }

    if merge_analysis.is_fast_forward() {
        // Fast-forward: just advance the ref
        let mut target_ref_mut = repo
            .find_reference(&format!("refs/heads/{}", target_branch))
            .map_err(map_err)?;
        target_ref_mut
            .set_target(lane_commit.id(), "fast-forward merge from orchestra lane")
            .map_err(map_err)?;

        repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))
            .map_err(map_err)?;
    } else if merge_analysis.is_normal() {
        // Normal merge
        let mut merge_opts = git2::MergeOptions::new();
        merge_opts.fail_on_conflict(true);

        repo.merge(&[&annotated], Some(&mut merge_opts), None)
            .map_err(|e| {
                // Clean up merge state so the repo isn't left mid-merge
                let _ = repo.cleanup_state();
                format!("Merge conflict — Sprint 3 will add conflict resolution UI: {}", e)
            })?;

        // Commit the merge
        let sig = repo
            .signature()
            .unwrap_or_else(|_| {
                git2::Signature::now("Orchestra", "orchestra@orchestra.dev")
                    .expect("valid signature")
            });

        let target_commit = repo
            .head()
            .and_then(|r| r.peel_to_commit())
            .map_err(map_err)?;

        let tree_oid = repo.index().and_then(|mut i| i.write_tree()).map_err(map_err)?;
        let tree = repo.find_tree(tree_oid).map_err(map_err)?;

        let message = format!(
            "Merge orchestra/{} into {}\n\nMerged via Orchestra lane manager",
            lane_id, target_branch
        );

        repo.commit(
            Some(&format!("refs/heads/{}", target_branch)),
            &sig,
            &sig,
            &message,
            &tree,
            &[&target_commit, &lane_commit],
        )
        .map_err(map_err)?;

        repo.cleanup_state().map_err(map_err)?;
    } else {
        return Err(format!(
            "Cannot merge: merge analysis flags = {:?}",
            merge_analysis
        ));
    }

    Ok(())
}
