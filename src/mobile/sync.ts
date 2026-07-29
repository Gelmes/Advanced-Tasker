// Mobile sync orchestration (MOBILE.md "Mobile sync loop"). Reuses the store's
// syncNow()/fetchRemoteVersion() (plain fetch — fully portable) and wraps them
// with the mobile rhythm: sync on open, on app foreground, debounced after
// edits, and a version poll while a project is open. Every adoption of server
// state also lands in the local cache so the app works offline.

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useStore } from '../store/useStore';
import { parseProject } from '../persistence/file';
import { readCachedProject, writeCachedProject } from './cache';

const DEBOUNCE_MS = 4000;
const ON_OPEN_MS = 400;
const POLL_MS = 15000;

/** Push-merge with the server, then persist the (possibly updated) project to
 * the local cache. Safe to call anytime; syncNow() no-ops when unconfigured. */
export async function syncAndCache(): Promise<void> {
  const store = useStore.getState();
  await store.syncNow();
  const after = useStore.getState();
  writeCachedProject(after.project);
  if (after.dirty) useStore.setState({ dirty: false }); // cache write == saved on mobile
}

/** GET a project from the sync server. Throws with a readable message. */
async function fetchProjectFromServer(id: string) {
  const { syncUrl, syncToken } = useStore.getState();
  const base = syncUrl.trim().replace(/\/+$/, '');
  if (!base || !syncToken) throw new Error('Sync is not configured.');
  const res = await fetch(`${base}/sync/${encodeURIComponent(id)}`, {
    headers: { authorization: `Bearer ${syncToken}` },
  });
  if (res.status === 410) throw new Error('This project was deleted on the server.');
  if (res.status === 401) throw new Error('Unauthorized — check the token.');
  if (!res.ok) throw new Error(`Pull failed (HTTP ${res.status}).`);
  return parseProject(await res.text());
}

/**
 * Open a project on mobile: cache-first for instant/offline opens (the auto-sync
 * on-open pass reconciles with the server right after), server pull for projects
 * not cached yet. Loads into the shared store with no file binding.
 */
export async function openMobileProject(id: string): Promise<void> {
  let project = readCachedProject(id);
  if (!project) {
    project = await fetchProjectFromServer(id);
    writeCachedProject(project);
  }
  useStore.getState().loadProject(project, null, null);
}

/**
 * The mobile counterpart of useAutoSync (which gates on a bound file and so
 * never activates on native). `activeId` is the project the mobile shell has
 * open, or null on the Projects screen.
 */
export function useMobileAutoSync(activeId: string | null) {
  const projectId = useStore((s) => s.project.id);
  const editRev = useStore((s) => s.editRev);
  const configured = useStore((s) => !!s.syncUrl && !!s.syncToken);

  const active = configured && !!activeId && activeId === projectId;

  // On open / switch: one sync shortly after the project is shown.
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => void syncAndCache(), ON_OPEN_MS);
    return () => clearTimeout(t);
  }, [active, projectId]);

  // Debounced push after the user stops editing (Phase 2+; harmless now).
  useEffect(() => {
    if (!active || editRev === 0) return;
    const t = setTimeout(() => void syncAndCache(), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [active, editRev]);

  // Returning to the foreground is the phone's "project opened" moment.
  useEffect(() => {
    if (!active) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncAndCache();
    });
    return () => sub.remove();
  }, [active]);

  // Poll the cheap /version; pull only when another device pushed (same
  // baseline-then-compare pattern as the desktop hook).
  const lastSeen = useRef<{ id: string; version: string | null }>({ id: '', version: null });
  useEffect(() => {
    if (!active) return;
    const tick = async () => {
      const store = useStore.getState();
      const version = await store.fetchRemoteVersion();
      if (version === null) return;
      if (lastSeen.current.id !== projectId) {
        lastSeen.current = { id: projectId, version };
        return;
      }
      if (version !== lastSeen.current.version) {
        await syncAndCache();
        lastSeen.current = {
          id: projectId,
          version: (await store.fetchRemoteVersion()) ?? version,
        };
      }
    };
    const iv = setInterval(() => void tick(), POLL_MS);
    return () => clearInterval(iv);
  }, [active, projectId]);
}

/**
 * Persist local edits to the cache shortly after they happen — the mobile
 * equivalent of useAutosave's debounced write to the bound file. (Phase 1 is
 * read-mostly, but sync adoptions and Phase 2 edits both flow through `dirty`.)
 */
export function useMobileCacheAutosave(activeId: string | null) {
  const project = useStore((s) => s.project);
  const dirty = useStore((s) => s.dirty);

  useEffect(() => {
    if (!dirty || !activeId || project.id !== activeId) return;
    const t = setTimeout(() => {
      writeCachedProject(useStore.getState().project);
      useStore.setState({ dirty: false });
    }, 800);
    return () => clearTimeout(t);
  }, [project, dirty, activeId]);
}
