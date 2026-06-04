import type { StatusDef } from './types';

export const FILE_VERSION = 1;

/** Default statuses for a new project. Fully editable at runtime (SPEC.md §2). */
export const DEFAULT_STATUSES: StatusDef[] = [
  { id: 'todo', label: 'To Do', color: '#888888', kind: 'todo' },
  { id: 'doing', label: 'Doing', color: '#3b82f6', kind: 'active' },
  { id: 'blocked', label: 'Blocked', color: '#ef4444', kind: 'active' },
  { id: 'done', label: 'Done', color: '#22c55e', kind: 'done' },
];

/** Default kind for a newly-added custom status. */
export const DEFAULT_STATUS_KIND = 'active' as const;

/** Default Fibonacci story-point scale. */
export const DEFAULT_POINT_SCALE = [1, 2, 3, 5, 8, 13];
