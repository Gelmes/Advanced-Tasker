// Persists the workspace pointer (the directory handle + last-open project) so the
// app reopens the same folder on startup (SPEC.md §5). Directory handles are
// structured-cloneable in supporting browsers and stored in IndexedDB. No deps —
// raw IndexedDB behind a small promise wrapper.

import type { FileRef } from './file';

export interface WorkspacePointer {
  id: 'current';
  dirHandle: FileRef;
  /** File name of the project that was focused, to restore on reopen. */
  lastActive: string | null;
}

const DB_NAME = 'advanced-tasker';
const STORE = 'workspace';

function idbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function putWorkspace(dirHandle: FileRef, lastActive: string | null): Promise<void> {
  if (!idbAvailable()) return;
  await tx('readwrite', (s) => s.put({ id: 'current', dirHandle, lastActive }));
}

export async function getWorkspace(): Promise<WorkspacePointer | undefined> {
  if (!idbAvailable()) return undefined;
  return tx<WorkspacePointer | undefined>('readonly', (s) => s.get('current'));
}

export async function clearWorkspace(): Promise<void> {
  if (!idbAvailable()) return;
  await tx('readwrite', (s) => s.delete('current'));
}

/** Ensure read/write permission for a handle, prompting only if needed. */
export async function ensurePermission(handle: FileRef): Promise<boolean> {
  const opts = { mode: 'readwrite' as const };
  if ((await handle.queryPermission?.(opts)) === 'granted') return true;
  return (await handle.requestPermission?.(opts)) === 'granted';
}

/** True without prompting — used to decide whether to auto-restore on startup. */
export async function hasPermission(handle: FileRef): Promise<boolean> {
  return (await handle.queryPermission?.({ mode: 'readwrite' })) === 'granted';
}
