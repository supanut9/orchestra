# Roadmap

This roadmap maps to [ORCHESTRA_PLAN.md](./ORCHESTRA_PLAN.md). Dates are aspirational targets, not commitments.

## v0.1 — The Three Demos (target: 8 weeks)

Goal: a working desktop app that demonstrates all three killer features end-to-end.

### Sprint 0 — Foundation (week 1)

- [x] Monorepo scaffold (Tauri 2 + React 19 + pnpm workspaces)
- [x] CI/CD pipeline (mac/linux/win build artifacts)
- [x] Workspace packages: `ai-runtime`, `mcp-client`, `memory`, `skills`
- [x] ADR-001: stack decisions
- [x] Typed IPC contract layer

### Sprint 1 — Three Lanes in Parallel (weeks 2–4)

- [ ] **Lane A** — Tauri shell, file tree, CodeMirror editor, fs watcher, command palette
- [ ] **Lane B** — PTY manager, xterm grid, docker-compose/Procfile parser, service dashboard
- [ ] **Lane C** — AI runtime (Anthropic + OpenAI providers), agent chat panel, sqlite-vec memory store

### Sprint 2 — The Demos (weeks 5–6)

- [ ] Demo 1: "Run All Services" lights up a labeled terminal grid
- [ ] Demo 2: AI agent claims a terminal, runs commands the human watches and intervenes in
- [ ] Demo 3: "Slice this goal" produces N worktree + agent + terminal + diff lanes side-by-side

### Sprint 3 — Polish & Public Release (weeks 7–8)

- [ ] MCP server manager GUI
- [ ] SKILL.md skill manager GUI
- [ ] Memory hub GUI
- [ ] Cross-platform release artifacts
- [ ] Docs site
- [ ] Launch video

## v0.2 — Quality of Life (target: +4 weeks)

- [ ] Inline AI suggestions (CodeMirror ghost text)
- [ ] Multi-repo workspace (cross-service git status panel)
- [ ] Skill marketplace browser
- [ ] Provider cost dashboard
- [ ] Optional encrypted cloud sync of memory

## v0.3 — Collaboration (target: +6 weeks)

- [ ] Live-share agent sessions
- [ ] Org-level skill packs
- [ ] PR-mode (full automated PR opens against a remote)

## Non-goals (for now)

- Reimplementing a full LSP / debugger stack — defer to upstream tools
- Cloud-hosted editor (Replit/Codespaces space)
- Plugin marketplace before the core is stable
- Mobile or web builds
