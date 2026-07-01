// Nested tree <-> flat list (SYNC.md). Sync operates on a flat list of nodes
// keyed by id, because per-node merge needs to address each node independently of
// where it currently sits in the tree. flatten() derives a fractional-index
// `orderKey` from the current sibling order; rebuild() sorts by that key to
// reconstruct the tree. Pure — no React, no I/O.

import type { ProjectFile, StatusEvent, TaskNode, TimeTracking } from '../model/types';
import { initialKeys } from './orderKey';

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
  createdAt: string;
  updatedAt: string;
  /** Tombstone timestamp, or null for a live node. */
  deletedAt: string | null;
}

/** Flatten a project's tree into a flat SyncNode list (order preserved via keys). */
export function flatten(project: ProjectFile): SyncNode[] {
  const out: SyncNode[] = [];
  const visit = (children: TaskNode[], parentId: string | null) => {
    const keys = initialKeys(children.length);
    children.forEach((node, i) => {
      out.push(toSyncNode(node, parentId, keys[i]));
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
    // Copy time so sync nodes don't alias the live tree.
    time: { ...node.time },
    statusHistory: node.statusHistory.map((e) => ({ ...e })),
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    deletedAt: node.deletedAt ?? null,
  };
}

/**
 * Inverse of flatten: rebuild the nested `root.children` tree from a flat list.
 * Tombstoned nodes are excluded from the live tree. Siblings are ordered by
 * `orderKey`. Nodes whose parent is missing/tombstoned are re-parented to the
 * top level so no live node is silently dropped.
 */
export function rebuild(nodes: SyncNode[]): { children: TaskNode[] } {
  const live = nodes.filter((n) => !n.deletedAt);
  const liveIds = new Set(live.map((n) => n.id));

  // Group children by parent id (null = top level).
  const byParent = new Map<string | null, SyncNode[]>();
  for (const n of live) {
    const parent = n.parentId !== null && liveIds.has(n.parentId) ? n.parentId : null;
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

function toTaskNode(n: SyncNode, children: TaskNode[]): TaskNode {
  return {
    id: n.id,
    content: n.content,
    status: n.status,
    storyPoints: n.storyPoints,
    time: { ...n.time },
    statusHistory: n.statusHistory.map((e) => ({ ...e })),
    dueDate: n.dueDate,
    collapsed: n.collapsed,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    // Omit deletedAt entirely for live nodes so rebuild round-trips to the
    // original tree shape (which has no deletedAt on live nodes).
    children,
  };
}
