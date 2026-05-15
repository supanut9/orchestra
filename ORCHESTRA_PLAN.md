# Orchestra — Open-Source AI-Native Desktop IDE

## Context

Modern AI-driven development has outgrown the IDE-as-editor model. The user (solo dev, microservice-heavy workflow) hits real pain that no current tool solves cleanly:

- Many terminals per AI session — easy to lose track of which agent is doing what
- Microservices = N terminals to start by hand for every project
- AI agents spawn their own shells invisibly; the human can't watch or intervene
- Memory and skills/MCP configs live in JSON files; switching projects is friction
- No visual way to slice a goal into parallel agent lanes

Competitive research (May 2026) confirms **no shipping product bundles** the three killer features together: a **service orchestrator dashboard**, **shared-PTY agent terminals** (human watches/intervenes live), and a **visual parallel task-lane manager** with per-lane worktree + agent + terminal + diff. Cursor/Windsurf/Zed each have parallel agents; Warp is terminal-first; JetBrains Air and Augment Intent each touch one piece. None are open-source desktop apps designed for non-coders orchestrating AI.

**Intended outcome:** Ship `orchestra` — a Tauri-based, MIT-licensed, model-agnostic desktop IDE for the AI-orchestration era. v0.1 demo: open a microservice repo, click "Run Services" → labeled terminal grid lights up; click "New Lane" → decomposer proposes 3 parallel agent lanes, each in its own worktree + terminal, all visible side-by-side.

## Decisions Locked

| Decision         | Choice                                                              | Why                                                     |
| ---------------- | ------------------------------------------------------------------- | ------------------------------------------------------- |
| Project name     | **Orchestra**                                                       | Conducting agents + services like instruments           |
| License          | **MIT**                                                             | Maximum open-source reach                               |
| Platforms (v0.1) | **macOS + Linux + Windows**                                         | Tauri makes it cheap; Win needs ConPTY path             |
| MVP strategy     | **All 3 pillars in parallel via sub-agent lanes**                   | User's stated preference; faster to differentiated demo |
| AI runtime       | **Model-agnostic** (Claude / OpenAI / Gemini / Ollama / OpenRouter) | Day-1 requirement                                       |

## Recommended Stack (versions verified at research time — re-verify at scaffold)

**Shell & UI**

- **Tauri 2.11.1** (Rust backend, WKWebView/WebView2 frontend, ~15–25 MB binary)
- **React 19.x** + **TypeScript 5.x** + **Vite 6.x**
- **Tailwind v4** + **shadcn/ui** for primitives
- **Zustand** for global state, **TanStack Query** for async
- **CodeMirror 6.41.0** (not Monaco — 10× lighter, AI-extension-friendly, Replit chose it)
- **xterm.js 6.0.0** + `@xterm/addon-webgl 0.19.0` + `addon-fit 0.11.0` + `addon-search 0.16.0`

**Rust crates (Tauri backend)**

- **portable-pty 0.9.0** (Wezterm team; cross-platform incl. Windows ConPTY)
- **notify-rs 8.2.0** (file watching)
- **git2** or **gix** (worktree mgmt)
- **rusqlite** + **sqlite-vec** (local memory store)
- **tokio** for async, **serde** for IPC payloads
- **tauri-plugin-shell**, **tauri-plugin-fs**, **tauri-plugin-store**

**AI / Agent layer**

- **Vercel AI SDK v6** (unified provider abstraction + native MCP support)
- **LangGraph.js** (stateful multi-agent orchestration)
- **@modelcontextprotocol/sdk v1.29.0** (MCP client)
- **mcpmon / mcp-reloader** (hot-reload MCP server configs)
- **SKILL.md** format (Anthropic standard, now adopted by 32+ tools — model-agnostic at the skill level)

**Build / Release**

- **tauri-action** for cross-OS CI builds (`.dmg` + `.AppImage`/`.deb` + `.msi`)
- **changesets** for versioning
- **pnpm workspaces** (monorepo)

## Repo Layout

```
orchestra/
├── apps/
│   └── desktop/                # Tauri 2 app
│       ├── src-tauri/          # Rust backend
│       │   ├── src/
│       │   │   ├── main.rs
│       │   │   ├── pty/        # portable-pty manager (shared PTY model)
│       │   │   ├── fs/         # notify-rs watcher
│       │   │   ├── git/        # worktree + status across repos
│       │   │   ├── services/   # docker-compose / Procfile parser + runner
│       │   │   ├── memory/     # sqlite-vec store
│       │   │   └── ipc/        # commands + events + raw payload terminal channel
│       │   └── Cargo.toml
│       └── src/                # React UI
│           ├── features/
│           │   ├── editor/         # CodeMirror 6
│           │   ├── terminal/       # xterm.js panes, tab grid
│           │   ├── services/       # orchestrator dashboard
│           │   ├── lanes/          # parallel task lane manager
│           │   ├── agents/         # chat UI, model picker
│           │   ├── mcp/            # MCP server manager GUI
│           │   ├── skills/         # SKILL.md manager GUI
│           │   └── memory/         # memory hub GUI
│           ├── stores/
│           └── lib/
├── packages/
│   ├── ai-runtime/             # Vercel AI SDK + LangGraph wrapper, provider registry
│   ├── mcp-client/             # MCP lifecycle, hot-reload, per-project configs
│   ├── memory/                 # sqlite-vec facade + optional mem0 layer
│   └── skills/                 # SKILL.md parser + injector
├── docs/                       # mdBook or Astro Starlight
├── .github/workflows/
│   ├── ci.yml                  # lint + typecheck + cargo check + tests
│   └── release.yml             # tauri-action: mac, linux, win artifacts
├── CONTRIBUTING.md
├── LICENSE                     # MIT
└── README.md
```

## Three Parallel Workstream Lanes

Each lane is independently developable by a sub-agent. Integration points are typed IPC contracts in `apps/desktop/src/lib/ipc.ts` and a shared event bus.

### Lane A — Shell & Editor Core

**Owner concern:** the app exists and feels like an IDE.

- Scaffold Tauri 2 + React 19 + Vite + Tailwind v4 + shadcn
- Workspace concept: open folder → persisted recent workspaces list (tauri-plugin-store)
- File tree (left rail) — virtualized, drag/drop, context menu
- CodeMirror 6 editor with: language detection, theme (One Dark + Light), search, ghost-text extension stub (used later by AI inline-suggest)
- Diff viewer component (used by Lane C for lane outputs)
- fs watcher → reactive file tree updates
- Settings panel (model providers, theme, keybindings)
- Command palette (Cmd/Ctrl-K) — shared registry that other lanes plug actions into

**Critical files**

- `apps/desktop/src-tauri/src/fs/mod.rs` — notify-rs watcher streamed via tauri events
- `apps/desktop/src/features/editor/Editor.tsx`
- `apps/desktop/src/features/workspace/`
- `apps/desktop/src/lib/ipc.ts` — typed IPC client (commands + event subscriptions)

### Lane B — Service Orchestrator + Shared PTY (KEY DIFFERENTIATOR #1 & #2)

**Owner concern:** terminals are first-class, services start with one click, AI agents share PTYs with humans.

- **Service parser** (`crates/orchestra-services` or in-app Rust module): detect & parse `docker-compose.yml`, `Procfile`, `orchestra.yaml` (custom), `package.json` scripts
- **PTY manager** (`apps/desktop/src-tauri/src/pty/`): portable-pty pool, each pty has an ID, label, owner (`user` | `agent:<sessionId>`), buffer, status
- **Shared PTY protocol**: a pty can be claimed by an agent AND tailed by the UI simultaneously; bytes stream over a Tauri "raw payload" channel (avoid JSON tax on terminal data)
- **Terminal grid UI** (`features/terminal/`): xterm.js + WebGL addon; tabs in a configurable grid (1×1, 2×2, custom); per-tab badge for owner (human vs which agent) and health (running/exited/crashed)
- **Service dashboard** (`features/services/`): one row per service with run/restart/kill, last log line, CPU/mem mini-chart (optional), one-click "attach AI" → spawns agent session bound to that pty
- Log filter & search per terminal (xterm search addon)
- Intervene-mode: if agent is typing in a pty, human keystrokes interleave (with a visual "you are typing while agent is active" hint)

**Critical files**

- `apps/desktop/src-tauri/src/pty/manager.rs`
- `apps/desktop/src-tauri/src/services/parser.rs`
- `apps/desktop/src/features/terminal/TerminalGrid.tsx`
- `apps/desktop/src/features/services/ServiceDashboard.tsx`

### Lane C — AI Runtime + Lanes + MCP + Skills + Memory (KEY DIFFERENTIATOR #3 + glue)

**Owner concern:** model-agnostic agents, parallel task lanes, MCP/skill/memory GUIs.

- `packages/ai-runtime/`: provider registry (Anthropic, OpenAI, Google, Ollama, OpenRouter) via Vercel AI SDK v6; per-project default + per-lane override; usage/cost tracking
- LangGraph coordinator: `decompose(goal) → lanes[]` graph with verifier node
- **Task Lane UI** (`features/lanes/`): goal input → coordinator proposes N lanes → user approves → each lane spawns:
  - `git worktree add` into `.orchestra/worktrees/<lane-id>` (gix or git2)
  - Dedicated AI agent session (own context, own memory thread)
  - Dedicated pty bound to that worktree (uses Lane B's manager)
  - Live diff view of files changed in that worktree
  - "Merge to main" / "Discard" buttons per lane
- `packages/mcp-client/`: MCP SDK v1.29.0; per-project `.orchestra/mcp.json`; hot-reload via mcpmon pattern; GUI marketplace browser
- `packages/skills/`: parse SKILL.md, inject into agent system prompts regardless of provider; GUI to enable/disable per workspace
- `packages/memory/`: sqlite-vec store; tables for `project_memory`, `user_memory`, `session_memory`; semantic search; visual editor panel (`features/memory/`)
- Optional cloud sync (off by default, privacy-first)

**Critical files**

- `packages/ai-runtime/src/providers.ts`
- `packages/ai-runtime/src/coordinator.ts` (LangGraph graph)
- `apps/desktop/src/features/lanes/LaneBoard.tsx`
- `apps/desktop/src-tauri/src/git/worktree.rs`
- `packages/mcp-client/src/manager.ts`
- `packages/skills/src/parser.ts`
- `packages/memory/src/store.ts`

## Cross-Lane Integration Contracts

Locked early to allow parallel work:

1. **IPC command schema** (`apps/desktop/src/lib/ipc.ts`) — TypeScript types + Rust serde structs share a generator (`tauri-specta` or `ts-rs`)
2. **Event bus topics**: `pty.output`, `pty.status`, `fs.change`, `service.health`, `lane.update`, `agent.message`
3. **PTY ownership API**: Lane B exposes `claimPty({label, ownerId, cwd})` and `attachPty({ptyId, readerId})` used by Lane C
4. **Agent ↔ PTY bridge**: AI runtime calls `claimPty` when executing a shell tool; output streams back through the same mechanism the UI tails

## Phasing (each lane is a parallel sub-agent)

**Sprint 0 (week 1)** — solo: lock IPC contracts, scaffold monorepo, set up CI/release pipeline, write CONTRIBUTING.md & ADR-001 (stack decisions)

**Sprint 1 (weeks 2–4)** — 3 sub-agents in parallel:

- Lane A: Tauri shell, file tree, CodeMirror, fs watcher
- Lane B: PTY manager + xterm grid + docker-compose parser + service dashboard MVP
- Lane C: ai-runtime package + 2 providers (Anthropic + OpenAI) + agent chat panel + sqlite-vec scaffold

**Sprint 2 (weeks 5–6)** — integration + the 3 killer demos:

- Demo 1: "Run All Services" → grid of live terminals (Lane B done)
- Demo 2: Agent claims a terminal, runs `npm test`, human watches & intervenes (Lane B+C)
- Demo 3: "Slice this goal into 3 lanes" → 3 worktrees, 3 agents, 3 ptys, side-by-side diffs (all lanes)

**Sprint 3 (weeks 7–8)** — polish for v0.1.0 public release:

- MCP & Skill manager GUIs
- Memory hub GUI
- Cross-platform CI/release artifacts
- Landing page (`orchestra-ide.dev` or similar), docs site, demo video

## Open-Source Hygiene (day-1)

- MIT LICENSE
- CODE_OF_CONDUCT.md (Contributor Covenant)
- CONTRIBUTING.md (dev setup, conventional commits, PR template)
- Issue templates (bug / feature / RFC)
- ADRs in `docs/adr/` for big decisions
- Discord or GitHub Discussions
- Roadmap in repo (`ROADMAP.md`)
- Telemetry: **off by default**, opt-in only, fully local-first

## Risks & Mitigations

| Risk                                                      | Mitigation                                                             |
| --------------------------------------------------------- | ---------------------------------------------------------------------- |
| Tauri ConPTY on Windows is rougher than macOS/Linux       | portable-pty handles it; test in CI from day 1                         |
| Vercel AI SDK v6 API surface changes during dev           | Wrap behind our `ai-runtime` package boundary                          |
| LangGraph adds complexity for simple cases                | Allow a "no-coordinator" mode: 1 lane = 1 direct agent call            |
| Worktree race conditions when many lanes touch same files | Worktrees are per-branch; merge-to-main is a serialized human action   |
| Scope creep — too many features for v0.1                  | Hard cut at the 3 demos above; everything else is post-0.1             |
| Open-source maintenance burden as solo dev                | Be aggressive about closing as wontfix; publish a clear non-goals list |

## Verification (per lane, before merge to main)

- `cargo check && cargo clippy --all-targets -- -D warnings`
- `pnpm -r typecheck && pnpm -r lint`
- `pnpm -r test` (vitest unit, playwright for UI smoke)
- `pnpm tauri dev` smoke run on host OS
- CI: build artifacts on macOS-latest, ubuntu-latest, windows-latest
- Manual demo script for each of the 3 killer demos — recorded as the v0.1 launch video

## Post-Approval Steps

1. Create GitHub repo `orchestra` (or chosen name) under user's account
2. Copy this plan to `/Users/supanut.tan/projects/supanut9/orchestra/ORCHESTRA_PLAN.md` (per user's "plan to project root" preference)
3. Run Sprint 0 scaffolding (single sub-agent, foundation only)
4. Fan out Sprint 1 to 3 parallel sub-agents on Lanes A/B/C
