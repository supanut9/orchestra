/**
 * Editor — CodeMirror 6 integration (Lane A).
 *
 * Features:
 * - One Dark theme
 * - Language detection by file extension (JS/TS/JSX/TSX → lang-javascript)
 * - Loads file content from the workspace store / `fs_read_file` when
 *   `activeFilePath` changes
 * - Saves on Cmd/Ctrl+S via `fs_write_file`
 * - Dirty-state indicator in the tab header
 * - Empty state when no file is selected
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorView, keymap, highlightActiveLine, lineNumbers } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { oneDark } from '@codemirror/theme-one-dark';
import { javascript } from '@codemirror/lang-javascript';
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  foldGutter,
  indentOnInput,
} from '@codemirror/language';
import { File as FileIcon } from 'lucide-react';
import { fsReadFile, fsWriteFile } from '@/lib/ipc';
import { useWorkspaceStore } from '@/stores/workspace';
import { cn } from '@/lib/utils';
import { InlineEdit, type InlineEditAnchor } from './InlineEdit';

// ── Language detection ────────────────────────────────────────────────────────

type LangExtension = ReturnType<typeof javascript>;

function detectLanguage(path: string): LangExtension | null {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'js':
      return javascript();
    case 'jsx':
      return javascript({ jsx: true });
    case 'ts':
      return javascript({ typescript: true });
    case 'tsx':
      return javascript({ jsx: true, typescript: true });
    default:
      return null;
  }
}

// ── Base CodeMirror extensions (language-independent) ─────────────────────────

function baseExtensions() {
  return [
    lineNumbers(),
    highlightActiveLine(),
    history(),
    foldGutter(),
    indentOnInput(),
    bracketMatching(),
    highlightSelectionMatches(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    EditorView.lineWrapping,
    oneDark,
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
    // Theme overrides: transparent background so the parent div controls it.
    EditorView.theme({
      '&': { height: '100%' },
      '.cm-scroller': {
        overflow: 'auto',
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Menlo', monospace",
        fontSize: '13px',
      },
      '.cm-content': { paddingTop: '8px', paddingBottom: '8px' },
    }),
  ];
}

// ── Editor component ──────────────────────────────────────────────────────────

export function Editor() {
  const activeFilePath = useWorkspaceStore((s) => s.activeFilePath);
  const openFiles = useWorkspaceStore((s) => s.openFiles);
  const setFileContents = useWorkspaceStore((s) => s.setFileContents);
  const markDirty = useWorkspaceStore((s) => s.markDirty);
  const getFileContent = useWorkspaceStore((s) => s.getFileContent);
  const dirtyFiles = useWorkspaceStore((s) => s.dirtyFiles);
  const closeFile = useWorkspaceStore((s) => s.closeFile);
  const setActiveFile = useWorkspaceStore((s) => s.setActiveFile);

  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Inline AI edit (Cmd+I) state.
  const [inlineEdit, setInlineEdit] = useState<{
    anchor: InlineEditAnchor;
    selection: string;
    fullFile: string;
    range: { from: number; to: number };
  } | null>(null);

  // Track the path the current view was initialized for (avoid redundant resets).
  const loadedPathRef = useRef<string | null>(null);

  // ── Build / update EditorView when activeFilePath changes ─────────────────
  useEffect(() => {
    if (!editorContainerRef.current) return;

    if (!activeFilePath) {
      // No file selected — destroy existing view.
      viewRef.current?.destroy();
      viewRef.current = null;
      loadedPathRef.current = null;
      return;
    }

    if (loadedPathRef.current === activeFilePath) {
      // Same file — nothing to do.
      return;
    }

    setLoadError(null);
    loadedPathRef.current = activeFilePath;

    const cachedContent = getFileContent(activeFilePath);

    function initView(content: string) {
      // Destroy old view.
      viewRef.current?.destroy();

      const langExt = detectLanguage(activeFilePath!);
      const extensions = [
        ...baseExtensions(),
        ...(langExt ? [langExt] : []),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newContent = update.state.doc.toString();
            setFileContents(activeFilePath!, newContent);
            markDirty(activeFilePath!, true);
          }
        }),
      ];

      const state = EditorState.create({ doc: content, extensions });
      const view = new EditorView({
        state,
        parent: editorContainerRef.current!,
      });
      viewRef.current = view;
    }

    if (cachedContent !== undefined) {
      initView(cachedContent);
    } else {
      // Load from disk.
      fsReadFile(activeFilePath)
        .then((content) => {
          setFileContents(activeFilePath, content);
          // Only init view if this path is still active.
          if (loadedPathRef.current === activeFilePath) {
            initView(content);
          }
        })
        .catch((err: unknown) => {
          if (loadedPathRef.current === activeFilePath) {
            setLoadError(String(err));
          }
        });
    }

    return () => {
      // Cleanup handled in the next invocation or unmount.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilePath]);

  // Destroy view on unmount.
  useEffect(() => {
    return () => {
      viewRef.current?.destroy();
    };
  }, []);

  // ── Save on Cmd/Ctrl+S ────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!activeFilePath) return;
    const content = getFileContent(activeFilePath);
    if (content === undefined) return;

    setSaving(true);
    try {
      await fsWriteFile(activeFilePath, content);
      markDirty(activeFilePath, false);
    } catch (err) {
      console.error('[Editor] save failed:', err);
    } finally {
      setSaving(false);
    }
  }, [activeFilePath, getFileContent, markDirty]);

  // ── Open inline edit widget (Cmd+I) ───────────────────────────────────────
  const openInlineEdit = useCallback(() => {
    const view = viewRef.current;
    if (!view || !activeFilePath) return;
    const { state } = view;
    const sel = state.selection.main;
    const fullFile = state.doc.toString();
    const selection = state.sliceDoc(sel.from, sel.to);

    // Find on-screen coordinates for the selection anchor.
    const coords = view.coordsAtPos(sel.from);
    const editorRect = view.dom.getBoundingClientRect();
    const top = coords ? coords.bottom + 4 : editorRect.top + 40;
    const left = coords ? coords.left : editorRect.left + 40;

    setInlineEdit({
      anchor: { top, left },
      selection,
      fullFile,
      range: { from: sel.from, to: sel.to },
    });
  }, [activeFilePath]);

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        void handleSave();
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'i' || e.key === 'I')) {
        const view = viewRef.current;
        if (view && (view.hasFocus || document.activeElement === view.contentDOM)) {
          e.preventDefault();
          openInlineEdit();
        }
      }
    }
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [handleSave, openInlineEdit]);

  function applyInlineEdit(replacement: string) {
    const view = viewRef.current;
    if (!view || !inlineEdit) return;
    view.dispatch({
      changes: {
        from: inlineEdit.range.from,
        to: inlineEdit.range.to,
        insert: replacement,
      },
      selection: { anchor: inlineEdit.range.from + replacement.length },
    });
    view.focus();
    setInlineEdit(null);
  }

  const _fileName = activeFilePath?.split('/').pop() ?? activeFilePath ?? '';
  const isDirty = activeFilePath ? dirtyFiles.includes(activeFilePath) : false;

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!activeFilePath) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-2 text-[hsl(var(--muted-foreground))]">
        <FileIcon className="h-8 w-8 opacity-30" />
        <p className="text-sm">Select a file to start editing</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Tab / header bar */}
      <div className="flex items-center gap-1 h-8 px-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] shrink-0 overflow-x-auto">
        {openFiles.map((f) => {
          const tabName = f.path.split('/').pop() ?? f.path;
          const tabDirty = dirtyFiles.includes(f.path);
          const isActive = f.path === activeFilePath;
          return (
            <div
              key={f.path}
              className={cn(
                'flex items-center gap-1 px-2 h-full text-xs border-r border-[hsl(var(--border))] cursor-pointer shrink-0',
                'hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--accent-foreground))]',
                isActive && 'bg-[hsl(var(--background))] text-[hsl(var(--foreground))]',
              )}
              onClick={() => setActiveFile(f.path)}
            >
              <span className={cn(tabDirty && 'text-yellow-400')}>{tabName}</span>
              {tabDirty && <span className="text-yellow-400 text-[10px]">●</span>}
              <button
                type="button"
                className="ml-1 rounded hover:text-red-400 opacity-60 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  closeFile(f.path);
                }}
              >
                ×
              </button>
            </div>
          );
        })}
        {saving && (
          <span className="ml-auto text-xs text-[hsl(var(--muted-foreground))] shrink-0 pr-1">
            Saving…
          </span>
        )}
      </div>

      {/* File path breadcrumb */}
      <div className="flex items-center h-6 px-3 bg-[hsl(var(--card))] border-b border-[hsl(var(--border))] shrink-0">
        <span className="text-[10px] text-[hsl(var(--muted-foreground))] truncate">
          {activeFilePath}
          {isDirty && (
            <span className="ml-1 text-yellow-400" title="Unsaved changes">
              (modified)
            </span>
          )}
        </span>
      </div>

      {/* CodeMirror mount point */}
      {loadError ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-red-400 break-all">Failed to load file: {loadError}</p>
        </div>
      ) : (
        <div
          ref={editorContainerRef}
          className="flex-1 min-h-0 overflow-hidden"
          style={{ height: '100%' }}
        />
      )}

      {/* Inline AI edit overlay (Cmd+I) */}
      {inlineEdit && activeFilePath && (
        <InlineEdit
          anchor={inlineEdit.anchor}
          selection={inlineEdit.selection}
          fullFile={inlineEdit.fullFile}
          filePath={activeFilePath}
          onAccept={applyInlineEdit}
          onCancel={() => setInlineEdit(null)}
        />
      )}
    </div>
  );
}
