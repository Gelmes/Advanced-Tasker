// Core data model. See SPEC.md §2. One recursive node type: a node with no
// `status` is a plain note; a node with a status id is a tracked task.

/** One completed timer run. `start` < `end`, both ISO timestamps. */
export interface TimeInterval {
  start: string;
  end: string;
}

export interface TimeTracking {
  /**
   * Completed timer runs. Sync merges these by SET UNION (coalescing overlaps),
   * so timing the same task on two devices in an unsynced window loses nothing —
   * and a timer left running on both counts the overlapping wall-clock once
   * (SYNC.md "time"). Elapsed = sum of intervals + the live run.
   */
  intervals: TimeInterval[];
  /** ISO timestamp while the timer is running, else null. */
  startedAt: string | null;
  /**
   * ISO time of the last explicit effort EDIT (the details-panel correction).
   * An edit replaces the interval list wholesale; this per-field clock lets the
   * correction beat the union in merge. Absent = never edited.
   */
  effortUpdatedAt?: string | null;
}

/** A settled status transition (SPEC.md §6). `status` is a status id. */
export interface StatusEvent {
  at: string; // ISO timestamp
  status: string;
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
  /**
   * Append-only log of settled status transitions, used to derive lifecycle
   * timestamps (started/done) for analytics. Coalesced so rapid cycling between
   * statuses leaves only the value you land on.
   */
  statusHistory: StatusEvent[];
  /**
   * ISO time of the last status change — the per-field clock `merge()` uses to
   * resolve `status` independently of `updatedAt` (SYNC.md). Any edit bumps
   * `updatedAt`, so without this a content edit on one device could silently
   * override a concurrent status change on another. Optional: legacy nodes fall
   * back to `updatedAt` during merge.
   */
  statusUpdatedAt?: string | null;
  /**
   * Per-field merge clocks (like `statusUpdatedAt`) so a concurrent edit to one of
   * these fields on another device isn't clobbered by the whole-node LWW winner.
   */
  storyPointsUpdatedAt?: string | null;
  dueDateUpdatedAt?: string | null;
  /** Starred for quick access (SPEC.md §4 — the sidebar ★ tab). Synced. */
  bookmarked?: boolean;
  /** Per-field merge clock for `bookmarked` (same pattern as statusUpdatedAt). */
  bookmarkedUpdatedAt?: string | null;
  /** Optional target date (YYYY-MM-DD) — drives the burndown ideal line. */
  dueDate?: string | null;
  /**
   * Tombstone timestamp for merge sync (SYNC.md). Absent/null = live. A hard
   * delete is indistinguishable from "not yet synced", so deletes are carried as
   * tombstones at the sync boundary. The live interactive delete path is untouched.
   */
  deletedAt?: string | null;
  /**
   * Fractional-index key giving this node's position among its siblings (SYNC.md).
   * Stored (not derived from array order) so it stays stable across devices —
   * that's what lets concurrent inserts/reorders merge without collision. Assigned
   * by the tree ops on move/insert and backfilled on load; array order remains the
   * live source of truth and is kept consistent with it.
   */
  orderKey?: string;
  collapsed: boolean;
  createdAt: string;
  updatedAt: string;
  children: TaskNode[];
}

/** Lifecycle category of a status, driving analytics (SPEC.md §6). */
export type StatusKind = 'todo' | 'active' | 'done';

export interface StatusDef {
  id: string;
  label: string;
  color: string;
  kind: StatusKind;
  /**
   * ISO time of the last edit to this status, for per-status last-write-wins in
   * project merge (SYNC.md). Optional: legacy statuses merge as "oldest".
   */
  updatedAt?: string;
}

export interface ProjectFile {
  version: number;
  /**
   * Stable project UUID (SYNC.md). Project identity for sync — the filename is
   * not stable across devices. Generated in parseProject/createEmptyProject when
   * missing so old files migrate transparently.
   */
  id: string;
  name: string;
  /** Fully user-configurable status set. Order is display order. */
  statuses: StatusDef[];
  /** Allowed story-point values (Fibonacci by default). */
  pointScale: number[];
  /** Id of the single node whose timer is running, or null. */
  activeTimerNodeId: string | null;
  /**
   * Deleted node ids → deletion time (ISO). Deletes hard-remove from the live tree,
   * so the delete must be recorded here to propagate through merge — otherwise a node
   * resurrects from a device that still has it. A newer edit resurrects on purpose.
   */
  tombstones?: Record<string, string>;
  /**
   * Deleted status-definition ids → deletion time (ISO). Same rationale as node
   * `tombstones`: without it, a removed status reappears from a device that still
   * has it. A status edited after the deletion resurrects.
   */
  statusTombstones?: Record<string, string>;
  /**
   * ISO time of the last change to project *metadata* (name, pointScale, active
   * timer) — the clock for merging those fields (SYNC.md). Node edits and status
   * edits carry their own clocks; this covers the rest.
   */
  updatedAt?: string;
  root: { children: TaskNode[] };
}

/** Selection/edit mode for the modal interaction model (SPEC.md §3). */
export type Mode = 'selected' | 'editing';
