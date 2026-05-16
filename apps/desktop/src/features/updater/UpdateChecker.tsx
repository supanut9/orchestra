/**
 * UpdateChecker — header badge that polls for new Orchestra releases.
 *
 * Behaviour:
 *   - On mount, after a 5s delay, calls `check()` against the manifest URL
 *     configured in `tauri.conf.json` (currently the latest GitHub release).
 *   - If a newer version is available, shows a pill in the header. Clicking
 *     opens a modal with release notes + Install / Later buttons.
 *   - Install downloads + installs + restarts the app.
 *   - Re-checks every 6 hours while the app is open.
 */

import { useEffect, useState, useCallback } from 'react';
import { Download, RefreshCw, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UpdateInfo {
  version: string;
  notes?: string | undefined;
  date?: string | undefined;
}

type Status = 'idle' | 'checking' | 'available' | 'downloading' | 'error' | 'up-to-date';

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h
const INITIAL_DELAY_MS = 5_000;

export function UpdateChecker() {
  const [status, setStatus] = useState<Status>('idle');
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<{ downloaded: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const checkForUpdates = useCallback(async (silent = false) => {
    if (!silent) setStatus('checking');
    setError(null);
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (update) {
        setInfo({
          version: update.version,
          notes: update.body ?? undefined,
          date: update.date ?? undefined,
        });
        setStatus('available');
      } else {
        setStatus('up-to-date');
      }
    } catch (err) {
      // Most common: not running inside Tauri (vitest, Storybook).
      if (!silent) setError(err instanceof Error ? err.message : String(err));
      setStatus(silent ? 'idle' : 'error');
    }
  }, []);

  // Initial check + periodic poll.
  useEffect(() => {
    const initial = window.setTimeout(() => {
      void checkForUpdates(true);
    }, INITIAL_DELAY_MS);
    const interval = window.setInterval(() => {
      void checkForUpdates(true);
    }, CHECK_INTERVAL_MS);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [checkForUpdates]);

  const installUpdate = useCallback(async () => {
    setStatus('downloading');
    setError(null);
    setProgress({ downloaded: 0, total: 0 });
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const { relaunch } = await import('@tauri-apps/plugin-process');
      const update = await check();
      if (!update) {
        setStatus('up-to-date');
        return;
      }
      let downloaded = 0;
      let contentLength = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          contentLength = event.data.contentLength ?? 0;
          setProgress({ downloaded: 0, total: contentLength });
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          setProgress({ downloaded, total: contentLength });
        }
      });
      await relaunch();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, []);

  if (status !== 'available' && status !== 'downloading' && !open) return null;

  return (
    <>
      {/* Header pill */}
      {(status === 'available' || status === 'downloading') && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            'flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium',
            'border border-green-500/30 bg-green-500/15 text-green-300',
            'hover:bg-green-500/25 transition-colors',
          )}
          title={`Update to ${info?.version} available`}
        >
          {status === 'downloading' ? (
            <RefreshCw className="h-3 w-3 animate-spin" />
          ) : (
            <Download className="h-3 w-3" />
          )}
          <span>{status === 'downloading' ? 'Updating…' : `Update ${info?.version} →`}</span>
        </button>
      )}

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start gap-2">
              <Download className="mt-0.5 h-5 w-5 text-green-400" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold">Update Available</h3>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Orchestra <strong>{info?.version}</strong> is available.{' '}
                  {info?.date && (
                    <span className="text-[hsl(var(--muted-foreground))]">
                      Released {info.date}.
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-1 hover:bg-[hsl(var(--muted))]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {info?.notes && (
              <div className="mb-4 max-h-48 overflow-y-auto rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 p-3 text-xs whitespace-pre-wrap">
                {info.notes}
              </div>
            )}

            {status === 'downloading' && progress && (
              <div className="mb-3">
                <div className="mb-1 flex justify-between text-[10px] text-[hsl(var(--muted-foreground))]">
                  <span>Downloading…</span>
                  <span>
                    {(progress.downloaded / 1024 / 1024).toFixed(1)} /{' '}
                    {(progress.total / 1024 / 1024).toFixed(1)} MB
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
                  <div
                    className="h-full bg-green-500 transition-all"
                    style={{
                      width: progress.total
                        ? `${(progress.downloaded / progress.total) * 100}%`
                        : '0%',
                    }}
                  />
                </div>
              </div>
            )}

            {error && (
              <p className="mb-3 rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={status === 'downloading'}
                className="rounded px-3 py-1.5 text-xs text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] disabled:opacity-50"
              >
                Later
              </button>
              <button
                type="button"
                onClick={() => void installUpdate()}
                disabled={status === 'downloading'}
                className="rounded bg-[hsl(var(--primary))] px-3 py-1.5 text-xs font-medium text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50"
              >
                {status === 'downloading' ? 'Installing…' : 'Install & Restart'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
