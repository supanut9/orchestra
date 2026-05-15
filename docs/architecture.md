# Orchestra — Architecture Overview

This document describes the high-level structure of the Orchestra desktop application. For specific technology choices and their rationale, see `docs/adr/0001-stack-decisions.md`. For the IPC contract between the UI and the Rust backend, see `docs/adr/0002-ipc-contract.md`.

---

## Bird's-eye view

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Orchestra Desktop (Tauri 2 shell)                                      │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  React 19 UI  (WebView / WKWebView / WebView2)                   │   │
│  │                                                                  │   │
│  │  features/editor      CodeMirror 6 + ghost-text extension        │   │
│  │  features/terminal    xterm.js + WebGL addon, tab grid           │   │
│  │  features/services    Service dashboard (start/stop/health)      │   │
│  │  features/lanes       Parallel task-lane board                   │   │
│  │  features/agents      Chat UI, model picker                      │   │
│  │  features/mcp         MCP server manager GUI                     │   │
│  │  features/skills      SKILL.md manager GUI                       │   │
│  │  features/memory      Memory hub GUI                             │   │
│  │                                                                  │   │
│  │  lib/ipc/             ← TYPED INTEGRATION BOUNDARY →             │   │
│  │    commands.ts        invoke() wrappers                          │   │
│  │    events.ts          listen() wrappers                          │   │
│  │    types.ts           shared payload types                       │   │
│  └──────────────────┬───────────────────────────────────────────────┘   │
│                     │  Tauri IPC (commands + events + raw channel)      │
│  ┌──────────────────▼───────────────────────────────────────────────┐   │
│  │  Rust Backend  (src-tauri/src/)                                  │   │
│  │                                                                  │   │
│  │  pty/          Shared PTY pool (portable-pty 0.9)                │   │
│  │  fs/           File watcher (notify-rs 8.2)                      │   │
│  │  git/          Worktree management (git2 / gix)                  │   │
│  │  services/     docker-compose / Procfile / orchestra.yaml parser │   │
│  │  memory/       sqlite-vec store (rusqlite + sqlite-vec)          │   │
│  │  ipc/          Tauri command handlers + event emitters           │   │
│  └──────┬──────┬──────┬──────┬──────┬──────────────────────────────┘   │
│         │      │      │      │      │                                   │
│      PTY│   FS │  git │  DB  │  MCP │  (spawned child processes)        │
│      pool│  watch│ ops │ ops  │servers                                  │
└─────────────────────────────────────────────────────────────────────────┘
         │                                          │
         │                                ┌─────────▼──────────────────┐
         │                                │  MCP Servers (child procs) │
         │                                │  spawned by Rust, comms    │
         │                                │  via stdio / SSE           │
         │                                └────────────────────────────┘
         │
┌────────▼────────────────────────────────────────────────────────────────┐
│  packages/ (Node.js, imported by the React process)                     │
│                                                                         │
│  ai-runtime/   ←─── Vercel AI SDK v6 provider registry                 │
│    providers.ts         Anthropic / OpenAI / Google / Ollama            │
│    coordinator.ts       LangGraph.js decompose-goal graph               │
│                                                                         │
│  mcp-client/   ←─── @modelcontextprotocol/sdk v1.29 lifecycle manager   │
│    manager.ts           hot-reload, per-project .orchestra/mcp.json     │
│                                                                         │
│  memory/       ←─── sqlite-vec facade (reads from Rust-owned DB file)  │
│    store.ts             project / user / session memory tables          │
│                                                                         │
│  skills/       ←─── SKILL.md parser + system-prompt injector           │
│    parser.ts            injects into any provider via ai-runtime        │
└─────────────────────────────────────────────┬───────────────────────────┘
                                              │
                               ┌──────────────▼──────────────────────────┐
                               │  AI Providers (external)                │
                               │  Anthropic API / OpenAI API /           │
                               │  Google AI / Ollama (local) /           │
                               │  OpenRouter                             │
                               └─────────────────────────────────────────┘
```

---

## Shared PTY model (key differentiator)

A PTY (pseudo-terminal) in Orchestra is not owned exclusively by one consumer. Each PTY in the pool has:

```
PTY record
  id:       string (UUID)
  label:    string (e.g. "api-server", "lane-2-agent")
  owner:    "user" | "agent:<sessionId>"
  cwd:      string (absolute path, usually a worktree root)
  status:   "idle" | "running" | "exited" | "crashed"
  buffer:   ring buffer (last N lines, Rust-side)
```

The UI subscribes to `pty.output` events for any PTY it is currently displaying. An AI agent session holds a write handle to the PTY it claims. This means:

- The human can watch the agent type commands in real time.
- The human can interleave keystrokes (intervene-mode) — the PTY receives bytes from both sources; the UI shows a visual warning.
- Multiple UI panes can tail the same PTY simultaneously (read fan-out happens in Rust before the event is emitted).
- Raw terminal bytes bypass the JSON IPC via Tauri's `Channel<Vec<u8>>` to avoid serialisation overhead.

---

## Parallel task lanes

When the user types a goal and clicks "Decompose":

```
User goal
    │
    ▼
coordinator.ts (LangGraph graph)
    │  decompose node
    ▼
[ lane-1 spec, lane-2 spec, lane-3 spec ]
    │
    ├── lane-1:  git worktree add .orchestra/worktrees/lane-1
    │            claim PTY (pty/manager.rs)
    │            spawn AI agent session (ai-runtime)
    │            stream diffs (git2 status watcher)
    │
    ├── lane-2:  (same structure)
    │
    └── lane-3:  (same structure)
```

Each lane is fully independent. Merging a lane to main is a serialised human action to avoid worktree race conditions.

---

## Data flow summary

| Data type                                           | Transport                     | Format                          |
| --------------------------------------------------- | ----------------------------- | ------------------------------- |
| Terminal bytes                                      | Tauri raw Channel             | `Vec<u8>` (no encoding)         |
| Structured events (fs, service health, lane status) | Tauri events                  | JSON (serde)                    |
| Tauri commands                                      | Tauri IPC invoke              | JSON (serde)                    |
| AI streaming responses                              | Vercel AI SDK ReadableStream  | Server-Sent Events (in-process) |
| SQLite (memory, workspace state)                    | Rust rusqlite                 | Binary (file on disk)           |
| MCP messages                                        | stdio / SSE (child processes) | JSON-RPC 2.0                    |

---

## Directory map (abbreviated)

```
orchestra/
├── apps/desktop/
│   ├── src/                  React UI
│   │   ├── features/         One folder per product feature
│   │   ├── stores/           Zustand stores
│   │   └── lib/ipc/          Typed IPC boundary (see ADR-0002)
│   └── src-tauri/
│       └── src/              Rust modules (pty, fs, git, services, memory, ipc)
├── packages/
│   ├── ai-runtime/           Vercel AI SDK + LangGraph coordinator
│   ├── mcp-client/           MCP lifecycle manager
│   ├── memory/               sqlite-vec facade
│   └── skills/               SKILL.md parser
├── docs/
│   ├── adr/                  Architecture Decision Records
│   ├── architecture.md       This file
│   ├── getting-started.md    Dev setup for contributors / source builds
│   └── non-goals.md          What Orchestra explicitly will not do
└── .github/
    ├── workflows/            CI (ci.yml) and release (release.yml)
    └── ISSUE_TEMPLATE/       Bug / feature / RFC forms
```
