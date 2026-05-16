/**
 * VersionBadge — small "vX.Y.Z" pill in the header.
 *
 * Reads from `@tauri-apps/api/app`'s `getVersion()`, which returns the
 * `version` field from `tauri.conf.json` at build time. Falls back to
 * `import.meta.env.VITE_APP_VERSION` or "dev" outside the Tauri runtime.
 */

import { useEffect, useState } from 'react';

export function VersionBadge() {
  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { getVersion } = await import('@tauri-apps/api/app');
        const v = await getVersion();
        if (!cancelled) setVersion(v);
      } catch {
        if (!cancelled) setVersion('dev');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!version) return null;

  return (
    <span
      className="rounded bg-[hsl(var(--muted))] px-1.5 py-0.5 text-[10px] font-mono text-[hsl(var(--muted-foreground))]"
      title="Orchestra version"
    >
      v{version}
    </span>
  );
}
