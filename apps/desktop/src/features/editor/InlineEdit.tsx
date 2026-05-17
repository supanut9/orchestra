/**
 * InlineEdit — Cursor-style Cmd+I "inline AI edit" widget.
 *
 * Mounts as an absolutely-positioned overlay anchored to the current editor
 * selection. The user types an instruction ("rename to fooBar", "add error
 * handling", etc.); the active AI provider streams a replacement; the user
 * Accepts to apply or Rejects to close.
 *
 * Routing:
 *   - Uses provider-registry's `streamMessage`, so CLI providers AND Vercel
 *     AI SDK providers both work (CLI providers don't use tools — fine here).
 *
 * Prompt strategy:
 *   - Sends the full file (capped at 8 KB) for context, plus the selected
 *     range explicitly. Model is asked to reply with ONLY the replacement
 *     code (no markdown fences, no prose).
 */

import { useEffect, useRef, useState } from 'react';
import { Sparkles, Check, X, RotateCw, AlertCircle } from 'lucide-react';
import { streamMessage } from '@/lib/ai/provider-registry';
import { useSettingsStore } from '@/stores/settings';

export interface InlineEditAnchor {
  /** Viewport coords where the widget should be placed (top-left). */
  top: number;
  left: number;
}

export interface InlineEditProps {
  /** Where to anchor the widget on screen. */
  anchor: InlineEditAnchor;
  /** Currently-selected text — what the model will rewrite. Empty string when
   *  the user invoked Cmd+I with no selection (then we treat it as "insert here"). */
  selection: string;
  /** Full file content for context. */
  fullFile: string;
  /** File path (gives the model language + intent cues). */
  filePath: string;
  /** Called with the accepted replacement text. */
  onAccept: (replacement: string) => void;
  /** Called when the user dismisses without applying. */
  onCancel: () => void;
}

const MAX_CONTEXT_BYTES = 8 * 1024;

type Status = 'idle' | 'streaming' | 'done' | 'error';

export function InlineEdit({
  anchor,
  selection,
  fullFile,
  filePath,
  onAccept,
  onCancel,
}: InlineEditProps) {
  const activeProviderId = useSettingsStore((s) => s.activeProviderId);
  const providers = useSettingsStore((s) => s.providers);
  const config = activeProviderId ? providers[activeProviderId] : undefined;

  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Focus the prompt input on mount.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ESC to dismiss anywhere on the page while the widget is open.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        abortRef.current?.abort();
        onCancel();
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  async function run() {
    if (!prompt.trim() || !config) return;
    setStatus('streaming');
    setError(null);
    setResponse('');

    const abort = new AbortController();
    abortRef.current = abort;

    const contextFile =
      fullFile.length <= MAX_CONTEXT_BYTES
        ? fullFile
        : `${fullFile.slice(0, MAX_CONTEXT_BYTES / 2)}\n…(truncated)…\n${fullFile.slice(-MAX_CONTEXT_BYTES / 2)}`;

    const userMessage = [
      `You are an inline code editor inside Orchestra IDE.`,
      `Edit the SELECTED code below based on the user's instruction.`,
      `Reply with ONLY the new code that should replace the selection — no markdown fences, no prose, no explanation, no leading or trailing whitespace beyond what's needed.`,
      ``,
      `File: ${filePath}`,
      ``,
      `--- Full file (for context) ---`,
      contextFile,
      `--- End file ---`,
      ``,
      selection
        ? `--- Selected code (what you must replace) ---\n${selection}\n--- End selection ---`
        : `(No selection — the user wants you to INSERT code at the cursor.)`,
      ``,
      `User instruction: ${prompt.trim()}`,
      ``,
      `Reply now with ONLY the replacement code:`,
    ].join('\n');

    try {
      let collected = '';
      await streamMessage({
        config,
        messages: [{ role: 'user', content: userMessage }],
        onChunk: (chunk) => {
          collected += chunk;
          setResponse(collected);
        },
        signal: abort.signal,
      });
      setStatus('done');
    } catch (err) {
      if (abort.signal.aborted) return;
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function stripFences(s: string): string {
    // Strip leading/trailing markdown code fences if the model insists on
    // emitting them despite our instruction.
    return s
      .replace(/^\s*```[a-zA-Z0-9_-]*\s*\n/, '')
      .replace(/\n\s*```\s*$/, '')
      .replace(/^\s*```\s*\n?/, '')
      .replace(/```\s*$/, '');
  }

  function handleAccept() {
    onAccept(stripFences(response));
  }

  function handleRetry() {
    setResponse('');
    setStatus('idle');
    setError(null);
    void run();
  }

  // Position widget — clamp so it stays on screen.
  const clampedTop = Math.max(8, Math.min(window.innerHeight - 360, anchor.top));
  const clampedLeft = Math.max(8, Math.min(window.innerWidth - 520, anchor.left));

  return (
    <div
      role="dialog"
      aria-label="Inline AI edit"
      className="fixed z-50 w-[500px] rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-2xl"
      style={{ top: clampedTop, left: clampedLeft }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 border-b border-[hsl(var(--border))] px-3 py-2">
        <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />
        <span className="text-xs font-semibold">Edit with AI</span>
        <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
          {selection ? `${selection.split('\n').length} lines selected` : 'cursor position'}
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto rounded p-1 hover:bg-[hsl(var(--muted))]"
          title="Cancel (Esc)"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Prompt input */}
      <div className="p-3">
        {!config && (
          <div className="mb-2 flex items-start gap-1.5 rounded border border-yellow-500/30 bg-yellow-500/10 px-2 py-1.5 text-[11px] text-yellow-300">
            <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>Configure a provider in Settings to enable inline edits.</span>
          </div>
        )}
        <textarea
          ref={inputRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            selection
              ? 'How should this code be changed? (Cmd+Enter to run)'
              : 'What should be inserted here? (Cmd+Enter to run)'
          }
          rows={2}
          disabled={status === 'streaming'}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              if (status !== 'streaming') void run();
            }
          }}
          className="w-full resize-none rounded border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))] disabled:opacity-50"
        />
        <div className="mt-1.5 flex items-center justify-end gap-2">
          <span className="mr-auto text-[10px] text-[hsl(var(--muted-foreground))]">
            {status === 'streaming' ? 'Generating…' : 'Cmd+Enter to run · Esc to cancel'}
          </span>
          {status === 'idle' && (
            <button
              type="button"
              onClick={() => void run()}
              disabled={!prompt.trim() || !config}
              className="rounded bg-[hsl(var(--primary))] px-3 py-1 text-xs font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-40 hover:opacity-90"
            >
              Generate
            </button>
          )}
          {status === 'streaming' && (
            <button
              type="button"
              onClick={() => {
                abortRef.current?.abort();
                setStatus('idle');
              }}
              className="rounded bg-[hsl(var(--muted))] px-3 py-1 text-xs"
            >
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Streaming response preview */}
      {(status === 'streaming' || status === 'done' || status === 'error') && (
        <div className="border-t border-[hsl(var(--border))]">
          {error ? (
            <div className="px-3 py-2 text-xs text-red-300">{error}</div>
          ) : (
            <pre className="max-h-64 overflow-auto bg-[hsl(var(--muted))]/30 px-3 py-2 text-[11px] leading-relaxed font-mono whitespace-pre-wrap">
              {stripFences(response) || ' '}
            </pre>
          )}
          {status === 'done' && (
            <div className="flex items-center justify-end gap-2 border-t border-[hsl(var(--border))] px-3 py-2">
              <button
                type="button"
                onClick={handleRetry}
                className="flex items-center gap-1 rounded bg-[hsl(var(--muted))] px-2 py-1 text-xs hover:bg-[hsl(var(--muted))]/80"
              >
                <RotateCw className="h-3 w-3" /> Retry
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="rounded bg-[hsl(var(--muted))] px-3 py-1 text-xs hover:bg-[hsl(var(--muted))]/80"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={handleAccept}
                className="flex items-center gap-1 rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
              >
                <Check className="h-3 w-3" /> Accept
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
