import type { StatusDef } from './types';

export const FILE_VERSION = 1;

/** Default statuses for a new project. Fully editable at runtime (SPEC.md §2). */
export const DEFAULT_STATUSES: StatusDef[] = [
  { id: 'todo', label: 'To Do', color: '#888888' },
  { id: 'doing', label: 'Doing', color: '#3b82f6' },
  { id: 'blocked', label: 'Blocked', color: '#ef4444' },
  { id: 'done', label: 'Done', color: '#22c55e' },
];

/** The status id treated as terminal for completion rollups (SPEC.md §2). */
export const DONE_STATUS_ID = 'done';

/** Default Fibonacci story-point scale. */
export const DEFAULT_POINT_SCALE = [1, 2, 3, 5, 8, 13];
