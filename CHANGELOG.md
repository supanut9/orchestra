# Changelog

All notable changes to Orchestra will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
