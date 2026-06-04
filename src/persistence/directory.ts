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
