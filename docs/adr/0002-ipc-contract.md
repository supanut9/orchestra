# ADR-0002: Typed IPC Contract Between UI and Rust Backend

**Status:** Proposed
**Date:** 2026-05-16
**Deciders:** Orchestra core team

---

## Context

Tauri 2 exposes two communication mechanisms between the WebView frontend and the Rust backend:

1. **Commands** (`invoke`) — request/response, typed on both sides.
2. **Events** (`emit` / `listen`) — fire-and-forget or streaming, used for real-time data (terminal output, file changes, service health updates).

In a monorepo with three parallel workstreams (Lane A: shell/editor, Lane B: PTY/services, Lane C: AI/lanes), it is critical that the TypeScript types on the frontend and the Rust `serde` structs on the backend stay in sync. Without a single source of truth, integration bugs appear only at runtime.

We also need to agree on the set of event bus topics shared across lanes so that Lane B can emit `pty.output` and Lane C can subscribe to it without implicit coupling.

---

## Decision

### 1. Contract location

The typed IPC contract lives in `apps/desktop/src/lib/ipc/`. This directory is the single integration point between the React UI and the Rust backend. It contains:

- `commands.ts` — TypeScript function wrappers around `invoke()`, one function per Tauri command.
- `events.ts` — Typed event listeners/emitters, one function per event topic.
- `types.ts` — Shared payload types (no business logic).

On the Rust side, the corresponding structs live in `apps/desktop/src-tauri/src/ipc/` with `#[derive(Serialize, Deserialize)]` and matching field names.

### 2. Type generation strategy

We will use `tauri-specta` (or `ts-rs` as a fallback) to auto-generate `commands.ts` and `types.ts` from the Rust struct definitions. The generation step runs as part of the `pnpm typecheck` task so that type drift is caught in CI.

Until the generator is wired up, types are maintained by hand and cross-checked in PR review. This is a known risk for Sprint 0.

### 3. Event bus topics

The following topics are reserved and must not be reused for other payloads:

| Topic            | Direction | Payload summary                                                                                | Owner lane |
| ---------------- | --------- | ---------------------------------------------------------------------------------------------- | ---------- |
| `pty.output`     | Rust → UI | `{ ptyId: string; data: Uint8Array }`                                                          | Lane B     |
| `pty.status`     | Rust → UI | `{ ptyId: string; status: "running" \| "exited" \| "crashed"; exitCode?: number }`             | Lane B     |
| `pty.input`      | UI → Rust | `{ ptyId: string; data: Uint8Array }`                                                          | Lane B     |
| `fs.change`      | Rust → UI | `{ kind: "create" \| "modify" \| "delete" \| "rename"; paths: string[] }`                      | Lane A     |
| `service.health` | Rust → UI | `{ serviceId: string; status: "up" \| "down" \| "degraded"; cpu?: number; mem?: number }`      | Lane B     |
| `lane.update`    | Rust → UI | `{ laneId: string; status: "pending" \| "running" \| "merged" \| "discarded"; diff?: string }` | Lane C     |
| `agent.message`  | Rust → UI | `{ sessionId: string; role: "assistant" \| "tool"; content: string }`                          | Lane C     |

All topics follow `<domain>.<verb>` naming. New topics added in future must be registered here first (via PR to this ADR or its successor).

### 4. Raw-payload terminal channel

Terminal byte streams bypass the JSON IPC entirely. They use Tauri's `Channel<Vec<u8>>` (raw payload) to avoid UTF-8 serialisation overhead on high-throughput terminal output. The `pty.output` event above is the structured metadata channel; raw bytes travel on a separate channel handle passed to the frontend at PTY creation time.

---

## Consequences

- All three lanes must import their IPC helpers from `apps/desktop/src/lib/ipc/` only. Calling `invoke()` directly from feature components is disallowed (enforced via ESLint custom rule, post-Sprint 0).
- Type generation adds a Rust build step to `pnpm typecheck`. CI will catch drift; local `pnpm typecheck` may be slightly slower.
- The raw-payload channel for terminal bytes is not covered by `tauri-specta` and must be kept in sync manually.
- This ADR will be superseded once the generator is fully wired up and the manual maintenance phase ends.

---

## Unresolved questions

- Should we use `tauri-specta` (generates TypeScript from Tauri macros) or `ts-rs` (generates from serde structs independently)? Decision deferred to Sprint 1 when the first real commands are implemented.
- Do we need a schema registry for event payloads (Zod schemas auto-generated from Rust types)? Useful for runtime validation but adds build complexity.
