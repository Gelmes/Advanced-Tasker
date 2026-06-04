// Persists the set of opened workspace folders so they can be re-listed and
// reopened (SPEC.md §5). Directory handles are structured-cloneable in supporting
// browsers and stored in IndexedDB keyed by a stable id. The "current" folder is
// the one with the most recent `lastOpened`. No deps — raw IndexedDB.

import type { FileRef } from './file';

export interface FolderEntry {
  id: string;
  name: string;
  dirHandle: FileRef;
  /** File name of the project that was focused, to restore on reopen. */
  lastActive: string | null;
  lastOpened: number;
}

const DB_NAME = 'advanced-tasker';
const STORE = 'folders';

function idbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 3);
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

export async function putFolder(entry: FolderEntry): Promise<void> {
  if (!idbAvailable()) return;
  await tx('readwrite', (s) => s.put(entry));
}

export async function listFolders(): Promise<FolderEntry[]> {
  if (!idbAvailable()) return [];
  const all = (await tx<FolderEntry[]>('readonly', (s) => s.getAll())) ?? [];
  return all.sort((a, b) => b.lastOpened - a.lastOpened);
}

export async function getFolder(id: string): Promise<FolderEntry | undefined> {
  if (!idbAvailable()) return undefined;
  return tx<FolderEntry | undefined>('readonly', (s) => s.get(id));
}

export async function removeFolder(id: string): Promise<void> {
  if (!idbAvailable()) return;
  await tx('readwrite', (s) => s.delete(id));
}

/** Find an already-known folder whose handle points at the same directory. */
export async function findFolderByHandle(handle: FileRef): Promise<FolderEntry | undefined> {
  for (const f of await listFolders()) {
    try {
      if (await handle.isSameEntry?.(f.dirHandle)) return f;
    } catch {
      // ignore handles we can't compare
    }
  }
  return undefined;
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
