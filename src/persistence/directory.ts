// Folder-as-workspace support (SPEC.md §5, revised). A workspace is a directory of
// .json project files; each file is one project. Built on the File System Access
// API directory handle, which can be persisted and reopened like a file handle.

import type { ProjectFile } from '../model/types';
import { parseProject, serialize, type FileRef } from './file';

export interface ProjectRef {
  /** File name within the directory, e.g. "sprint.json". Stable identity. */
  fileName: string;
  /** Display name = the project's `name`, falling back to the file name. */
  name: string;
  handle: FileRef;
}

export function directoryApiAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as any).showDirectoryPicker === 'function'
  );
}

export async function pickDirectory(): Promise<FileRef> {
  if (!directoryApiAvailable()) {
    throw new Error('This browser does not support opening folders.');
  }
  return (window as any).showDirectoryPicker({ mode: 'readwrite' });
}

/** List the .json projects in a directory, reading each one's display name. */
export async function listProjects(dir: FileRef): Promise<ProjectRef[]> {
  const refs: ProjectRef[] = [];
  for await (const entry of dir.values()) {
    if (entry.kind !== 'file' || !entry.name.toLowerCase().endsWith('.json')) continue;
    let name = entry.name.replace(/\.json$/i, '');
    try {
      const file = await entry.getFile();
      const project = parseProject(await file.text());
      if (project.name) name = project.name;
    } catch {
      // Unparseable file: still list it under its file name; opening will report why.
    }
    refs.push({ fileName: entry.name, name, handle: entry });
  }
  refs.sort((a, b) => a.name.localeCompare(b.name));
  return refs;
}

export async function readProjectFromRef(ref: ProjectRef): Promise<ProjectFile> {
  const file = await ref.handle.getFile();
  return parseProject(await file.text());
}

/** Create a new project file in the directory, returning its ref. */
export async function createProjectFile(
  dir: FileRef,
  fileName: string,
  project: ProjectFile,
): Promise<ProjectRef> {
  const handle = await dir.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();
  await writable.write(serialize(project));
  await writable.close();
  return { fileName, name: project.name, handle };
}

/** A filename not already present in `existing` (project-1.json, project-2.json, …). */
export function uniqueFileName(existing: ProjectRef[], base = 'project'): string {
  const taken = new Set(existing.map((r) => r.fileName.toLowerCase()));
  for (let i = 1; ; i++) {
    const candidate = `${base}-${i}.json`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** A display name reduced to a safe cross-platform file base (no extension). */
export function sanitizeFileBase(name: string): string {
  const base = name
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/, '');
  return base || 'project';
}

/** `<base>.json` if free in `existing`, else `<base>-2.json`, `<base>-3.json`, … */
export function availableFileName(existing: ProjectRef[], displayName: string): string {
  const base = sanitizeFileBase(displayName);
  const taken = new Set(existing.map((r) => r.fileName.toLowerCase()));
  if (!taken.has(`${base}.json`.toLowerCase())) return `${base}.json`;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}.json`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/**
 * Rename a project file on disk. Prefers FileSystemFileHandle.move() (the same
 * handle stays valid); falls back to create-new + copy + delete-old where move()
 * isn't available. `current` (the in-memory project) is written on the fallback
 * path so unsaved edits to the active project aren't lost mid-rename.
 */
export async function renameProjectFileOnDisk(
  dir: FileRef,
  ref: ProjectRef,
  newFileName: string,
  current?: ProjectFile | null,
): Promise<ProjectRef> {
  if (newFileName === ref.fileName) return ref;
  const handle: any = ref.handle;
  if (typeof handle.move === 'function') {
    try {
      await handle.move(newFileName);
      return { ...ref, fileName: newFileName };
    } catch {
      // move() exists but refused (e.g. permission quirk) — fall through to copy.
    }
  }
  const project = current ?? parseProject(await (await handle.getFile()).text());
  const newRef = await createProjectFile(dir, newFileName, project);
  await dir.removeEntry(ref.fileName);
  return { ...newRef, name: project.name || newRef.name };
}

/** Delete a project file from the workspace folder. */
export async function deleteProjectFile(dir: FileRef, fileName: string): Promise<void> {
  await dir.removeEntry(fileName);
}
