// Service parser — detects runnable services in a workspace directory.
//
// Priority order (first match wins for naming conflicts):
//   1. `orchestra.yaml`        — explicit user config; highest priority
//   2. `docker-compose.yml`    — or `docker-compose.yaml` / `compose.yml` / `compose.yaml`
//   3. `Procfile`              — Heroku-style process manifest
//   4. `package.json` scripts  — dev / start / serve / dev:* / serve:*
//   5. `Makefile` targets      — run / dev / serve / start / watch / air / run:* / dev:*
//   6. `go.mod` + `main.go`    — single Go binary at the repo root → `go run .`
//
// Each discovered service maps to a `DetectedService` which the command layer
// turns into a PTY spawn request.

use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};

// ── Source tag ────────────────────────────────────────────────────────────────

/// Indicates which configuration file a service was discovered from.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ServiceSource {
    DockerCompose,
    Procfile,
    PackageJsonScript,
    OrchestraYaml,
    Makefile,
    GoModule,
}

// ── DetectedService ───────────────────────────────────────────────────────────

/// A single runnable service as discovered by `detect_services`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedService {
    /// Human-readable service name (from config file key / script name).
    pub name: String,
    /// Which file the service was found in.
    pub source: ServiceSource,
    /// Argv to pass to PTY spawn.  `command[0]` is the binary.
    pub command: Vec<String>,
    /// Working directory for the process.
    pub cwd: PathBuf,
    /// Optional environment variable overrides from the config file.
    pub env: HashMap<String, String>,
}

// ── Top-level detector ────────────────────────────────────────────────────────

/// Detect all runnable services inside `workspace_path`.
///
/// Checks for `orchestra.yaml`, `docker-compose.yml` (and variants),
/// `Procfile`, and `package.json` in that priority order.  All discovered
/// services from all sources are combined into the returned vector; if the
/// same name appears in multiple files, the highest-priority source wins
/// (lower sources are skipped for that name).
pub fn detect_services(workspace_path: &Path) -> Vec<DetectedService> {
    let mut seen_names: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut results: Vec<DetectedService> = Vec::new();

    // Helper closure: add services while de-duplicating by name.
    let mut add_services = |services: Vec<DetectedService>| {
        for svc in services {
            if seen_names.insert(svc.name.clone()) {
                results.push(svc);
            }
        }
    };

    // 1. orchestra.yaml — highest priority
    let orchestra_yaml = workspace_path.join("orchestra.yaml");
    if orchestra_yaml.exists() {
        add_services(parse_orchestra_yaml(&orchestra_yaml, workspace_path));
    }

    // 2. docker-compose files
    for candidate in &[
        "docker-compose.yml",
        "docker-compose.yaml",
        "compose.yml",
        "compose.yaml",
    ] {
        let path = workspace_path.join(candidate);
        if path.exists() {
            add_services(parse_docker_compose(&path, workspace_path));
            break; // Stop at the first match.
        }
    }

    // 3. Procfile
    let procfile = workspace_path.join("Procfile");
    if procfile.exists() {
        add_services(parse_procfile(&procfile, workspace_path));
    }

    // 4. package.json scripts
    let package_json = workspace_path.join("package.json");
    if package_json.exists() {
        add_services(parse_package_json_scripts(&package_json, workspace_path));
    }

    // 5. Makefile targets (run / dev / serve / start / watch / air / run:* / dev:*)
    for makefile in &["Makefile", "makefile", "GNUmakefile"] {
        let path = workspace_path.join(makefile);
        if path.exists() {
            add_services(parse_makefile(&path, workspace_path));
            break;
        }
    }

    // 6. `go.mod` + `main.go` at the repo root → a single `go run .` service.
    if workspace_path.join("go.mod").exists() && workspace_path.join("main.go").exists() {
        let name = workspace_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("go-service")
            .to_string();
        add_services(vec![DetectedService {
            name,
            source: ServiceSource::GoModule,
            command: vec!["go".to_string(), "run".to_string(), ".".to_string()],
            cwd: workspace_path.to_path_buf(),
            env: HashMap::new(),
        }]);
    }

    results
}

// ── orchestra.yaml parser ─────────────────────────────────────────────────────

/// Minimal schema for `orchestra.yaml`:
/// ```yaml
/// services:
///   - name: api
///     command: ["cargo", "run"]
///     cwd: ./backend          # optional; defaults to workspace root
///     env:                    # optional
///       DATABASE_URL: postgres://localhost/dev
/// ```
#[derive(Debug, Deserialize)]
struct OrchestraYaml {
    services: Vec<OrchestraService>,
}

#[derive(Debug, Deserialize)]
struct OrchestraService {
    name: String,
    command: Vec<String>,
    cwd: Option<String>,
    #[serde(default)]
    env: HashMap<String, String>,
}

/// Parse `orchestra.yaml` and return a `DetectedService` per entry.
fn parse_orchestra_yaml(path: &Path, workspace_root: &Path) -> Vec<DetectedService> {
    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!("Failed to read orchestra.yaml: {e}");
            return vec![];
        }
    };

    let manifest: OrchestraYaml = match serde_yaml::from_str(&content) {
        Ok(m) => m,
        Err(e) => {
            tracing::warn!("Failed to parse orchestra.yaml: {e}");
            return vec![];
        }
    };

    manifest
        .services
        .into_iter()
        .filter(|s| !s.name.is_empty() && !s.command.is_empty())
        .map(|s| {
            let cwd = s
                .cwd
                .as_deref()
                .map(|rel| workspace_root.join(rel))
                .unwrap_or_else(|| workspace_root.to_path_buf());

            DetectedService {
                name: s.name,
                source: ServiceSource::OrchestraYaml,
                command: s.command,
                cwd,
                env: s.env,
            }
        })
        .collect()
}

// ── docker-compose parser ─────────────────────────────────────────────────────

/// Minimal docker-compose schema — only the `services` map is needed.
///
/// We don't try to replicate the full compose spec; we just need the service
/// names so we can run `docker compose up <name>`.
#[derive(Debug, Deserialize)]
struct ComposeFile {
    services: Option<HashMap<String, serde_yaml::Value>>,
}

/// Parse a docker-compose file and return one `DetectedService` per top-level
/// service that runs `docker compose up <name>`.
fn parse_docker_compose(path: &Path, workspace_root: &Path) -> Vec<DetectedService> {
    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!("Failed to read {}: {e}", path.display());
            return vec![];
        }
    };

    let compose: ComposeFile = match serde_yaml::from_str(&content) {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!("Failed to parse {}: {e}", path.display());
            return vec![];
        }
    };

    let services = match compose.services {
        Some(s) => s,
        None => return vec![],
    };

    services
        .into_keys()
        .map(|name| DetectedService {
            name: name.clone(),
            source: ServiceSource::DockerCompose,
            command: vec![
                "docker".to_string(),
                "compose".to_string(),
                "up".to_string(),
                name,
            ],
            cwd: workspace_root.to_path_buf(),
            env: HashMap::new(),
        })
        .collect()
}

// ── Procfile parser ───────────────────────────────────────────────────────────

/// Parse a Heroku-style `Procfile`.
///
/// Format (one service per line):
/// ```
/// web: node server.js
/// worker: celery -A tasks worker
/// ```
///
/// Lines beginning with `#` are treated as comments and skipped.
/// The command string is split with `shell-words` to respect quoting.
fn parse_procfile(path: &Path, workspace_root: &Path) -> Vec<DetectedService> {
    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!("Failed to read Procfile: {e}");
            return vec![];
        }
    };

    let mut services = Vec::new();

    for line in content.lines() {
        let line = line.trim();

        // Skip empty lines and comments.
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        // Split on the first ':'.
        let Some((name_part, cmd_part)) = line.split_once(':') else {
            tracing::warn!("Skipping malformed Procfile line: {line}");
            continue;
        };

        let name = name_part.trim().to_string();
        let cmd_str = cmd_part.trim();

        if name.is_empty() || cmd_str.is_empty() {
            continue;
        }

        // Use shell-words to handle quoted arguments properly.
        let command = match shell_words::split(cmd_str) {
            Ok(words) if !words.is_empty() => words,
            Ok(_) => continue,
            Err(e) => {
                tracing::warn!("Could not parse Procfile command '{cmd_str}': {e}");
                // Fallback: wrap in a shell.
                vec!["sh".to_string(), "-c".to_string(), cmd_str.to_string()]
            }
        };

        services.push(DetectedService {
            name,
            source: ServiceSource::Procfile,
            command,
            cwd: workspace_root.to_path_buf(),
            env: HashMap::new(),
        });
    }

    services
}

// ── package.json script parser ────────────────────────────────────────────────

/// Minimal package.json schema — only the `scripts` section is needed.
#[derive(Debug, Deserialize)]
struct PackageJson {
    scripts: Option<HashMap<String, String>>,
}

/// Allowlisted script name patterns that are considered "runnable services".
///
/// Matches: `dev`, `start`, `serve`, and any names beginning with `dev:` or
/// `serve:` (e.g. `dev:api`, `serve:docs`).
fn is_service_script(name: &str) -> bool {
    matches!(name, "dev" | "start" | "serve")
        || name.starts_with("dev:")
        || name.starts_with("serve:")
}

/// Parse `package.json` and return a `DetectedService` for each matching
/// script name.  Commands use `pnpm run <script>` (Orchestra's package
/// manager).
fn parse_package_json_scripts(path: &Path, workspace_root: &Path) -> Vec<DetectedService> {
    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!("Failed to read package.json: {e}");
            return vec![];
        }
    };

    let pkg: PackageJson = match serde_json::from_str(&content) {
        Ok(p) => p,
        Err(e) => {
            tracing::warn!("Failed to parse package.json: {e}");
            return vec![];
        }
    };

    let scripts = match pkg.scripts {
        Some(s) => s,
        None => return vec![],
    };

    scripts
        .into_iter()
        .filter(|(name, _)| is_service_script(name))
        .map(|(name, _script_body)| DetectedService {
            name: name.clone(),
            source: ServiceSource::PackageJsonScript,
            command: vec!["pnpm".to_string(), "run".to_string(), name],
            cwd: workspace_root.to_path_buf(),
            env: HashMap::new(),
        })
        .collect()
}

// ── Makefile parser ───────────────────────────────────────────────────────────

/// Allowlist of Makefile target names treated as runnable services.
/// Matches: `run`, `dev`, `serve`, `start`, `watch`, `air`, plus anything
/// beginning with `run:`, `dev:`, `serve:`, `start:` (e.g. `dev-api`,
/// `run.web`).
fn is_service_target(name: &str) -> bool {
    let bare = matches!(name, "run" | "dev" | "serve" | "start" | "watch" | "air");
    if bare {
        return true;
    }
    let prefixes = ["run:", "dev:", "serve:", "start:", "run-", "dev-", "serve-", "start-"];
    prefixes.iter().any(|p| name.starts_with(p))
}

/// Parse a Makefile and return a `DetectedService` for each matching target.
///
/// The detector is intentionally simple: it scans top-of-line `<name>:` patterns
/// (real target declarations) and skips:
///   - lines beginning with whitespace (recipe bodies)
///   - lines beginning with `#` (comments)
///   - PHONY/variable declarations (`.PHONY:`, `name = value`)
///   - pattern rules (`%`) and double-colon rules (handled by `find(':')`)
///   - targets containing `/`, `$`, or backslash (typically file paths)
///
/// Commands are always emitted as `make <target>`.
fn parse_makefile(path: &Path, workspace_root: &Path) -> Vec<DetectedService> {
    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!("Failed to read Makefile: {e}");
            return vec![];
        }
    };

    let mut services = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();

    for line in content.lines() {
        // Skip indented lines (recipe bodies) and comments and blank lines.
        if line.starts_with('\t') || line.starts_with(' ') {
            continue;
        }
        let trimmed = line.trim_end();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        // Variable assignments like `NAME = value` or `NAME := value` are not targets.
        if let Some(eq_idx) = trimmed.find('=') {
            if let Some(colon_idx) = trimmed.find(':') {
                if eq_idx < colon_idx || trimmed.as_bytes().get(colon_idx + 1) == Some(&b'=') {
                    continue;
                }
            } else {
                continue;
            }
        }

        // Target declaration: `<name>:` or `<name>: <prerequisites>`.
        let Some(colon_idx) = trimmed.find(':') else {
            continue;
        };
        let name_part = trimmed[..colon_idx].trim();
        if name_part.is_empty() {
            continue;
        }

        // Skip special / pattern / multi-target rules.
        if name_part.starts_with('.')
            || name_part.contains(' ')
            || name_part.contains('%')
            || name_part.contains('/')
            || name_part.contains('$')
            || name_part.contains('\\')
        {
            continue;
        }

        if !is_service_target(name_part) {
            continue;
        }

        if !seen.insert(name_part.to_string()) {
            continue;
        }

        services.push(DetectedService {
            name: name_part.to_string(),
            source: ServiceSource::Makefile,
            command: vec!["make".to_string(), name_part.to_string()],
            cwd: workspace_root.to_path_buf(),
            env: HashMap::new(),
        });
    }

    services
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::TempDir;

    fn tmpdir() -> TempDir {
        tempfile::tempdir().expect("create tempdir")
    }

    fn write_file(dir: &Path, name: &str, content: &str) {
        let mut f = fs::File::create(dir.join(name)).unwrap();
        f.write_all(content.as_bytes()).unwrap();
    }

    #[test]
    fn test_procfile_basic() {
        let dir = tmpdir();
        write_file(
            dir.path(),
            "Procfile",
            "web: node server.js\nworker: celery -A tasks worker\n",
        );

        let services = detect_services(dir.path());
        assert_eq!(services.len(), 2);
        assert_eq!(services[0].name, "web");
        assert_eq!(services[0].command, vec!["node", "server.js"]);
        assert_eq!(services[1].name, "worker");
        assert_eq!(services[1].source, ServiceSource::Procfile);
    }

    #[test]
    fn test_procfile_ignores_comments() {
        let dir = tmpdir();
        write_file(dir.path(), "Procfile", "# comment\nweb: node app.js\n");

        let services = detect_services(dir.path());
        assert_eq!(services.len(), 1);
        assert_eq!(services[0].name, "web");
    }

    #[test]
    fn test_package_json_scripts() {
        let dir = tmpdir();
        write_file(
            dir.path(),
            "package.json",
            r#"{"scripts":{"dev":"vite","build":"tsc","dev:api":"nodemon api.js","start":"node dist/index.js"}}"#,
        );

        let services = detect_services(dir.path());
        let names: Vec<_> = services.iter().map(|s| s.name.as_str()).collect();
        assert!(names.contains(&"dev"));
        assert!(names.contains(&"start"));
        assert!(names.contains(&"dev:api"));
        assert!(!names.contains(&"build")); // build is not a service script
        for svc in &services {
            assert_eq!(svc.command[0], "pnpm");
            assert_eq!(svc.command[1], "run");
        }
    }

    #[test]
    fn test_docker_compose() {
        let dir = tmpdir();
        write_file(
            dir.path(),
            "docker-compose.yml",
            "services:\n  api:\n    image: node:20\n  db:\n    image: postgres:16\n",
        );

        let services = detect_services(dir.path());
        let names: Vec<_> = services.iter().map(|s| s.name.as_str()).collect();
        assert!(names.contains(&"api"));
        assert!(names.contains(&"db"));
        for svc in &services {
            assert_eq!(svc.command[..3], ["docker", "compose", "up"]);
        }
    }

    #[test]
    fn test_orchestra_yaml_priority() {
        let dir = tmpdir();
        // Both orchestra.yaml and Procfile define a service named "api".
        // orchestra.yaml wins.
        write_file(
            dir.path(),
            "orchestra.yaml",
            "services:\n  - name: api\n    command: [\"cargo\", \"run\"]\n",
        );
        write_file(dir.path(), "Procfile", "api: node server.js\n");

        let services = detect_services(dir.path());
        let api = services.iter().find(|s| s.name == "api").unwrap();
        assert_eq!(api.source, ServiceSource::OrchestraYaml);
        assert_eq!(api.command, vec!["cargo", "run"]);
    }
}
