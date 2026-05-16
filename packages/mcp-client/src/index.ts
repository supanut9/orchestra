// Browser-safe exports only. `manager.ts` and `hot-reload.ts` use Node fs/path
// and must be imported via subpath in Node consumers: `@orchestra/mcp-client/node`.
export * from './types.js';
export * from './config.js';
