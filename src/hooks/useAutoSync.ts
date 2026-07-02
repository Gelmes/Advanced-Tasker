import { useEffect } from 'react';
import { useStore } from '../store/useStore';

// Background sync (SYNC.md): pull-merge when a file-bound project opens/switches, and
// push-merge a few seconds after the user stops editing. `syncNow()` is a no-op when
// nothing actually changed (fingerprint match) and refuses to clobber edits made
// while a request is in flight — so this never disturbs local state needlessly.

const DEBOUNCE_MS = 4000;
const ON_OPEN_MS = 400;

export function useAutoSync() {
  const projectId = useStore((s) => s.project.id);
  const fileName = useStore((s) => s.fileName);
  const editRev = useStore((s) => s.editRev);
  const configured = useStore((s) => !!s.syncUrl && !!s.syncToken);

  // Only sync real, file-bound projects — never the throwaway in-memory "Untitled".
  const active = configured && !!fileName;

  // On open / switch: one sync shortly after the project is shown.
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => void useStore.getState().syncNow(), ON_OPEN_MS);
    return () => clearTimeout(t);
  }, [active, projectId]);

  // Debounced push after the user stops editing.
  useEffect(() => {
    if (!active || editRev === 0) return;
    const t = setTimeout(() => void useStore.getState().syncNow(), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [active, editRev]);
}
