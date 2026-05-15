/**
 * Terminal — a single xterm.js pane connected to a backend PTY.
 *
 * Responsibilities:
 *   - Mount an xterm.js `Terminal` with WebGL renderer and FitAddon
 *   - Subscribe to `pty.output` events for this specific `ptyId`
 *   - Forward xterm `onData` (keystrokes / paste) to `pty_write`
 *   - Resize the PTY when the container element changes size
 *   - Expose a search bar via `SearchAddon` (Ctrl+F)
 *   - Clean up all subscriptions and xterm resources on unmount
 */

import { useEffect, useRef, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { SearchAddon } from '@xterm/addon-search';

import { subscribeToPtyOutput, encodePtyInput, ptyWrite, ptyResize } from '@/lib/ipc/pty';

import '@xterm/xterm/css/xterm.css';

// ── Props ──────────────────────────────────────────────────────────────────────

export interface TerminalProps {
  /** PTY ID returned by `pty_spawn` / `services_run_all`. */
  ptyId: string;
  /** Human-readable label (shown in the parent tab bar, not here). */
  label: string;
  /** Whether this terminal is the currently-visible tab. */
  isActive?: boolean;
  /** Called when the user clicks the close button in the parent tab. */
  onClose?: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function Terminal({ ptyId, isActive = true }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const unlistenOutputRef = useRef<(() => void) | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // ── Initialise xterm.js ──────────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      // Match the app's dark theme.
      theme: {
        background: '#0d0d0d',
        foreground: '#e8e8e8',
        cursor: '#e8e8e8',
        selectionBackground: '#3a3a5c',
        black: '#000000',
        red: '#e06c75',
        green: '#98c379',
        yellow: '#e5c07b',
        blue: '#61afef',
        magenta: '#c678dd',
        cyan: '#56b6c2',
        white: '#abb2bf',
        brightBlack: '#5c6370',
        brightRed: '#e06c75',
        brightGreen: '#98c379',
        brightYellow: '#e5c07b',
        brightBlue: '#61afef',
        brightMagenta: '#c678dd',
        brightCyan: '#56b6c2',
        brightWhite: '#ffffff',
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);

    // Try to attach the WebGL renderer; fall back gracefully to canvas if the
    // browser/WebView doesn't support it.
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
      });
      term.loadAddon(webglAddon);
    } catch {
      // WebGL unavailable — canvas renderer is used automatically.
    }

    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    // ── Forward keystrokes to the PTY ──────────────────────────────────────

    const onDataDispose = term.onData((data) => {
      ptyWrite(ptyId, encodePtyInput(data)).catch((err) => {
        console.error('[Terminal] pty_write error:', err);
      });
    });

    // ── Subscribe to backend PTY output ───────────────────────────────────

    subscribeToPtyOutput(ptyId, (bytes) => {
      term.write(bytes);
    }).then((unlisten) => {
      unlistenOutputRef.current = unlisten;
    });

    // ── Resize observer ────────────────────────────────────────────────────

    const ro = new ResizeObserver(() => {
      if (!fitAddonRef.current || !termRef.current) return;
      fitAddonRef.current.fit();
      ptyResize(ptyId, termRef.current.rows, termRef.current.cols).catch(() => {
        // Resize failures are non-fatal — the shell will adjust on next input.
      });
    });

    if (containerRef.current) {
      ro.observe(containerRef.current);
    }
    resizeObserverRef.current = ro;

    // ── Cleanup ────────────────────────────────────────────────────────────

    return () => {
      onDataDispose.dispose();
      unlistenOutputRef.current?.();
      ro.disconnect();
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
    // ptyId is stable per terminal mount; intentionally not in deps array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ptyId]);

  // ── Re-fit when tab becomes active ────────────────────────────────────────

  useEffect(() => {
    if (isActive && fitAddonRef.current && termRef.current) {
      // Slight delay to allow the DOM to fully show the container before
      // measuring its dimensions.
      requestAnimationFrame(() => {
        fitAddonRef.current?.fit();
        if (termRef.current) {
          ptyResize(ptyId, termRef.current.rows, termRef.current.cols).catch(() => {});
        }
      });
    }
  }, [isActive, ptyId]);

  // ── Keyboard shortcut: Ctrl+F → find next (simple search trigger) ───────────

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      // In production, a search input overlay should be shown here.
      // For Sprint 1, Ctrl+F triggers a browser prompt as a placeholder.
      const query = window.prompt('Search terminal:');
      if (query) {
        searchAddonRef.current?.findNext(query, { caseSensitive: false });
      }
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-hidden bg-[#0d0d0d]"
      onKeyDown={handleKeyDown}
      // Allow xterm to capture focus directly.
      tabIndex={0}
      style={{ outline: 'none' }}
    />
  );
}
