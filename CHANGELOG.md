# Changelog

All notable changes to Orchestra will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial monorepo scaffolding (pnpm workspaces, directory structure).
- CI workflow (`.github/workflows/ci.yml`): lint, typecheck, test, cargo check, clippy across macOS/Linux/Windows.
- Release workflow (`.github/workflows/release.yml`): cross-platform Tauri builds for macOS aarch64 + x86_64, Linux deb/AppImage, Windows msi.
- Dependabot configuration watching npm (all workspace packages), Cargo, and GitHub Actions.
- Dependabot auto-merge workflow for patch/minor dev-dependency bumps that pass CI.
- Pull request template with typecheck/lint/test/clippy/ADR checklist.
- Issue templates: bug report, feature request, RFC, and config (blank issues disabled).
- `FUNDING.yml` placeholder.
- `CODEOWNERS` placeholder.
- `docs/adr/0001-stack-decisions.md` — accepted ADR covering Tauri 2, React 19, CodeMirror 6, xterm.js + portable-pty, Vercel AI SDK + LangGraph, MCP SDK, SQLite + sqlite-vec, pnpm workspaces.
- `docs/adr/0002-ipc-contract.md` — proposed ADR documenting the typed IPC contract location, event bus topics, and raw-payload terminal channel.
- `docs/architecture.md` — high-level architecture overview with ASCII diagram, shared PTY model explanation, and data-flow table.
- `docs/getting-started.md` — developer setup guide (prerequisites, dev mode, testing, release builds, common issues).
- `docs/non-goals.md` — explicit list of what Orchestra will not do through v1.0, with reasoning for each exclusion.

[Unreleased]: https://github.com/placeholder/orchestra/compare/HEAD...HEAD
