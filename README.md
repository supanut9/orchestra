# Orchestra

> An open-source, model-agnostic desktop IDE for the AI-orchestration era.

Orchestra is built for developers who _conduct_ AI agents instead of typing most of the code themselves. It bundles three things no other tool combines today:

1. **Service Orchestrator Dashboard** — one config (`docker-compose.yml`, `Procfile`, or `orchestra.yaml`), one click to spin up every microservice, each in its own labeled terminal tab with health and log filtering.
2. **Shared-PTY Agent Terminals** — when an AI agent runs a shell command, that terminal is a live, interactive tab you can watch, type into, and interrupt. No hidden subprocess outputs.
3. **Parallel Task Lanes** — slice one goal into N independent agent lanes, each with its own git worktree, AI session, terminal, and diff view. Merge what works, discard what doesn't.

Plus first-class **MCP server management**, **SKILL.md skills**, **per-project + cross-project memory**, and a **provider-agnostic** AI runtime (Claude, OpenAI, Gemini, Ollama, OpenRouter).

## Status

Pre-alpha. See [ORCHESTRA_PLAN.md](./ORCHESTRA_PLAN.md) for the full design and [ROADMAP.md](./ROADMAP.md) for what's shipping when.

## Stack

| Layer      | Choice                                        |
| ---------- | --------------------------------------------- |
| Shell      | Tauri 2 (Rust)                                |
| UI         | React 19 + Vite 6 + Tailwind v4 + shadcn/ui   |
| Editor     | CodeMirror 6                                  |
| Terminal   | xterm.js + portable-pty                       |
| AI runtime | Vercel AI SDK + LangGraph.js (model-agnostic) |
| MCP        | `@modelcontextprotocol/sdk`                   |
| Memory     | SQLite + `sqlite-vec` (local-first)           |

## Quick start (dev)

```bash
# Prerequisites: Node >=22, pnpm >=10, Rust (stable), Tauri prerequisites
# https://v2.tauri.app/start/prerequisites/

git clone https://github.com/<your-org>/orchestra.git
cd orchestra
pnpm install
pnpm tauri dev
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE)
