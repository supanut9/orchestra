# ADR-0001: Stack Decisions for v0.1

**Status:** Accepted
**Date:** 2026-05-16
**Deciders:** Orchestra core team

---

## Context

We are building Orchestra — an open-source, MIT-licensed, AI-native desktop IDE targeting macOS, Linux, and Windows from day one. The three killer features that differentiate it are:

1. A service orchestrator dashboard (labeled terminal grid, one-click start/stop).
2. Shared-PTY agent terminals — human and AI agent co-inhabit the same PTY; the human can watch and intervene live.
3. A visual parallel task-lane manager — each lane owns a git worktree, a dedicated agent session, and a dedicated PTY.

Key constraints that drove technology selection:

- **Cross-platform**: ship identical binaries on mac/linux/win without heavy electron overhead.
- **Open-source friendly**: license and ecosystem compatibility with MIT.
- **Model-agnostic AI**: must work with Anthropic, OpenAI, Google, Ollama, and OpenRouter on day one.
- **Small binary / fast startup**: important for a desktop app perception of quality.
- **Fast iteration**: small team (initially solo), so community support, documentation quality, and ergonomics matter.

---

## Decision 1 — Desktop Shell: Tauri 2

**Chosen:** Tauri 2 (Rust backend + WKWebView/WebView2 frontend, ~15–25 MB binary)

**Rejected alternatives:**

| Alternative             | Rejection reason                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| Electron                | Ships a full Chromium + Node.js runtime; 100–200 MB bundle; RAM-hungry                        |
| VS Code / Code-OSS fork | Enormous surface to maintain; locked into VS Code extension API; hard to own the UX           |
| Wails (Go + WebView2)   | Smaller Go ecosystem for our Rust-centric crates; PTY/ConPTY libraries are Rust-native        |
| Zed (Rust GPU)          | Closed-source; not embeddable; different rendering model (GPUI) with small external ecosystem |

**Consequences:**

- All contributors need a Rust toolchain installed (adds ~5 min to first-time setup).
- We write the Rust backend (PTY manager, fs watcher, git integration, SQLite) ourselves — no magic, but full control.
- Tauri's IPC layer requires explicit command registration; we address this with a typed contract (see ADR-0002).
- ConPTY on Windows requires careful testing; we include Windows in CI from day one.

---

## Decision 2 — UI Framework: React 19 + Vite 6

**Chosen:** React 19 + TypeScript 5 + Vite 6

**Rejected alternatives:**

| Alternative        | Rejection reason                                                                        |
| ------------------ | --------------------------------------------------------------------------------------- |
| SolidJS            | Smaller ecosystem; fewer ready-made component libraries; hiring pool thinner            |
| Svelte / SvelteKit | Less familiar to the contributor base; TypeScript support is improving but trails React |
| Vue 3              | Valid alternative, but React has stronger overlap with CodeMirror 6 community examples  |

**Consequences:**

- React 19 Server Components are not relevant (desktop app); we use React purely as a client-side rendering layer.
- Zustand for global state, TanStack Query for async server data — both are well-maintained and have a small footprint.
- We use Tailwind v4 + shadcn/ui for primitives; this avoids building a component library from scratch.

---

## Decision 3 — Editor: CodeMirror 6

**Chosen:** CodeMirror 6 (version 6.41.0 at time of decision)

**Rejected alternatives:**

| Alternative   | Rejection reason                                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Monaco Editor | ~5 MB minified vs CodeMirror's <2 MB; harder to build custom ghost-text / AI inline-suggest extensions; VSCode-centric API |
| Ace Editor    | Older architecture; limited extensibility for AI-native features                                                           |
| ProseMirror   | Rich-text focused; less suited for code editing                                                                            |

**Consequences:**

- We will write AI-specific CodeMirror extensions ourselves (ghost-text, inline-diff, lane annotation gutters). There are no ready-made solutions.
- CodeMirror 6 has excellent TypeScript types and a well-documented extension API — this is acceptable development overhead.

---

## Decision 4 — Terminal: xterm.js + portable-pty

**Chosen:** xterm.js 6 (frontend) + portable-pty 0.9 (Rust backend, Wezterm team)

**Rationale:**

- xterm.js is the de-facto standard for web-based terminals (VS Code, GitHub Codespaces, Jupyter).
- portable-pty is the only Rust PTY library that handles Windows ConPTY correctly.
- We avoid node-pty (Node native module) because we have a Tauri/Rust backend — bridging through node-pty would require Node to be embedded, negating Tauri's footprint advantage.
- Terminal bytes flow over Tauri's raw-payload channel to avoid JSON serialisation cost on high-throughput output.

**Consequences:**

- Shared-PTY model (human + agent co-inhabit one PTY) is implemented purely in Rust; the UI tails via an event subscription without needing two separate PTY handles.
- We take on the responsibility of implementing scroll-back buffer management and search in the UI layer.

---

## Decision 5 — AI Runtime: Vercel AI SDK v6 + LangGraph.js

**Chosen:** `ai` (Vercel AI SDK v6) as the provider abstraction, `@langchain/langgraph` for multi-agent orchestration.

**Rationale:**

- Vercel AI SDK is model-agnostic by design; switching providers is a one-line config change.
- It ships native MCP support from v4 onward.
- LangGraph.js gives us a stateful graph model for the task-decomposer coordinator (Sprint 1 / Lane C).
- Both packages have active maintenance and MIT-compatible licenses.

**Consequences:**

- LangGraph's graph mental model (nodes + edges + state channels) is non-trivial; contributors must learn it.
- We wrap both behind the `packages/ai-runtime` boundary so that if Vercel AI SDK's API surface changes (a real risk during v6 stabilisation) we change one package, not every call site.
- We allow a "no-coordinator" mode (1 lane = 1 direct agent call) to keep the simple case simple.

---

## Decision 6 — MCP Client: @modelcontextprotocol/sdk

**Chosen:** `@modelcontextprotocol/sdk` v1.29.0 (official Anthropic MCP SDK)

**Rationale:**

- We want to support the MCP standard as a first-class feature.
- The official SDK is the reference implementation and tracks the spec exactly.
- Vercel AI SDK v6 has built-in MCP support that integrates with this SDK.

**Consequences:**

- Per-project MCP configs live in `.orchestra/mcp.json`; hot-reload via an mcpmon-style watcher.
- We build a GUI marketplace browser on top of the SDK's server-listing primitives.

---

## Decision 7 — Local Memory: SQLite + sqlite-vec

**Chosen:** `rusqlite` + `sqlite-vec` extension for vector storage

**Rationale:**

- Privacy-first: all memory stays on disk, fully local by default.
- SQLite is universally supported; no external process or server required.
- sqlite-vec adds approximate-nearest-neighbour search inside SQLite — sufficient for per-project embedding stores at the scale we target.
- Avoids a heavy vector-DB dependency (Chroma, Weaviate, Pinecone) that would complicate packaging.

**Consequences:**

- Embedding generation must happen in-process (via a local model or a provider API call); we default to the AI provider's embedding endpoint.
- Optional cloud sync is a post-v0.1 feature and is off by default.

---

## Decision 8 — Monorepo Tooling: pnpm Workspaces

**Chosen:** pnpm workspaces (no Turborepo or Nx for now)

**Rationale:**

- pnpm workspaces alone are sufficient for Sprint 0–1 scope: four packages + one app.
- Turborepo and Nx add caching and task-graph benefits but also complexity. We can adopt them later if build times become painful.
- Keeps the toolchain simple for new contributors.

**Consequences:**

- Build scripts (`typecheck`, `lint`, `test`) are run with `pnpm -r` (recursive). No incremental caching unless we add Turborepo later.
- We may revisit this decision at Sprint 2 if CI times grow beyond 15 minutes.

---

## Overall consequences

- Cross-platform via Tauri requires every contributor to have a Rust toolchain. We document this prominently in CONTRIBUTING.md and the getting-started guide.
- CodeMirror means we write AI-specific editor extensions ourselves. This is intentional: it lets us build exactly the ghost-text and lane-annotation UI we need.
- LangGraph imposes a graph mental model on multi-agent flows. We provide a simpler direct-agent path for contributors who don't need the full coordinator.
