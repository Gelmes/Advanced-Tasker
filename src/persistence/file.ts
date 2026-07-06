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
import { newId } from '../model/ids';
import { ensureOrderKeys } from '../model/orderKey';

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
    migrateTime(n);
    if (Array.isArray(n.children)) migrateNodes(n.children);
    else n.children = [];
  }
  return nodes as TaskNode[];
}

/**
 * Migrate legacy `time.accumulatedSeconds` (a single mutable counter) to the
 * interval model (SYNC.md "time"). The banked total becomes one synthetic
 * interval ENDING at `createdAt` — anchored to a field identical on every
 * device, so two devices migrating the same task synthesize the SAME interval
 * (union-safe, no double count), and placed backwards from creation so it can
 * never overlap real future runs. Interval positions aren't used by analytics;
 * only the sum matters.
 */
function migrateTime(n: any): void {
  if (!n.time || typeof n.time !== 'object') {
    n.time = { intervals: [], startedAt: null };
    return;
  }
  if (!Array.isArray(n.time.intervals)) n.time.intervals = [];
  const legacy = n.time.accumulatedSeconds;
  if (typeof legacy === 'number' && legacy > 0 && n.time.intervals.length === 0) {
    const end = Date.parse(n.createdAt ?? '') || 0;
    n.time.intervals = [
      {
        start: new Date(end - Math.round(legacy) * 1000).toISOString(),
        end: new Date(end).toISOString(),
      },
    ];
  }
  delete n.time.accumulatedSeconds;
  if (typeof n.time.startedAt !== 'string') n.time.startedAt = null;
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
  const children = migrateNodes(raw.root.children ?? []);
  ensureOrderKeys(children); // backfill sync order keys for legacy files (SYNC.md)
  return {
    version: typeof raw.version === 'number' ? raw.version : FILE_VERSION,
    // Stable project id for sync (SYNC.md); generate for legacy files that lack it.
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    name: typeof raw.name === 'string' ? raw.name : 'Untitled',
    statuses: migrateStatuses(raw.statuses),
    pointScale: Array.isArray(raw.pointScale) ? raw.pointScale : [...DEFAULT_POINT_SCALE],
    activeTimerNodeId:
      typeof raw.activeTimerNodeId === 'string' ? raw.activeTimerNodeId : null,
    tombstones:
      raw.tombstones && typeof raw.tombstones === 'object' ? raw.tombstones : {},
    statusTombstones:
      raw.statusTombstones && typeof raw.statusTombstones === 'object'
        ? raw.statusTombstones
        : {},
    root: { children },
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
