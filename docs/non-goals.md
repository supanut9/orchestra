# Non-Goals

This document records what Orchestra explicitly will NOT do, at least through v1.0. These decisions exist to keep the project focused, the codebase maintainable, and the solo-dev maintenance burden manageable.

Saying "no" clearly is more valuable than a vague roadmap. If a use case you care about is on this list, that is intentional. We would rather be excellent at the three killer features than mediocre at twenty.

---

## 1. Cloud-hosted IDE or browser-based version

Orchestra is a **desktop app**. There will be no SaaS version, no browser-based editor, and no "run in Codespaces" mode. Cloud IDEs (Codespaces, Gitpod, Replit) already exist and are well-funded. Our differentiation is the native PTY, the tight OS integration (file system events, worktrees, process spawning), and local-first privacy.

**Reasoning:** A browser target would require a completely different PTY model (WebSockets to a server), kill the local-first privacy guarantee, and double the surface area to maintain.

---

## 2. VS Code extension compatibility

Orchestra does not run VS Code extensions (.vsix), does not implement the Language Server Protocol in-process by default beyond what CodeMirror's LSP client provides, and does not aim to be a drop-in Cursor/Windsurf replacement for users with heavy VS Code extension stacks.

**Reasoning:** Supporting the VS Code extension API would require embedding a full Code-OSS runtime — a 150+ MB dependency we explicitly rejected (see ADR-0001). Users who need VS Code extensions should use VS Code or its forks.

---

## 3. Built-in language server (LSP) hosting

Orchestra does not ship bundled language servers (e.g. TypeScript Language Server, Pyright, rust-analyzer). It provides the plumbing for the UI to connect to an LSP server if one is already running, but starting and managing language servers is out of scope for v0.1.

**Reasoning:** LSP hosting is well-solved by existing tools. Bundling per-language LSPs would bloat the binary, create ongoing update burden, and distract from the AI-orchestration features that are our actual differentiator.

---

## 4. Collaboration / multiplayer editing

Orchestra is designed for a **solo developer** orchestrating AI agents. There is no real-time collaboration (no CRDTs, no presence cursors, no shared sessions over a network). A single human is always the conductor.

**Reasoning:** Multiplayer is an enormous engineering problem. It conflicts with the local-first, privacy-first design. Teams have Cursor, Linear, and GitHub for collaboration.

---

## 5. Mobile or tablet support

No iOS, Android, or iPadOS port. The PTY model, worktree management, and file system assumptions are all desktop-OS-native.

---

## 6. Proprietary model fine-tuning or training pipelines

Orchestra is a model consumer, not a model producer. It does not provide tools for fine-tuning, RLHF, dataset curation, or model training. You bring your own model (via API key or Ollama).

---

## 7. Integrated web browser or preview pane (v0.1)

There is no embedded browser tab or live web-preview pane in v0.1. Developers can use their OS browser alongside Orchestra. A preview pane may be considered post-v0.1 once the core PTY/lane features are solid.

---

## 8. Plugin marketplace or extension API (v0.1)

There will be no official plugin API or marketplace before v1.0. The MCP server browser is not a plugin system — it is a config UI for the MCP standard. Custom extensions are possible by forking or contributing upstream, but there is no stable public API to build against yet.

**Reasoning:** Defining a stable plugin API too early locks us into design decisions we may need to revisit. We will publish one once the architecture is settled.

---

## 9. Telemetry or analytics by default

All telemetry is **off by default**. There is no crash reporter, usage analytics, or feature-flag system that phones home without explicit opt-in. This is a non-negotiable design constraint, not just a settings toggle.

---

## 10. Windows-only or macOS-only features

We will not ship features that only work on one platform. Every feature must work on macOS, Linux, and Windows before it ships. If a platform limitation makes a feature impractical on one OS, the feature is deferred until it can be implemented cross-platform.

The one known exception is the Windows ConPTY path (vs. unix-pty on mac/linux) — the API is different under the hood, but the behaviour exposed to the user must be identical.

---

## 11. Replacing git entirely

Orchestra helps you create and manage git worktrees and visualise per-lane diffs. It does not replace git, reimplement the git CLI, or provide a GUI for arbitrary git operations (rebasing, cherry-picking, bisect). It is a thin orchestration layer on top of git, not a git client.

---

## 12. Docker / Kubernetes management dashboard

The service orchestrator parses `docker-compose.yml` to start/stop services and tail their logs. It is not a Docker Desktop replacement, a Kubernetes cluster manager, or a general container registry browser.

---

## What is in scope (v0.1 reminder)

To balance this list, the three features that ARE in scope for v0.1:

1. Service orchestrator dashboard — labeled terminal grid, one-click start/stop.
2. Shared-PTY agent terminals — human watches and intervenes while an AI agent runs.
3. Visual parallel task-lane manager — goal → N worktrees × N agents × N PTYs, side-by-side diffs.

Everything else ships after those three are demo-ready.
