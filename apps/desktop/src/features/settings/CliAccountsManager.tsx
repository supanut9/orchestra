/**
 * CliAccountsManager — multi-account UI for a single CLI provider.
 *
 * Sits inside each CLI ProviderRow in SettingsPanel. Lets the user:
 *   1. See all named profiles for this CLI
 *   2. Switch the active one (next CLI spawn uses its credential dir via
 *      a per-provider env var like CODEX_HOME)
 *   3. Add a new profile — opens a Terminal tab running `<cli> login` with
 *      the env var pointing at a fresh dir, polls for credentials to appear
 *   4. Remove a profile (deletes the credential dir too)
 *   5. Rename a profile inline
 */

import { useState, useRef } from 'react';
import { Plus, Trash2, Check, Pencil, X, RefreshCw, RadioReceiver } from 'lucide-react';
import { nanoid } from 'nanoid';

import {
  useSettingsStore,
  CLI_CONFIG_ENV_VAR,
  DEFAULT_CLI_ARGS,
  type CliProviderId,
  type CliAccount,
  type CliProviderConfig,
} from '@/stores/settings';
import { ptySpawn } from '@/lib/ipc/pty';
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

/** Best-effort login subcommand per CLI. */
const LOGIN_ARGS: Record<CliProviderId, string[]> = {
  'claude-cli': ['login'],
  'codex-cli': ['login'],
  'gemini-cli': ['auth', 'login'],
};

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
  const pollerRef = useRef<number | null>(null);

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

      // Spawn an interactive login PTY pointing at the fresh dir.
      await ptySpawn(
        `${providerId}: login (${label})`,
        [binaryPath, ...LOGIN_ARGS[providerId]],
        process.env['HOME'] ?? '/',
        { kind: 'user' },
        { [envVar]: credentialDir },
      );

      // Persist the account stub immediately so it shows in the list.
      const account: CliAccount = {
        id: accountId,
        providerId,
        label,
        credentialDir,
        createdAt: new Date().toISOString(),
      };
      addCliAccount(account);
      setAddLabel('');

      // Background-poll for the credential dir to fill up (means OAuth done).
      // No-op if it never fills — the account just stays in the list as "pending".
      let attempts = 0;
      const poll = window.setInterval(async () => {
        attempts++;
        if (attempts > 60) {
          window.clearInterval(poll);
          return;
        }
        try {
          const has = await cliAccountHasCredentials(accountId);
          if (has) {
            window.clearInterval(poll);
          }
        } catch {
          // ignore
        }
      }, 2000);
      pollerRef.current = poll;
    } catch (err) {
      setAddError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(account: CliAccount) {
    if (!confirm(`Remove account "${account.label}" and delete its credentials?`)) return;
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
          No accounts yet. Add one below to enable per-profile switching.
        </p>
      ) : (
        <ul className="space-y-1">
          {accounts.map((a) => {
            const isActive = a.id === activeId;
            const isEditing = editingId === a.id;
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
                    </button>
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
      {accounts.length > 0 && (
        <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
          Adding an account opens a terminal tab with{' '}
          <code className="font-mono">{LOGIN_ARGS[providerId].join(' ')}</code> running against
          a fresh credential directory. Complete the OAuth flow in your browser; tokens save
          into that dir. Switch the green dot to use that account on the next message.
        </p>
      )}
    </div>
  );
}

/** Wrapper that conditionally renders the manager, given the saved config. */
export function CliAccountsSection({
  providerId,
  config,
  binaryPath,
}: {
  providerId: CliProviderId;
  config: CliProviderConfig | undefined;
  binaryPath: string;
}) {
  // Allow accounts management even before the row is saved — just need a path.
  void config;
  void DEFAULT_CLI_ARGS;
  return <CliAccountsManager providerId={providerId} binaryPath={binaryPath} />;
}
