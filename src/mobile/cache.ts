// Mobile project cache (MOBILE.md). The phone has no folder/file concept — the
// server is the source of projects, and this cache is what makes the app open
// instantly and work offline. One JSON file per project id under the app's
// document directory, plus a small index for the Projects screen.
//
// Reads/writes go through the same parseProject/serialize as every other
// surface, so migrations and the on-disk contract stay identical.

import { Directory, File, Paths } from 'expo-file-system';
import type { ProjectFile } from '../model/types';
import { parseProject, serialize } from '../persistence/file';

export interface CachedProjectMeta {
  id: string;
  name: string;
  /** ISO time of the last cache write (any local save or sync adoption). */
  cachedAt: string;
}

function projectsDir(): Directory {
  const dir = new Directory(Paths.document, 'projects');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

function indexFile(): File {
  return new File(Paths.document, 'projects-index.json');
}

function writeText(file: File, text: string): void {
  if (!file.exists) file.create({ intermediates: true });
  file.write(text);
}

export function readCacheIndex(): CachedProjectMeta[] {
  try {
    const f = indexFile();
    if (!f.exists) return [];
    const parsed = JSON.parse(f.textSync());
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is CachedProjectMeta =>
        e && typeof e.id === 'string' && typeof e.name === 'string',
    );
  } catch {
    return [];
  }
}

function writeCacheIndex(entries: CachedProjectMeta[]): void {
  try {
    writeText(indexFile(), JSON.stringify(entries));
  } catch {
    // Index is a convenience view; a failed write only staled the list.
  }
}

export function readCachedProject(id: string): ProjectFile | null {
  try {
    const f = new File(projectsDir(), `${id}.json`);
    if (!f.exists) return null;
    return parseProject(f.textSync());
  } catch {
    return null;
  }
}

export function writeCachedProject(project: ProjectFile): void {
  try {
    writeText(new File(projectsDir(), `${project.id}.json`), serialize(project));
    const rest = readCacheIndex().filter((e) => e.id !== project.id);
    writeCacheIndex([
      ...rest,
      { id: project.id, name: project.name, cachedAt: new Date().toISOString() },
    ]);
  } catch {
    // Cache write failures must never break the live app; sync still has the data.
  }
}

export interface MobilePrefs {
  /** Default target for quick capture from the Projects screen. */
  lastProjectId?: string;
  /**
   * Whether a running-timer notification is currently posted. Persisted so a
   * notice left behind by a killed app can be cleared on the next boot without
   * loading the notifications module (and its Expo Go push warning) every time.
   */
  timerNoticePosted?: boolean;
}

export function readPrefs(): MobilePrefs {
  try {
    const f = new File(Paths.document, 'mobile-prefs.json');
    if (!f.exists) return {};
    const parsed = JSON.parse(f.textSync());
    return parsed && typeof parsed === 'object' ? (parsed as MobilePrefs) : {};
  } catch {
    return {};
  }
}

export function writePrefs(patch: Partial<MobilePrefs>): void {
  try {
    writeText(
      new File(Paths.document, 'mobile-prefs.json'),
      JSON.stringify({ ...readPrefs(), ...patch }),
    );
  } catch {
    // preferences are best-effort
  }
}

export function deleteCachedProject(id: string): void {
  try {
    const f = new File(projectsDir(), `${id}.json`);
    if (f.exists) f.delete();
  } catch {
    // ignore
  }
  writeCacheIndex(readCacheIndex().filter((e) => e.id !== id));
}
