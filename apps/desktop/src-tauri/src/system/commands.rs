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

/// True when the CLI has written its actual credentials file into the
/// account directory. Each provider stores tokens differently and several
/// of them (notably codex) create scratch subdirs like `log/`, `tmp/`,
/// and `memories/` on startup — long before OAuth completes — so a naive
/// "is the directory non-empty" check returns false-positives.
///
/// We match against a per-provider allowlist of filenames; any one of
/// them existing as a *regular file* (not a directory) is treated as
/// "login complete".
#[tauri::command]
pub fn cli_account_has_credentials(
    account_id: String,
    provider_id: String,
) -> Result<bool, String> {
    let dir = accounts_root()?.join(safe_dirname(&account_id));
    if !dir.exists() {
        return Ok(false);
    }
    let candidates: &[&str] = match provider_id.as_str() {
        // Codex (OpenAI) writes `auth.json` after OAuth — pre-login it
        // only creates `log/`, `tmp/`, `memories/` directories.
        "codex-cli" => &["auth.json"],
        // Claude Code writes `.credentials.json` into its config dir.
        "claude-cli" => &[".credentials.json", "credentials.json"],
        // Gemini CLI writes `oauth_creds.json` (newer) or `credentials.json`.
        "gemini-cli" => &["oauth_creds.json", "credentials.json"],
        // Unknown provider: fall back to "any regular file present".
        _ => {
            let entries =
                fs::read_dir(&dir).map_err(|e| format!("read account dir: {e}"))?;
            for entry in entries.flatten() {
                if entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
                    return Ok(true);
                }
            }
            return Ok(false);
        }
    };
    for name in candidates {
        let candidate = dir.join(name);
        if candidate.is_file() {
            return Ok(true);
        }
    }
    Ok(false)
}
