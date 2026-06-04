// Core data model. See SPEC.md §2. One recursive node type: a node with no
// `status` is a plain note; a node with a status id is a tracked task.

export interface TimeTracking {
  /** Banked seconds from previously-stopped runs. */
  accumulatedSeconds: number;
  /** ISO timestamp while the timer is running, else null. */
  startedAt: string | null;
}

export interface TaskNode {
  id: string;
  /** Raw markdown; rendered in the UI when the row is not being edited. */
  content: string;
  /** A status id (task) or null (plain note). */
  status: string | null;
  /** Must be a member of the project's pointScale, or null. */
  storyPoints: number | null;
  time: TimeTracking;
  collapsed: boolean;
  createdAt: string;
  updatedAt: string;
  children: TaskNode[];
}

export interface StatusDef {
  id: string;
  label: string;
  color: string;
}

export interface ProjectFile {
  version: number;
  name: string;
  /** Fully user-configurable status set. Order is display order. */
  statuses: StatusDef[];
  /** Allowed story-point values (Fibonacci by default). */
  pointScale: number[];
  /** Id of the single node whose timer is running, or null. */
  activeTimerNodeId: string | null;
  root: { children: TaskNode[] };
}

/** Selection/edit mode for the modal interaction model (SPEC.md §3). */
export type Mode = 'selected' | 'editing';
