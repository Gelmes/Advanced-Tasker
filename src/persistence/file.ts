// File persistence for the web target (SPEC.md §5). Binds the app to a real .json
// file on disk via the File System Access API so projects are git-able and
// editable in any editor. Native targets will provide their own adapter behind
// this same load/save shape.

import {
  DEFAULT_POINT_SCALE,
  DEFAULT_STATUSES,
  FILE_VERSION,
} from '../model/defaults';
import type { ProjectFile, StatusDef, StatusKind, TaskNode } from '../model/types';

/** Infer a status kind for legacy files that predate the `kind` field. */
function inferKind(raw: any): StatusKind {
  if (raw?.kind === 'todo' || raw?.kind === 'active' || raw?.kind === 'done') return raw.kind;
  const id = String(raw?.id ?? '').toLowerCase();
  if (id === 'done') return 'done';
  if (id === 'todo' || id === 'backlog') return 'todo';
  return 'active';
}

function migrateStatuses(raw: any): StatusDef[] {
  if (!Array.isArray(raw)) return DEFAULT_STATUSES.map((s) => ({ ...s }));
  return raw.map((s: any) => ({
    id: String(s.id),
    label: String(s.label ?? s.id),
    color: String(s.color ?? '#888888'),
    kind: inferKind(s),
  }));
}

/** Ensure every node has a statusHistory array (legacy files lack it). */
function migrateNodes(nodes: any[]): TaskNode[] {
  for (const n of nodes) {
    if (!Array.isArray(n.statusHistory)) n.statusHistory = [];
    if (Array.isArray(n.children)) migrateNodes(n.children);
    else n.children = [];
  }
  return nodes as TaskNode[];
}

/** Opaque handle to the on-disk file; kept in the store for auto-save. */
export type FileRef = any; // FileSystemFileHandle (not in RN typings)

export interface OpenResult {
  project: ProjectFile;
  handle: FileRef;
  /** Name of the file as opened, for display. */
  fileName: string;
}

const PICKER_TYPES = [
  { description: 'Advanced Tasker project', accept: { 'application/json': ['.json'] } },
];

export function fileApiAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as any).showOpenFilePicker === 'function'
  );
}

export function serialize(project: ProjectFile): string {
  return JSON.stringify(project, null, 2);
}

/** Parse + validate a project, filling in optional fields with sane defaults. */
export function parseProject(text: string): ProjectFile {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON.');
  }
  if (!raw || typeof raw !== 'object') throw new Error('File is empty or malformed.');
  if (!raw.root || !Array.isArray(raw.root.children)) {
    throw new Error('Missing root.children — not an Advanced Tasker project.');
  }
  return {
    version: typeof raw.version === 'number' ? raw.version : FILE_VERSION,
    name: typeof raw.name === 'string' ? raw.name : 'Untitled',
    statuses: migrateStatuses(raw.statuses),
    pointScale: Array.isArray(raw.pointScale) ? raw.pointScale : [...DEFAULT_POINT_SCALE],
    activeTimerNodeId:
      typeof raw.activeTimerNodeId === 'string' ? raw.activeTimerNodeId : null,
    root: { children: migrateNodes(raw.root.children ?? []) },
  };
}

export async function openProject(): Promise<OpenResult | null> {
  if (!fileApiAvailable()) {
    throw new Error('This browser does not support opening local files directly.');
  }
  const [handle] = await (window as any).showOpenFilePicker({
    types: PICKER_TYPES,
    multiple: false,
  });
  const file = await handle.getFile();
  const text = await file.text();
  return { project: parseProject(text), handle, fileName: handle.name };
}

export async function saveProject(handle: FileRef, project: ProjectFile): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(serialize(project));
  await writable.close();
}

export async function saveProjectAs(
  project: ProjectFile,
  suggestedName = 'project.json',
): Promise<OpenResult | null> {
  if (!fileApiAvailable() || typeof (window as any).showSaveFilePicker !== 'function') {
    throw new Error('This browser does not support saving local files directly.');
  }
  const handle = await (window as any).showSaveFilePicker({
    suggestedName,
    types: PICKER_TYPES,
  });
  await saveProject(handle, project);
  return { project, handle, fileName: handle.name };
}
