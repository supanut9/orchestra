// IPC contract layer — barrel exports.
// Import from here in feature modules; types live in `./types`.

export * from './types';
export * from './events';
export * from './fs';

// Lane B — PTY manager + service orchestrator. The full command surface is
// available via the submodules; only non-conflicting helpers/types are
// re-exported here for convenience.
export type { PtyInfo, PtyOutputPayload, PtyStatusPayload } from './pty';
export {
  decodePtyOutput,
  encodePtyInput,
  ptyList,
  subscribeToPtyOutput,
  subscribeToPtyStatus,
} from './pty';
export type { DetectedService, ServiceSource } from './services';

// Lane E — git worktree management.
export * from './git';

// Lane G — Memory Hub (Sprint 3).
export * from './memory';

// Lane H — MCP server lifecycle (Sprint 3).
export * from './mcp';

// System helpers (binary detection etc.)
export * from './system';
