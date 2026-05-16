use std::path::Path;
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
