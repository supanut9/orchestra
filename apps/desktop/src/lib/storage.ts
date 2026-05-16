/**
 * Tauri-backed storage adapter for zustand's `persist` middleware.
 *
 * Why not just localStorage?
 *   - Tauri's WKWebView/WebView2 occasionally wipes localStorage between
 *     `tauri dev` rebuilds, losing workspaces and settings every restart.
 *   - tauri-plugin-store writes to an actual JSON file in the OS app-data
 *     directory (e.g. `~/Library/Application Support/dev.orchestra.desktop/`
 *     on macOS), which survives rebuilds, OS restarts, and updates.
 *
 * Usage:
 *   persist(creator, { name: 'my-store', storage: createTauriJSONStorage('my-store.json') })
 *
 * Falls back to localStorage in non-Tauri environments (tests, Storybook).
 */

import type { PersistStorage, StorageValue } from 'zustand/middleware';

/**
 * Build a PersistStorage<T> backed by `@tauri-apps/plugin-store`. Each store
 * gets its own JSON file so they can be inspected / debugged independently.
 */
export function createTauriJSONStorage<T>(filename: string): PersistStorage<T> {
  type AnyStore = {
    get: (key: string) => Promise<unknown | undefined>;
    set: (key: string, value: unknown) => Promise<void>;
    delete: (key: string) => Promise<boolean>;
    save: () => Promise<void>;
  };

  let storePromise: Promise<AnyStore | null> | null = null;

  async function getStore(): Promise<AnyStore | null> {
    if (storePromise) return storePromise;
    storePromise = (async () => {
      try {
        const mod = await import('@tauri-apps/plugin-store');
        // Plugin v2 API: `load(path)` (returns a Store) or `Store.load(path)`.
        // We try the function form first; fall back to the class form.
        const fnLoad = (mod as { load?: (p: string) => Promise<unknown> }).load;
        if (typeof fnLoad === 'function') {
          return (await fnLoad(filename)) as AnyStore;
        }
        const Store = (
          mod as {
            Store?: { load: (p: string) => Promise<unknown> };
          }
        ).Store;
        if (Store && typeof Store.load === 'function') {
          return (await Store.load(filename)) as AnyStore;
        }
        return null;
      } catch (err) {
        console.warn('[storage] tauri-plugin-store unavailable, falling back to localStorage:', err);
        return null;
      }
    })();
    return storePromise;
  }

  return {
    async getItem(key) {
      const store = await getStore();
      if (!store) {
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
        return raw ? (JSON.parse(raw) as StorageValue<T>) : null;
      }
      const value = await store.get(key);
      return (value ?? null) as StorageValue<T> | null;
    },

    async setItem(key, value) {
      const store = await getStore();
      if (!store) {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(key, JSON.stringify(value));
        }
        return;
      }
      await store.set(key, value as unknown);
      await store.save();
    },

    async removeItem(key) {
      const store = await getStore();
      if (!store) {
        if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
        return;
      }
      await store.delete(key);
      await store.save();
    },
  };
}
