import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';

// Watch the bound file for external edits (SPEC.md §5). Agents/scripts editing
// the .json on disk are just another "device": when lastModified moves, the store
// re-reads the file and MERGES it into the in-memory project (same engine as
// sync), so outside changes appear live and are never clobbered by autosave.
// Polling file metadata is the portable choice — the File System Access API has
// no change events in stable Chromium.

const POLL_MS = 3000;

export function useFileWatch() {
  const fileName = useStore((s) => s.fileName);
  const lastMtime = useRef<number | null>(null);

  useEffect(() => {
    lastMtime.current = null; // new binding — baseline on the first tick
    if (!fileName) return;

    const tick = async () => {
      const { fileHandle, saving, reloadFromDisk } = useStore.getState();
      if (!fileHandle || saving) return;
      try {
        const f = await fileHandle.getFile();
        if (lastMtime.current == null) {
          lastMtime.current = f.lastModified; // baseline: just loaded/saved
          return;
        }
        if (f.lastModified !== lastMtime.current) {
          lastMtime.current = f.lastModified;
          await reloadFromDisk(); // no-ops when the change was our own write
        }
      } catch {
        // Permission lapse or transient FS error — autosave surfaces real issues.
      }
    };

    const iv = setInterval(() => void tick(), POLL_MS);
    // Also check immediately when the window regains focus — the common case is
    // an agent edited the file while you were in another window.
    const onFocus = () => void tick();
    (globalThis as any).addEventListener?.('focus', onFocus);
    return () => {
      clearInterval(iv);
      (globalThis as any).removeEventListener?.('focus', onFocus);
    };
  }, [fileName]);
}
