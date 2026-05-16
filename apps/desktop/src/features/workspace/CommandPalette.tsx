import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface PaletteCommand {
  id: string;
  title: string;
  hint?: string;
  group?: string;
  run: () => void | Promise<void>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  commands: PaletteCommand[];
}

function score(query: string, title: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = title.toLowerCase();
  if (t === q) return 1000;
  if (t.startsWith(q)) return 500;
  const idx = t.indexOf(q);
  if (idx >= 0) return 200 - idx;
  let qi = 0;
  let last = -1;
  let gaps = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      if (last >= 0) gaps += i - last - 1;
      last = i;
      qi++;
    }
  }
  return qi === q.length ? 100 - Math.min(gaps, 99) : 0;
}

export function CommandPalette({ open, onClose, commands }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    return commands
      .map((c) => ({ cmd: c, s: score(query, c.title) }))
      .filter((m) => m.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 50)
      .map((m) => m.cmd);
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = matches[selected];
      if (cmd) {
        onClose();
        void cmd.run();
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[15vh]"
      onClick={onClose}
    >
      <div
        className="w-[560px] max-w-[90vw] overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a command…"
          className="w-full border-b border-[hsl(var(--border))] bg-transparent px-4 py-3 text-sm text-[hsl(var(--foreground))] outline-none placeholder:text-[hsl(var(--muted-foreground))]"
        />
        <div className="max-h-[50vh] overflow-y-auto py-1">
          {matches.length === 0 ? (
            <div className="px-4 py-3 text-xs text-[hsl(var(--muted-foreground))]">
              No commands match.
            </div>
          ) : (
            matches.map((cmd, i) => (
              <button
                key={cmd.id}
                type="button"
                onMouseEnter={() => setSelected(i)}
                onClick={() => {
                  onClose();
                  void cmd.run();
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm',
                  i === selected
                    ? 'bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]'
                    : 'text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]',
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {cmd.group && (
                    <span className="shrink-0 text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                      {cmd.group}
                    </span>
                  )}
                  <span className="truncate">{cmd.title}</span>
                </span>
                {cmd.hint && (
                  <span className="shrink-0 text-xs text-[hsl(var(--muted-foreground))]">
                    {cmd.hint}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
        <div className="flex items-center justify-between border-t border-[hsl(var(--border))] px-3 py-1.5 text-[10px] text-[hsl(var(--muted-foreground))]">
          <span>↑↓ navigate · ↵ run · esc close</span>
          <span>{matches.length} result{matches.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </div>
  );
}
