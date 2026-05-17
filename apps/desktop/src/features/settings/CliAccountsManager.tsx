/**
 * CliAccountsManager — multi-account UI for a single CLI provider.
 *
 * Each profile gets its own credential directory under
 * `~/.orchestra/cli-accounts/<id>/`. Orchestra passes the dir to the CLI
 * via a per-provider env var (CLAUDE_CONFIG_DIR / CODEX_HOME / GEMINI_HOME)
 * so switching profiles is just changing which env var path gets injected —
 * no logout/login dance, no filesystem mutation.
 *
 * Add-account flow (v0.1.10):
 *   1. User types label + clicks Add
 *   2. Orchestra creates a fresh credential dir
 *   3. PTY runs `<cli> login` (with appropriate flags) against that dir
 *   4. Orchestra parses CLI output for OAuth URLs and auto-opens the first
 *      one in the user's default browser via tauri-plugin-shell
 *   5. Status badge shows "Awaiting OAuth…" until the credential dir has
 *      content; then switches to "Connected ✓"
 *   6. Background poll runs for up to 5 minutes; on timeout the row shows
 *      a "Retry" affordance
 *
 * The PTY tab is still spawned (visible in the bottom panel for debugging)
 * but the user doesn't have to interact with it.
 */

import { useState, useRef, useEffect } from 'react';
import { Plus, Trash2, Check, Pencil, X, RefreshCw, RadioReceiver, LogIn } from 'lucide-react';
import { nanoid } from 'nanoid';

import {
  useSettingsStore,
  CLI_CONFIG_ENV_VAR,
  type CliProviderId,
  type CliAccount,
} from '@/stores/settings';
import { ptySpawn, ptyKill, subscribeToPtyOutput } from '@/lib/ipc/pty';
import {
  cliAccountCreateDir,
  cliAccountRemoveDir,
  cliAccountHasCredentials,
} from '@/lib/ipc/system';

interface CliAccountsManagerProps {
  providerId: CliProviderId;
  /** Path to the CLI binary — needed so "Add account" can run `<binary> login`. */
  binaryPath: string;
}

/**
 * Per-CLI argv for the login subcommand. Some CLIs (notably Codex) refuse
 * to run outside a git repo unless told otherwise, so we pass the right
 * escape flag when needed.
 */
function loginArgs(providerId: CliProviderId): string[] {
  switch (providerId) {
    case 'claude-cli':
      return ['login'];
    case 'codex-cli':
      // `codex login` (no flags) from $HOME is sufficient — the
      // trusted-dir check only applies to interactive runs, not the
      // login subcommand. We previously passed `--skip-git-repo-check`
      // but codex 0.130+ removed that flag and now bails with
      // "unexpected argument" before printing the OAuth URL.
      return ['login'];
    case 'gemini-cli':
      return ['auth', 'login'];
  }
}

/** Background-task state per pending account. */
interface PendingState {
  ptyId: string;
  pollerId: number;
  /** 'starting' | 'awaiting-oauth' | 'connected' | 'failed' */
  status: 'starting' | 'awaiting-oauth' | 'connected' | 'failed';
  error?: string;
}

const URL_REGEX = /https?:\/\/[^\s]+/;

export function CliAccountsManager({ providerId, binaryPath }: CliAccountsManagerProps) {
  const cliAccounts = useSettingsStore((s) => s.cliAccounts);
  const activeCliAccountId = useSettingsStore((s) => s.activeCliAccountId);
  const addCliAccount = useSettingsStore((s) => s.addCliAccount);
  const removeCliAccount = useSettingsStore((s) => s.removeCliAccount);
  const setActiveCliAccount = useSettingsStore((s) => s.setActiveCliAccount);
  const renameCliAccount = useSettingsStore((s) => s.renameCliAccount);

  const accounts = cliAccounts.filter((a) => a.providerId === providerId);
  const activeId = activeCliAccountId[providerId] ?? null;
  const envVar = CLI_CONFIG_ENV_VAR[providerId];

  const [addLabel, setAddLabel] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');

  /** Per-account in-progress login state, keyed by accountId. */
  const [pending, setPending] = useState<Record<string, PendingState>>({});
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  /** Cleanup any in-flight pollers on unmount. */
  useEffect(() => {
    return () => {
      for (const p of Object.values(pendingRef.current)) {
        window.clearInterval(p.pollerId);
        ptyKill(p.ptyId).catch(() => {});
      }
    };
  }, []);

  function setAccountPending(accountId: string, patch: Partial<PendingState> | null): void {
    setPending((prev) => {
      if (patch === null) {
        const { [accountId]: _drop, ...rest } = prev;
        return rest;
      }
      const existing = prev[accountId];
      if (!existing && (!patch.ptyId || patch.pollerId === undefined || !patch.status)) {
        return prev;
      }
      const next: PendingState = existing
        ? { ...existing, ...patch }
        : ({
            ptyId: patch.ptyId!,
            pollerId: patch.pollerId!,
            status: patch.status!,
            ...patch,
          } as PendingState);
      return { ...prev, [accountId]: next };
    });
  }

  async function openInBrowser(url: string): Promise<void> {
    try {
      const { open } = await import('@tauri-apps/plugin-shell');
      await open(url);
    } catch (err) {
      console.warn('[CliAccountsManager] failed to open URL in browser:', err);
    }
  }

  async function startLogin(accountId: string, label: string, credentialDir: string): Promise<void> {
    setAccountPending(accountId, {
      ptyId: '',
      pollerId: 0,
      status: 'starting',
    });

    // Run the login from $HOME so trusted-dir checks pass (Codex insists on it).
    const { homeDir } = await import('@tauri-apps/api/path');
    const home = await homeDir();

    const ptyId = await ptySpawn(
      `${providerId}: login (${label})`,
      [binaryPath, ...loginArgs(providerId)],
      home,
      { kind: 'user' },
      { [envVar]: credentialDir },
    );

    // Subscribe to output; auto-open the first URL we see.
    let opened = false;
    const unlisten = await subscribeToPtyOutput(ptyId, (bytes) => {
      const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      if (!opened) {
        const match = text.match(URL_REGEX);
        if (match) {
          opened = true;
          void openInBrowser(match[0]);
          setAccountPending(accountId, { status: 'awaiting-oauth' });
        }
      }
    });

    // Poll the credential dir every 1.5s for up to 5 minutes.
    let attempts = 0;
    const pollerId = window.setInterval(async () => {
      attempts++;
      if (attempts > 200) {
        // ~5 min timeout
        window.clearInterval(pollerId);
        unlisten();
        await ptyKill(ptyId).catch(() => {});
        setAccountPending(accountId, { status: 'failed', error: 'Timed out waiting for login' });
        return;
      }
      try {
        const has = await cliAccountHasCredentials(accountId, providerId);
        if (has) {
          window.clearInterval(pollerId);
          unlisten();
          await ptyKill(ptyId).catch(() => {});
          setAccountPending(accountId, { status: 'connected' });
          // Auto-clear the badge after a moment.
          window.setTimeout(() => setAccountPending(accountId, null), 2500);
        }
      } catch {
        /* keep polling */
      }
    }, 1500);

    setAccountPending(accountId, { ptyId, pollerId, status: opened ? 'awaiting-oauth' : 'starting' });
  }

  async function handleAdd() {
    const label = addLabel.trim();
    if (!label) return;
    if (!binaryPath) {
      setAddError('Set the binary path above first.');
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const accountId = `${providerId}-${nanoid(8)}`;
      const credentialDir = await cliAccountCreateDir(accountId);

      // Persist immediately so the row shows up with the pending status.
      const account: CliAccount = {
        id: accountId,
        providerId,
        label,
        credentialDir,
        createdAt: new Date().toISOString(),
      };
      addCliAccount(account);
      setAddLabel('');

      await startLogin(accountId, label, credentialDir);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  }

  async function handleRetryLogin(account: CliAccount) {
    setAccountPending(account.id, null);
    if (!binaryPath) {
      setAddError('Set the binary path above first.');
      return;
    }
    try {
      await startLogin(account.id, account.label, account.credentialDir);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleRemove(account: CliAccount) {
    if (!confirm(`Remove account "${account.label}" and delete its credentials?`)) return;
    const p = pendingRef.current[account.id];
    if (p) {
      window.clearInterval(p.pollerId);
      if (p.ptyId) await ptyKill(p.ptyId).catch(() => {});
      setAccountPending(account.id, null);
    }
    try {
      await cliAccountRemoveDir(account.id);
    } catch (err) {
      console.warn('[CliAccountsManager] remove dir failed:', err);
    }
    removeCliAccount(account.id);
  }

  function commitRename() {
    if (editingId) renameCliAccount(editingId, editLabel);
    setEditingId(null);
    setEditLabel('');
  }

  return (
    <div className="space-y-2 rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/20 p-2">
      <div className="flex items-center gap-2">
        <RadioReceiver className="h-3 w-3 text-[hsl(var(--muted-foreground))]" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          Accounts
        </span>
        <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
          ({envVar} → credential dir)
        </span>
      </div>

      {accounts.length === 0 ? (
        <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
          No accounts yet. Add one below — Orchestra will open the browser for you.
        </p>
      ) : (
        <ul className="space-y-1">
          {accounts.map((a) => {
            const isActive = a.id === activeId;
            const isEditing = editingId === a.id;
            const p = pending[a.id];
            return (
              <li
                key={a.id}
                className="group flex items-center gap-2 rounded bg-[hsl(var(--background))] px-2 py-1.5 text-xs"
              >
                {isEditing ? (
                  <>
                    <input
                      autoFocus
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename();
                        if (e.key === 'Escape') {
                          setEditingId(null);
                          setEditLabel('');
                        }
                      }}
                      className="flex-1 rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
                    />
                    <button
                      onClick={commitRename}
                      className="rounded p-1 hover:bg-[hsl(var(--muted))]"
                      title="Save"
                    >
                      <Check className="h-3 w-3 text-green-400" />
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(null);
                        setEditLabel('');
                      }}
                      className="rounded p-1 hover:bg-[hsl(var(--muted))]"
                    >
                      <X className="h-3 w-3 text-[hsl(var(--muted-foreground))]" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setActiveCliAccount(providerId, a.id)}
                      className="flex flex-1 items-center gap-2 text-left"
                      title={a.credentialDir}
                    >
                      <span
                        className={
                          'inline-block h-2 w-2 shrink-0 rounded-full ' +
                          (isActive ? 'bg-green-500' : 'bg-neutral-600')
                        }
                      />
                      <span className="truncate font-medium">{a.label}</span>
                      {isActive && (
                        <span className="rounded bg-green-500/20 px-1.5 py-0 text-[9px] font-medium uppercase text-green-400">
                          active
                        </span>
                      )}
                      {p?.status === 'starting' && (
                        <span className="flex items-center gap-1 text-[10px] text-[hsl(var(--muted-foreground))]">
                          <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                          Starting…
                        </span>
                      )}
                      {p?.status === 'awaiting-oauth' && (
                        <span className="flex items-center gap-1 text-[10px] text-yellow-400">
                          <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                          Awaiting OAuth in browser…
                        </span>
                      )}
                      {p?.status === 'connected' && (
                        <span className="flex items-center gap-1 text-[10px] text-green-400">
                          <Check className="h-2.5 w-2.5" />
                          Connected
                        </span>
                      )}
                      {p?.status === 'failed' && (
                        <span className="text-[10px] text-red-400">
                          {p.error ?? 'Login failed'}
                        </span>
                      )}
                    </button>
                    {!p && (
                      <button
                        type="button"
                        onClick={() => void handleRetryLogin(a)}
                        className="rounded p-1 opacity-0 hover:bg-[hsl(var(--muted))] group-hover:opacity-100"
                        title="Sign in / re-login via browser"
                      >
                        <LogIn className="h-3 w-3" />
                      </button>
                    )}
                    {p?.status === 'failed' && (
                      <button
                        type="button"
                        onClick={() => void handleRetryLogin(a)}
                        className="flex items-center gap-1 rounded bg-yellow-500/20 px-2 py-0.5 text-[10px] text-yellow-300 hover:bg-yellow-500/30"
                        title="Retry login"
                      >
                        <LogIn className="h-3 w-3" />
                        Sign in
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(a.id);
                        setEditLabel(a.label);
                      }}
                      className="rounded p-1 opacity-0 hover:bg-[hsl(var(--muted))] group-hover:opacity-100"
                      title="Rename"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRemove(a)}
                      className="rounded p-1 opacity-0 hover:bg-[hsl(var(--muted))] hover:text-red-400 group-hover:opacity-100"
                      title="Remove account"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Add account form */}
      <div className="flex items-center gap-2 pt-1">
        <input
          type="text"
          value={addLabel}
          onChange={(e) => setAddLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleAdd();
          }}
          placeholder="New account label (e.g. Personal, Work)"
          disabled={adding}
          className="flex-1 rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
        />
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={adding || !addLabel.trim() || !binaryPath}
          className="flex items-center gap-1 rounded bg-[hsl(var(--primary))] px-2 py-1 text-xs text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-40"
        >
          {adding ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Add account
        </button>
      </div>

      {addError && <p className="text-[10px] text-red-400">{addError}</p>}
      <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
        Add account creates a fresh credential directory and runs{' '}
        <code className="font-mono">{loginArgs(providerId).join(' ')}</code>, opening
        the OAuth URL in your browser automatically. To re-login an existing account
        (token expired, or a previous login failed), hover the row and click the{' '}
        <LogIn className="inline h-2.5 w-2.5" /> icon.
      </p>
    </div>
  );
}

