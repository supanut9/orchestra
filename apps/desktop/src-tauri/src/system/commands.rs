use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Probe the user's login shell to locate a binary by name.
///
/// Tries (in order):
///   1. `command -v <name>` in `$SHELL -lc` (sources the user's rc files)
///   2. Common Homebrew + system locations as a fallback
///   3. Returns Ok(None) if nothing is found
///
/// Never errors on "not found" — only on shell-spawn failures.
#[tauri::command]
pub fn detect_binary(name: String) -> Result<Option<String>, String> {
    // 1. Try the user's login shell with sourced rc files.
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
    if let Ok(output) = Command::new(&shell)
        .arg("-lc")
        .arg(format!("command -v {}", shell_escape(&name)))
        .output()
    {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() && Path::new(&path).exists() {
                return Ok(Some(path));
            }
        }
    }

    // 2. Fallback: probe common locations directly.
    let candidates = [
        format!("/opt/homebrew/bin/{name}"),
        format!("/usr/local/bin/{name}"),
        format!("/usr/bin/{name}"),
        format!("/bin/{name}"),
    ];
    for candidate in &candidates {
        if Path::new(candidate).exists() {
            return Ok(Some(candidate.clone()));
        }
    }

    Ok(None)
}

/// Minimal shell-escape — wraps in single quotes if non-trivial.
fn shell_escape(s: &str) -> String {
    if s.chars()
        .all(|c| c.is_alphanumeric() || c == '-' || c == '_' || c == '.')
    {
        s.to_string()
    } else {
        format!("'{}'", s.replace('\'', "'\\''"))
    }
}

// ─── Per-account CLI credential directories ────────────────────────────────

/// Resolve the per-account credential directory root.
/// Defaults to `~/.orchestra/cli-accounts/`.
fn accounts_root() -> Result<PathBuf, String> {
    let home = std::env::var("HOME").map_err(|e| format!("HOME not set: {e}"))?;
    let root = PathBuf::from(home).join(".orchestra").join("cli-accounts");
    fs::create_dir_all(&root).map_err(|e| format!("create accounts root: {e}"))?;
    Ok(root)
}

/// Sanitise an account id into a safe directory name.
fn safe_dirname(id: &str) -> String {
    id.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect()
}

/// Ensure the credential directory for an account exists. Returns the path.
/// Empty dir at first — populated when the user completes the CLI login flow.
#[tauri::command]
pub fn cli_account_create_dir(account_id: String) -> Result<String, String> {
    let dir = accounts_root()?.join(safe_dirname(&account_id));
    fs::create_dir_all(&dir).map_err(|e| format!("create account dir: {e}"))?;
    Ok(dir.to_string_lossy().into_owned())
}

/// Recursively remove an account's credential directory.
#[tauri::command]
pub fn cli_account_remove_dir(account_id: String) -> Result<(), String> {
    let dir = accounts_root()?.join(safe_dirname(&account_id));
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| format!("remove account dir: {e}"))?;
    }
    Ok(())
}

/// True if the credential directory contains anything (a heuristic for
/// "user has completed login"). The CLI itself decides what files it writes;
/// any non-empty content counts.
#[tauri::command]
pub fn cli_account_has_credentials(account_id: String) -> Result<bool, String> {
    let dir = accounts_root()?.join(safe_dirname(&account_id));
    if !dir.exists() {
        return Ok(false);
    }
    let entries = fs::read_dir(&dir).map_err(|e| format!("read account dir: {e}"))?;
    Ok(entries.count() > 0)
}
