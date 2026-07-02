import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';

// Background sync (SYNC.md): pull-merge when a file-bound project opens/switches,
// push-merge a few seconds after the user stops editing, and poll so a push from
// another device lands here within ~POLL_MS. `syncNow()` is a no-op when nothing
// changed (fingerprint match) and refuses to clobber edits made while a request is in
// flight — so none of this disturbs local state needlessly.

const DEBOUNCE_MS = 4000;
const ON_OPEN_MS = 400;
const POLL_MS = 15000;

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

  // Poll the server's cheap `/version`; pull only when it advances past what we last
  // saw — i.e. another device pushed. Baselines (no pull) on first tick / project switch.
  const lastSeen = useRef<{ id: string; version: string | null }>({ id: '', version: null });
  useEffect(() => {
    if (!active) return;
    const tick = async () => {
      const store = useStore.getState();
      const version = await store.fetchRemoteVersion();
      if (version === null) return;
      if (lastSeen.current.id !== projectId) {
        lastSeen.current = { id: projectId, version }; // baseline after mount/switch
        return;
      }
      if (version !== lastSeen.current.version) {
        await store.syncNow();
        // Adopt the post-sync version so our own resulting push doesn't re-trigger.
        lastSeen.current = { id: projectId, version: (await store.fetchRemoteVersion()) ?? version };
      }
    };
    const iv = setInterval(() => void tick(), POLL_MS);
    return () => clearInterval(iv);
  }, [active, projectId]);
}
