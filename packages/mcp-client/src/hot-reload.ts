import { watch } from 'node:fs/promises';

/**
 * Watch a config file for changes and invoke `onChange` on each change event.
 * Returns an AbortController — call `.abort()` to stop watching.
 *
 * Stub: real debounce + parse-and-diff logic comes in Sprint 1.
 */
export function watchConfig(
  path: string,
  onChange: (path: string) => void | Promise<void>,
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const watcher = watch(path, { signal: controller.signal });
      for await (const event of watcher) {
        if (event.eventType === 'change' || event.eventType === 'rename') {
          await onChange(path);
        }
      }
    } catch (err: unknown) {
      // AbortError is expected on teardown
      if (err instanceof Error && (err as NodeJS.ErrnoException).name !== 'AbortError') {
        console.error('[mcp-client] watchConfig error:', err);
      }
    }
  })();

  return controller;
}
