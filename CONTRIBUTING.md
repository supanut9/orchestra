# Contributing to Orchestra

Thanks for being here. Orchestra is in pre-alpha — APIs change, demos break, and that's expected for now. This guide gets you set up and explains how to land changes.

## Prerequisites

- **Node**: >= 22 (use `nvm install` from `.nvmrc`)
- **pnpm**: >= 10 (`corepack enable && corepack prepare pnpm@latest --activate`)
- **Rust**: stable (`rustup default stable`)
- **Tauri system deps**: follow [v2.tauri.app/start/prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS

## Setup

```bash
git clone https://github.com/<your-org>/orchestra.git
cd orchestra
pnpm install
pnpm tauri dev
```

## Repo layout

```
apps/desktop/        # Tauri 2 desktop app (Rust backend + React frontend)
packages/ai-runtime/ # Model-agnostic AI provider + agent coordinator
packages/mcp-client/ # MCP server lifecycle + hot-reload
packages/memory/     # Local sqlite-vec memory store
packages/skills/     # SKILL.md parser + injector
docs/                # Design docs and ADRs
.github/             # CI workflows, issue + PR templates
```

## Workflow

1. Open or claim an issue (or open a draft PR for discussion).
2. Branch from `main`: `git checkout -b feat/<slug>` or `fix/<slug>`.
3. Commit in [Conventional Commits](https://www.conventionalcommits.org/) style: `feat(pty): add shared PTY ownership`.
4. Run the gate locally before pushing:
   ```bash
   pnpm typecheck
   pnpm lint
   pnpm test
   cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
   cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings
   ```
5. Open the PR. The CI matrix builds for macOS, Linux, and Windows.

## Architecture decision records (ADRs)

Significant decisions live in `docs/adr/`. If you're changing the stack, the IPC contract, or a cross-package boundary, add an ADR with the PR.

## Code style

- TypeScript: strict mode on, no `any` without justification.
- React: functional components, hooks; no class components.
- Rust: `cargo fmt`, `cargo clippy -- -D warnings` is the gate.
- Default to writing no comments. Comment only when the _why_ is non-obvious.

## License

By contributing you agree your work is released under the [MIT License](./LICENSE).
