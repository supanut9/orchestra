// IPC contract layer — barrel exports
// Import from here in feature modules, never from submodules directly.

export * from './types';
export * from './commands';
export * from './events';
export * from './fs';

// Lane B additions — PTY manager and service orchestrator.
// NOTE: `pty.ts` and `services.ts` define real implementations that shadow
// the stub names in `commands.ts`.  Feature modules that need the Lane B PTY
// or service commands should import directly from the specific sub-modules:
//   import { ptySpawn, subscribeToPtyOutput } from '@/lib/ipc/pty';
//   import { servicesDetect, servicesRunAll } from '@/lib/ipc/services';
//
// New, non-conflicting symbols (types + helpers unique to Lane B) are
// re-exported here for barrel convenience.
export type { PtyInfo, PtyOutputPayload, PtyStatusPayload } from './pty';
export {
  decodePtyOutput,
  encodePtyInput,
  ptyList,
  subscribeToPtyOutput,
  subscribeToPtyStatus,
} from './pty';
export type { DetectedService, ServiceSource } from './services';
