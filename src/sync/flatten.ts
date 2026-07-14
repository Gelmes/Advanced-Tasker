// Nested tree <-> flat list (SYNC.md). Sync operates on a flat list of nodes
// keyed by id, because per-node merge needs to address each node independently of
// where it currently sits in the tree. flatten() derives a fractional-index
// `orderKey` from the current sibling order; rebuild() sorts by that key to
// reconstruct the tree. Pure — no React, no I/O.

import type { ProjectFile, StatusEvent, TaskNode, TimeTracking } from '../model/types';
import { initialKeys } from '../model/orderKey';

/** A single node as it travels through sync: flat, parent-addressed, orderable. */
export interface SyncNode {
  id: string;
  /** Parent node id, or null for a top-level node. */
  parentId: string | null;
  /** Fractional-index key that sorts this node among its siblings. */
  orderKey: string;
  content: string;
  status: string | null;
  storyPoints: number | null;
  dueDate: string | null;
  collapsed: boolean;
  time: TimeTracking;
  statusHistory: StatusEvent[];
  /** Per-field merge clocks (see TaskNode). */
  statusUpdatedAt?: string | null;
  storyPointsUpdatedAt?: string | null;
  dueDateUpdatedAt?: string | null;
  bookmarked?: boolean;
  bookmarkedUpdatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  /** Tombstone timestamp, or null for a live node. */
  deletedAt: string | null;
}

/** Flatten a project's tree into a flat SyncNode list (order preserved via keys). */
export function flatten(project: ProjectFile): SyncNode[] {
  const out: SyncNode[] = [];
  const visit = (children: TaskNode[], parentId: string | null) => {
    // Prefer each node's STORED key; fall back to a positional key only for nodes
    // that predate order keys (belt-and-suspenders — parseProject backfills on load).
    const keys = initialKeys(children.length);
    children.forEach((node, i) => {
      out.push(toSyncNode(node, parentId, node.orderKey ?? keys[i]));
      if (node.children.length) visit(node.children, node.id);
    });
  };
  visit(project.root.children, null);
  return out;
}

function toSyncNode(node: TaskNode, parentId: string | null, orderKey: string): SyncNode {
  return {
    id: node.id,
    parentId,
    orderKey,
    content: node.content,
    status: node.status,
    storyPoints: node.storyPoints,
    dueDate: node.dueDate ?? null,
    collapsed: node.collapsed,
    // Deep-copy time (intervals is an array) so sync nodes don't alias the tree.
    time: copyTime(node.time),
    statusHistory: node.statusHistory.map((e) => ({ ...e })),
    statusUpdatedAt: node.statusUpdatedAt ?? null,
    storyPointsUpdatedAt: node.storyPointsUpdatedAt ?? null,
    dueDateUpdatedAt: node.dueDateUpdatedAt ?? null,
    bookmarked: node.bookmarked ?? false,
    bookmarkedUpdatedAt: node.bookmarkedUpdatedAt ?? null,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    deletedAt: node.deletedAt ?? null,
  };
}

/**
 * Effective parent for each live node: its `parentId`, or `null` when that parent
 * is missing/tombstoned. Then break any parent cycles — concurrent moves on two
 * devices can leave `x.parent=y` AND `y.parent=x` after merge, and a naive rebuild
 * from the root reaches neither, silently dropping both subtrees. We re-root the
 * cycle deterministically (the max-id member of each unreachable component) so the
 * result is a valid tree, identical on every peer, with no node lost.
 */
function groundedParents(live: SyncNode[]): Map<string, string | null> {
  const liveIds = new Set(live.map((n) => n.id));
  const parentOf = new Map<string, string | null>();
  for (const n of live) {
    parentOf.set(n.id, n.parentId !== null && liveIds.has(n.parentId) ? n.parentId : null);
  }

  // A node is "grounded" if walking parentId reaches null without looping.
  const groundedSet = (): Set<string> => {
    const grounded = new Set<string>();
    for (const id of parentOf.keys()) {
      const seen: string[] = [];
      let cur: string | null = id;
      while (cur !== null && !grounded.has(cur) && !seen.includes(cur)) {
        seen.push(cur);
        cur = parentOf.get(cur) ?? null;
      }
      if (cur === null || grounded.has(cur)) for (const s of seen) grounded.add(s);
    }
    return grounded;
  };

  // Re-root the largest-id ungrounded node until everything reaches the root.
  for (;;) {
    const grounded = groundedSet();
    const stuck = [...parentOf.keys()].filter((id) => !grounded.has(id));
    if (!stuck.length) break;
    stuck.sort();
    parentOf.set(stuck[stuck.length - 1], null); // deterministic cut, converges
  }
  return parentOf;
}

/**
 * Inverse of flatten: rebuild the nested `root.children` tree from a flat list.
 * Tombstoned nodes are excluded from the live tree. Siblings are ordered by
 * `orderKey`. Nodes whose parent is missing/tombstoned — or caught in a parent
 * cycle (see `groundedParents`) — are re-parented to the top level so no live node
 * is silently dropped.
 */
export function rebuild(nodes: SyncNode[]): { children: TaskNode[] } {
  const live = nodes.filter((n) => !n.deletedAt);
  const parentOf = groundedParents(live);

  // Group children by their (cycle-broken) effective parent id (null = top level).
  const byParent = new Map<string | null, SyncNode[]>();
  for (const n of live) {
    const parent = parentOf.get(n.id) ?? null;
    const bucket = byParent.get(parent) ?? [];
    bucket.push(n);
    byParent.set(parent, bucket);
  }

  const build = (parentId: string | null): TaskNode[] => {
    const kids = byParent.get(parentId) ?? [];
    kids.sort((a, b) => (a.orderKey < b.orderKey ? -1 : a.orderKey > b.orderKey ? 1 : 0));
    return kids.map((n) => toTaskNode(n, build(n.id)));
  };

  return { children: build(null) };
}

/** Deep copy of a TimeTracking (omits an absent effortUpdatedAt for round-trip). */
function copyTime(t: TimeTracking): TimeTracking {
  return {
    intervals: (t.intervals ?? []).map((iv) => ({ ...iv })),
    startedAt: t.startedAt,
    ...(t.effortUpdatedAt ? { effortUpdatedAt: t.effortUpdatedAt } : {}),
  };
}

function toTaskNode(n: SyncNode, children: TaskNode[]): TaskNode {
  return {
    id: n.id,
    content: n.content,
    status: n.status,
    storyPoints: n.storyPoints,
    time: copyTime(n.time),
    statusHistory: n.statusHistory.map((e) => ({ ...e })),
    // Only carry per-field clocks when set, so a node that never had one round-trips
    // to the same shape (mirrors how deletedAt is omitted for live nodes).
    ...(n.statusUpdatedAt ? { statusUpdatedAt: n.statusUpdatedAt } : {}),
    ...(n.storyPointsUpdatedAt ? { storyPointsUpdatedAt: n.storyPointsUpdatedAt } : {}),
    ...(n.dueDateUpdatedAt ? { dueDateUpdatedAt: n.dueDateUpdatedAt } : {}),
    ...(n.bookmarked ? { bookmarked: true } : {}),
    ...(n.bookmarkedUpdatedAt ? { bookmarkedUpdatedAt: n.bookmarkedUpdatedAt } : {}),
    dueDate: n.dueDate,
    orderKey: n.orderKey,
    collapsed: n.collapsed,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    // Omit deletedAt entirely for live nodes so rebuild round-trips to the
    // original tree shape (which has no deletedAt on live nodes).
    children,
  };
}
