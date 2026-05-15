/**
 * Re-export streamText from the Vercel AI SDK so consumers
 * (e.g. apps/desktop) don't need to add `ai` as a direct dependency.
 */
export { streamText } from 'ai';
