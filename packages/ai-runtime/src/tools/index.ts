/**
 * tools/index.ts — barrel export for all agent tool factories.
 *
 * New tools go here; callers import from '@orchestra/ai-runtime/tools'
 * (once that export path is added to package.json) or directly via
 * '@orchestra/ai-runtime'.
 */

export {
  shellTool,
  shellParametersSchema,
  type RunShellCommandFn,
  type ShellCommandResult,
  type ShellToolHooks,
  type ShellToolParameters,
} from './shell.js';
