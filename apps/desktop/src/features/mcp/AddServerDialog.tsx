/**
 * AddServerDialog.tsx
 *
 * Modal form to add a new MCP server entry. Supports all fields defined in
 * MCPServerConfigSchema: command, args (string list), env (k/v pairs),
 * transport (stdio | sse | http), and enabled flag.
 *
 * The optional `prefill` prop lets ServerCatalog pre-populate fields from a
 * catalog entry, so the user just reviews and confirms.
 */

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { MCPServerConfig } from '@orchestra/mcp-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KVPair {
  key: string;
  value: string;
}

export interface AddServerDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (id: string, config: MCPServerConfig) => void;
  prefill?: {
    id?: string;
    command?: string;
    args?: string[];
    transport?: 'stdio' | 'sse' | 'http';
    description?: string;
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AddServerDialog({ open, onClose, onAdd, prefill }: AddServerDialogProps) {
  const [id, setId] = useState('');
  const [command, setCommand] = useState('');
  const [argsRaw, setArgsRaw] = useState('');
  const [envPairs, setEnvPairs] = useState<KVPair[]>([{ key: '', value: '' }]);
  const [transport, setTransport] = useState<'stdio' | 'sse' | 'http'>('stdio');
  const [enabled, setEnabled] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Apply prefill when dialog opens or prefill changes
  useEffect(() => {
    if (open && prefill) {
      if (prefill.id) setId(prefill.id);
      if (prefill.command) setCommand(prefill.command);
      if (prefill.args) setArgsRaw(prefill.args.join(' '));
      if (prefill.transport) setTransport(prefill.transport);
    }
    if (!open) {
      // Reset on close
      setId('');
      setCommand('');
      setArgsRaw('');
      setEnvPairs([{ key: '', value: '' }]);
      setTransport('stdio');
      setEnabled(true);
      setErrors({});
    }
  }, [open, prefill]);

  if (!open) return null;

  // ── Env pair helpers ──

  function updateEnvKey(idx: number, key: string) {
    setEnvPairs((prev) => prev.map((p, i) => (i === idx ? { ...p, key } : p)));
  }

  function updateEnvValue(idx: number, value: string) {
    setEnvPairs((prev) => prev.map((p, i) => (i === idx ? { ...p, value } : p)));
  }

  function addEnvPair() {
    setEnvPairs((prev) => [...prev, { key: '', value: '' }]);
  }

  function removeEnvPair(idx: number) {
    setEnvPairs((prev) => prev.filter((_, i) => i !== idx));
  }

  // ── Validation & submit ──

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!id.trim()) errs['id'] = 'ID is required';
    else if (!/^[a-zA-Z0-9_-]+$/.test(id.trim()))
      errs['id'] = 'Only letters, numbers, _ and - allowed';
    if (!command.trim()) errs['command'] = 'Command is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;

    const args = argsRaw.trim().split(/\s+/).filter(Boolean);

    const env: Record<string, string> = {};
    for (const { key, value } of envPairs) {
      if (key.trim()) env[key.trim()] = value;
    }

    const config: MCPServerConfig = {
      command: command.trim(),
      args: args.length > 0 ? args : undefined,
      env: Object.keys(env).length > 0 ? env : undefined,
      transport,
      enabled,
    };

    onAdd(id.trim(), config);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add MCP Server"
        className="relative z-10 w-[540px] max-h-[90vh] overflow-y-auto rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-5 py-4">
          <h2 className="text-sm font-semibold">Add MCP Server</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"
            aria-label="Close dialog"
          >
            <XIcon />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          {/* ID */}
          <Field label="Server ID" error={errors['id']} required>
            <input
              className={inputCls(!!errors['id'])}
              placeholder="e.g. filesystem"
              value={id}
              onChange={(e) => setId(e.target.value)}
              autoFocus
            />
          </Field>

          {/* Command */}
          <Field label="Command" error={errors['command']} required>
            <input
              className={inputCls(!!errors['command'])}
              placeholder="e.g. npx"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
            />
          </Field>

          {/* Args */}
          <Field label="Arguments" hint="Space-separated; shell quoting not supported">
            <input
              className={inputCls(false)}
              placeholder="e.g. -y @modelcontextprotocol/server-filesystem /path"
              value={argsRaw}
              onChange={(e) => setArgsRaw(e.target.value)}
            />
          </Field>

          {/* Transport */}
          <Field label="Transport">
            <div className="flex gap-2">
              {(['stdio', 'sse', 'http'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTransport(t)}
                  className={cn(
                    'rounded border px-3 py-1 text-xs font-medium transition-colors',
                    transport === t
                      ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                      : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </Field>

          {/* Env vars */}
          <Field label="Environment Variables">
            <div className="space-y-2">
              {envPairs.map((pair, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    className={cn(inputCls(false), 'flex-1')}
                    placeholder="KEY"
                    value={pair.key}
                    onChange={(e) => updateEnvKey(idx, e.target.value)}
                  />
                  <input
                    className={cn(inputCls(false), 'flex-1')}
                    placeholder="value"
                    value={pair.value}
                    onChange={(e) => updateEnvValue(idx, e.target.value)}
                  />
                  <button
                    onClick={() => removeEnvPair(idx)}
                    className="rounded p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"
                    aria-label="Remove env var"
                  >
                    <XIcon size={14} />
                  </button>
                </div>
              ))}
              <button
                onClick={addEnvPair}
                className="text-xs text-[hsl(var(--primary))] hover:underline"
              >
                + Add variable
              </button>
            </div>
          </Field>

          {/* Enabled */}
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="accent-[hsl(var(--primary))]"
            />
            <span>Enabled on startup</span>
          </label>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-[hsl(var(--border))] px-5 py-3">
          <button
            onClick={onClose}
            className="rounded px-4 py-1.5 text-sm text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="rounded bg-[hsl(var(--primary))] px-4 py-1.5 text-sm font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90"
          >
            Add Server
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface FieldProps {
  label: string;
  children: React.ReactNode;
  error?: string | undefined;
  hint?: string | undefined;
  required?: boolean;
}

function Field({ label, children, error, hint, required }: FieldProps) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-[hsl(var(--foreground))]">
        {label}
        {required && <span className="ml-0.5 text-[hsl(var(--destructive))]">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-[hsl(var(--muted-foreground))]">{hint}</p>}
      {error && <p className="text-xs text-[hsl(var(--destructive))]">{error}</p>}
    </div>
  );
}

function inputCls(hasError: boolean) {
  return cn(
    'w-full rounded border bg-[hsl(var(--background))] px-3 py-1.5 text-sm outline-none',
    'focus:ring-1 focus:ring-[hsl(var(--ring))] transition-shadow',
    hasError ? 'border-[hsl(var(--destructive))]' : 'border-[hsl(var(--border))]',
  );
}

interface XIconProps {
  size?: number;
}

function XIcon({ size = 16 }: XIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <line x1="3" y1="3" x2="13" y2="13" />
      <line x1="13" y1="3" x2="3" y2="13" />
    </svg>
  );
}
