/**
 * memory-bridge.ts
 *
 * Manages a single MemoryStore instance per workspace path.
 * The store is opened lazily on first access and re-opened when the workspace changes.
 *
 * In a Tauri context, the DB lives at:
 *   <workspace>/.orchestra/memory.sqlite
 *
 * When no workspace is open, we fall back to a temporary in-memory path (':memory:').
 * This keeps the panel functional even before a workspace is loaded.
 *
 * NOTE: MemoryStore uses better-sqlite3 (a native Node module). In Tauri 2 this
 * runs inside the Node-compatible renderer process; if it fails (e.g. module not
 * bundled), a warning is logged and all memory calls become no-ops.
 */
let currentDbPath = null;
let storeInstance = null;
let initPromise = null;
async function getStore(dbPath) {
    if (storeInstance && currentDbPath === dbPath) {
        return storeInstance;
    }
    // Close existing store if workspace changed
    if (storeInstance && currentDbPath !== dbPath) {
        try {
            await storeInstance.close();
        }
        catch {
            // ignore close errors
        }
        storeInstance = null;
        initPromise = null;
    }
    if (!initPromise) {
        currentDbPath = dbPath;
        initPromise = (async () => {
            try {
                const { MemoryStore } = await import('@orchestra/memory');
                storeInstance = new MemoryStore(dbPath);
                await storeInstance.init();
            }
            catch (err) {
                console.warn('[memory-bridge] Could not open MemoryStore:', err);
                storeInstance = null;
            }
        })();
    }
    await initPromise;
    return storeInstance;
}
/** Return the workspace-scoped DB path, or ':memory:' as fallback. */
function resolveDbPath(workspacePath) {
    if (workspacePath) {
        return `${workspacePath}/.orchestra/memory.sqlite`;
    }
    return ':memory:';
}
/**
 * Persist a conversation turn to memory.
 * Silently no-ops if the store is unavailable.
 */
export async function persistConversationTurn(workspacePath, sessionId, role, content) {
    try {
        const dbPath = resolveDbPath(workspacePath);
        const store = await getStore(dbPath);
        if (!store)
            return;
        await store.insert({
            scope: 'session',
            kind: `${role}-message`,
            content,
            metadata: { sessionId, role, timestamp: new Date().toISOString() },
        });
    }
    catch (err) {
        console.warn('[memory-bridge] persistConversationTurn failed:', err);
    }
}
/**
 * Query recent session memories for the given workspace.
 * Returns an empty array if the store is unavailable.
 */
export async function getRecentMemory(workspacePath, _topK = 10) {
    try {
        const dbPath = resolveDbPath(workspacePath);
        const store = await getStore(dbPath);
        if (!store)
            return [];
        return await store.list('session');
    }
    catch (err) {
        console.warn('[memory-bridge] getRecentMemory failed:', err);
        return [];
    }
}
/** Close the current store (call on app quit or workspace close). */
export async function closeMemoryBridge() {
    if (storeInstance) {
        try {
            await storeInstance.close();
        }
        catch {
            // ignore
        }
        storeInstance = null;
        initPromise = null;
        currentDbPath = null;
    }
}
