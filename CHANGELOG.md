# Changelog

All notable changes to Orchestra will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.13] — 2026-05-17

### Fixed

- **Terminal didn't accept typed input.** xterm.js only forwards
  keystrokes when its hidden textarea has focus, but nothing in the
  Terminal component ever called `term.focus()`. As a result, opening
  or switching to a terminal tab left focus on whichever element the
  user touched last (sidebar, editor, settings panel), and typing
  silently fell through. The terminal now grabs focus on mount, on
  tab activation, and on any mouse-down inside its area.

## [0.1.12] — 2026-05-17

### Added

- **Per-row "Sign in" button on every CLI account.** Hover any account
  row and click the login icon to (re-)trigger the browser OAuth flow
  against that account's existing credential directory. Previously the
  only way to log in was during the initial Add — if the v0.1.10 broken
  codex flag had killed your first login, or a token expired, there was
  no way to retry without removing and re-adding the account. Failed
  logins now also render a prominent yellow "Sign in" button inline.

## [0.1.11] — 2026-05-17

### Fixed

- **Codex CLI login still wouldn't start in v0.1.10.** The
  `--skip-git-repo-check` flag I added doesn't exist in codex 0.130+ —
  codex bailed immediately with
  `error: unexpected argument '--skip-git-repo-check' found`, never
  printing the OAuth URL Orchestra was waiting for. Removed the flag;
  `codex login` (no extra args) from $HOME does not trigger the
  trusted-dir check, only interactive runs do.
- **"✓ Connected" appearing instantly on every Codex login.** The
  credential poll was a naive "is the dir non-empty" check, but codex
  creates `log/`, `tmp/`, and `memories/` subdirectories on startup
  (before OAuth completes), so the poll matched on the very first tick.
  `cli_account_has_credentials` is now provider-aware: it looks for the
  specific credentials file each CLI writes — `auth.json` for codex,
  `.credentials.json` for claude, `oauth_creds.json` for gemini — and
  ignores the scratch directories.

## [0.1.10] — 2026-05-17

### Fixed

- **Codex CLI login: "Not inside a trusted directory" error.**
  Orchestra now passes `--skip-git-repo-check` (before the `login`
  subcommand) when running `codex login`, and spawns the login PTY with
  `$HOME` as cwd so the trusted-dir check passes regardless of which
  workspace is open.

### Changed

- **Browser-first CLI login UX.** Adding a new CLI account no longer
  requires reading the terminal and Cmd-clicking links. Orchestra now
  watches the login PTY's output, regex-matches the first OAuth URL
  (`https?://…`), and opens it in your default browser automatically
  via `tauri-plugin-shell`. The account row shows an inline status badge
  — "Starting…" → "Awaiting OAuth in browser…" → "✓ Connected" — backed
  by a 1.5s poll of the credential directory (5 min timeout, with a
  Retry button on failure). The PTY tab still spawns in the bottom panel
  for debugging but is no longer the primary touchpoint.

### Internal

- `CliAccountsManager` rewritten to subscribe to `subscribeToPtyOutput`
  per pending login, with per-account `PendingState` tracked alongside
  the persisted account so the UI reflects login progress without
  touching the settings store. PTY/poller cleanup runs on unmount and on
  manual account removal so abandoned logins don't leak background work.

## [0.1.9] — 2026-05-17

### Fixed

- **`env: node: No such file or directory`** when spawning CLIs / services.
  macOS GUI apps inherit a minimal PATH that doesn't include Homebrew /
  nvm / asdf locations, so any script with `#!/usr/bin/env node` (or
  `python`, `ruby`, etc.) would fail. PtyManager::spawn now auto-resolves
  the user's login-shell PATH (`$SHELL -lc 'echo $PATH'`) on first call,
  caches it for the app lifetime, and injects it into every PTY spawn
  that doesn't already specify PATH. Fixes Codex CLI login, Claude CLI
  login, "Run All Services" against pnpm/npm projects, and lane bash
  PTYs that need full PATH access.

## [0.1.8] — 2026-05-17

### Added

- **Multi-account CLI providers.** Each CLI (Claude / Codex / Gemini) can
  now hold N named credential profiles. Settings → CLI row → Accounts
  section lists every profile with a green dot for the active one;
  clicking the dot switches without touching the filesystem.
- **Per-account credential directory.** Each profile lives under
  `~/.orchestra/cli-accounts/<id>/`. When Orchestra spawns the CLI it
  passes the directory via a per-provider env var
  (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `GEMINI_HOME`) so the CLI reads
  the right tokens. Zero logout/login dance.
- **Add Account flow.** Type a label, click Add — Orchestra creates a
  fresh credential dir and opens a Terminal tab running
  `<cli> login` with the env var set. Complete OAuth in your browser;
  tokens save into that dir. The account is then permanently switchable
  in one click.
- **Active account surfaces in the agent provider dropdown.** When a CLI
  provider is configured the dropdown shows e.g. "Codex CLI (Work)" so
  you always know which subscription is about to be billed.
- **Rename / remove accounts** inline (hover → pencil / trash buttons).
  Removing also deletes the credential directory on disk.

### Plumbing

- `pty_spawn` now accepts an optional `env` map; the existing service
  parser passes `service.env` through automatically.
- New Rust commands: `cli_account_create_dir`, `cli_account_remove_dir`,
  `cli_account_has_credentials` — manage the credential-directory
  lifecycle and let the Add Account flow poll for completion.

### Coming next (v0.1.9)

- Auto-rotate on rate-limit detection: when the CLI emits a "quota
  exceeded" line Orchestra will automatically switch to the next
  configured account and retry the message.

## [0.1.7] — 2026-05-17

### Added

- **Per-workspace conversation restore.** Switching to a workspace (or
  reopening the app with one active) auto-hydrates the agent chat with
  the most recent 50 user / assistant turns from that workspace's
  `.orchestra/memory.sqlite` store. Pick up where you left off after a
  shutdown.
- **"+ New" conversation button** next to Clear. Starts a fresh thread
  with a new session ID; previous history stays queryable from Memory Hub.
- **Auto-abort on workspace switch.** Any in-flight chat stream is
  cancelled before swapping to the new workspace's history.

## [0.1.6] — 2026-05-17

### Added

- **Inline AI edit (Cmd+I)** — Cursor-style "edit with AI" inside the
  CodeMirror editor. Select code (or place the cursor), press
  `Cmd/Ctrl+I`, type an instruction ("rename to fooBar", "add error
  handling", "convert to async"), and the active provider streams a
  replacement. Accept replaces the selection; Reject closes the widget;
  Retry re-runs with the same prompt. Works with every configured
  provider (Anthropic / OpenAI / Google / Ollama / OpenRouter / Claude
  CLI / Codex CLI / Gemini CLI) through `streamMessage`. The full file
  (capped at 8 KB) is sent as context so the model can reason about
  surrounding code.

## [0.1.5] — 2026-05-17

Substantial release — lane agents now drive their own terminals, a
VS Code-style resizable bottom panel, command palette, terminal hand-off
to AI, chat memory persistence, and a handful of CLI-provider fixes.

### Added

- **Command palette (Cmd/Ctrl+K)** — fuzzy launcher for workspace and editor
  actions.
- **Resizable bottom panel** — drag the splitter to give Terminal / Services /
  Lanes / MCP / Skills / Memory more room. State persists.
- **Hand-to-AI / reclaim button per terminal tab** — explicitly give a PTY
  to an agent (or take it back) so the model knows which terminals it owns.
- **`pty.owner` events** — the UI now reacts immediately when ownership of a
  PTY changes.
- **Lane agent drives the lane's own PTY** — when you approve a lane, the
  agent shell tool now targets the lane's bash terminal so all commands run
  in the right worktree.
- **Shell tool gets `targetPtyId`** — agent can pin its commands to a specific
  PTY instead of always spawning a fresh one.
- **Services Run All** — spinner while spawning + success toast.
- **Chat turns persist to Rust memory IPC** — every user/assistant message
  is recorded into the per-workspace sqlite store so we can do semantic
  recall in a later release.

### Fixed

- **CLI providers can't use shell tools (yet).** AgentPanel routes
  claude-cli / codex-cli / gemini-cli through `streamMessage` instead of
  `streamWithTools`; the Shell tools checkbox is disabled with a tooltip
  for those providers.
- **LaneBoard Coordinator was always producing mock lanes.** Now wires
  the active provider's LanguageModel into the real `generateObject` call
  (when an API provider is active; CLI providers still fall back to mock
  decomposition).
- **LaneBoard crashed for CLI providers.** Same root cause as the chat panel
  bug — `createProvider` doesn't know CLI IDs. Guarded with `isCliProvider`.

## [0.1.4] — 2026-05-16

- **New app icon.** Replaces the plain purple placeholder with a designed
  mark: indigo gradient background, three white "lanes" converging upward
  into a single point — reads as both the product's parallel-task-lanes
  pitch and a stylized conductor's gesture. Generated all platform variants
  (macOS .icns, Windows .ico, Linux PNGs, iOS / Android adaptive icons).

## [0.1.3] — 2026-05-16

- **Auto-detect CLI binaries.** Settings → Claude CLI / Codex CLI / Gemini
  CLI rows now auto-fill the binary path on first open by running
  `command -v <name>` through the user's login shell (so PATH from
  `.zshrc` / `.bashrc` is sourced — macOS GUI apps don't inherit shell
  PATH otherwise). Manual "Detect" button next to the input also re-runs
  the probe. Shows ✓ Found / ⚠ Not found feedback.

## [0.1.2] — 2026-05-16

- **Header now shows the running version** as a small `v0.1.2` pill next to
  the Orchestra title. Sourced from `tauri.conf.json` at build time via
  `@tauri-apps/api/app`'s `getVersion()`.
- First release that exercises the in-app auto-updater pipeline end-to-end:
  a user on v0.1.1 sees the green "Update v0.1.2 →" pill in the header
  within 5s of launch, clicks it, and is restarted into v0.1.2.

## [0.1.1] — 2026-05-16

Patch release adding **in-app auto-updates**, **multi-folder workspaces**,
**Makefile + Go service detection**, **CLI-backed agent providers** (Claude
Code / Codex / Gemini CLIs use their own auth — no API key needed), and a
**Tauri-backed JSON storage** adapter so workspaces / settings survive
WebView wipes.

### Added

- **Auto-updater** — `tauri-plugin-updater` + `tauri-plugin-process`
  wired up; `latest.json` published with every release and signed with a
  minisign keypair stored in GitHub Secrets. App polls the manifest on
  start + every 6h; users see an "Update available" pill in the header
  with release notes and a one-click "Install & Restart".
- **Multi-folder workspaces** — name a workspace, add folders from
  anywhere on disk, switch between workspaces from the header dropdown.
  Persistence migrates the old single-path workspaces automatically.
- **Tauri-backed JSON storage** for zustand stores — workspaces and
  settings now live in
  `~/Library/Application Support/dev.orchestra.desktop/*.json` so they
  survive WebView localStorage wipes.
- **Service detection** — Makefile targets (run/dev/serve/start/watch/
  air + run-_/dev-_) and standalone `go.mod` + `main.go` modules are now
  recognised alongside docker-compose, Procfile, package.json scripts,
  and orchestra.yaml.
- **CLI-backed providers** — Claude Code, OpenAI Codex, and Gemini CLIs
  can be wired in from Settings; Orchestra spawns the binary via the PTY
  backend and streams output into the chat. Lets Max-subscription users
  chat without buying API credits.

### Fixed

- PTY manager crashed at app start on synchronous `tokio::task::spawn_blocking`
  calls — switched to `tauri::async_runtime::spawn_blocking`.
- Run-All Services showed blank terminals because output was emitted
  before the React Terminal mounted. Added a per-PTY replay buffer +
  `pty_replay` command; `Terminal.tsx` now replays buffered bytes before
  subscribing to live output.



## [0.1.0] — 2026-05-16

First public alpha. End-to-end demos work on macOS, Linux, and Windows. Memory persistence and real MCP-server tool calls are still WIP.

### Added

#### Sprint 0 — Foundation

- pnpm workspace monorepo: `apps/desktop`, `packages/{ai-runtime, mcp-client, memory, skills}`.
- Tauri 2 desktop app shell (Rust backend + React 19 + Vite 6 frontend, Tailwind v4, shadcn-style primitives).
- Typed IPC contract layer with command + event bus.
- CI matrix across macOS / Linux / Windows (lint, typecheck, vitest, cargo check, clippy, full tauri build).
- Cross-platform release workflow (DMG / AppImage / MSI via `tauri-action`).
- Dependabot + auto-merge for patch/minor dev deps.
- ADRs (stack decisions, IPC contract), architecture doc, getting-started, non-goals.

#### Sprint 1 — Three feature lanes

- **Editor & Filesystem** — CodeMirror 6 editor with file open/save/dirty tracking, virtualized file tree, `notify-rs` watcher streaming `fs.change` events live, native folder picker.
- **Service Orchestrator + Shared PTY** — `portable-pty`-backed PTY manager with shared owner model (`user` | `agent:<sessionId>`); xterm.js + WebGL terminal grid; parsers for `docker-compose.yml`, `Procfile`, `package.json` scripts, `orchestra.yaml`; **Run All Services** dashboard.
- **AI Runtime + Chat** — Vercel-AI-SDK provider registry (Anthropic, OpenAI, Google, Ollama, OpenRouter) with caching; settings panel for API keys with "Test connection"; streaming AgentPanel with abort + role-styled bubbles; sqlite-vec-shaped `MemoryStore` (now superseded by Rust IPC in 0.1).

#### Sprint 2 — Integration demos

- **Demo 2 — Shared-PTY agent** — Vercel-AI-SDK `shellTool` lets the agent claim a PTY via `pty_spawn` with `PtyOwner::Agent`; user watches & types into the same terminal mid-execution; `ShellToolCard` renders inline tool-call status in the chat stream.
- **Demo 3 — Parallel Task Lanes** — `git2`-backed worktree commands (`git_status`, `git_worktree_add/remove/list/diff/merge`); LaneBoard goal decomposer → per-lane (worktree + agent + PTY + diff view); proposed → approved → running → merged | discarded lifecycle.
- **MCP / Skills / Memory GUIs** — three new tabs in the bottom panel.

#### Sprint 3 — Polish

- **Rust memory IPC** — `rusqlite`-backed per-workspace memory store; 6 Tauri commands (`memory_init/insert/query/list/update/delete`); Memory Hub UI persists across restarts.
- **Tauri MCP host** — real MCP server spawning via `tauri-plugin-shell` with stdout/stderr/status event streams; start/stop/restart through `MCPHost` process manager (JSON-RPC tool calls land in 0.2).
- **Real coordinator** — LangGraph-style decomposer (`generateObject`) replaces the mock 3-lane fallback when a provider is configured.
- **Docs site** — Astro Starlight scaffold at `docs-site/` (10 pages: intro, getting-started, architecture, 6 concepts); auto-deployed to GitHub Pages on docs changes.

### Known limitations (tracked for 0.2)

- MCP `listTools` returns `[]` — JSON-RPC protocol layer over the spawned stdio is not yet wired.
- Memory search uses `LIKE '%text%'`; semantic ANN via `sqlite-vec` is deferred.
- Coordinator is single-shot (`decompose`); the multi-node `critique → refine` LangGraph deferred.
- Decomposer `dependsOn` uses lane titles, not IDs.
- PTY resize is a no-op; the master handle is consumed by the reader task. Refactor to `Arc<Mutex<Box<dyn MasterPty>>>` planned.

[Unreleased]: https://github.com/supanut9/orchestra/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/supanut9/orchestra/releases/tag/v0.1.0
