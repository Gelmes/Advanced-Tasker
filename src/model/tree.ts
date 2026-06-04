// Pure tree operations (SPEC.md §3). No React, no I/O — every function takes the
// project's root-children array (mutated in place on a clone made by the caller)
// and returns whatever id the caller should select next. These are the unit of
// testing for all structural behaviour.

import { createNode, nowIso } from './factory';
import type { ProjectFile, TaskNode } from './types';

interface Level {
  siblings: TaskNode[];
  index: number;
}

/** Path of (siblingArray, index) levels from a root child down to `id`. */
export function locate(
  children: TaskNode[],
  id: string,
  acc: Level[] = [],
): Level[] | null {
  for (let i = 0; i < children.length; i++) {
    const node = children[i];
    const here = [...acc, { siblings: children, index: i }];
    if (node.id === id) return here;
    if (node.children.length) {
      const found = locate(node.children, id, here);
      if (found) return found;
    }
  }
  return null;
}

export function findNode(root: TaskNode[], id: string): TaskNode | null {
  const path = locate(root, id);
  if (!path) return null;
  const last = path[path.length - 1];
  return last.siblings[last.index];
}

function touch(node: TaskNode): void {
  node.updatedAt = nowIso();
}

/** Visit every node in the tree, depth-first. */
export function walk(root: TaskNode[], fn: (node: TaskNode) => void): void {
  for (const node of root) {
    fn(node);
    walk(node.children, fn);
  }
}

/** Depth-first list of nodes that are currently visible (collapsed subtrees hidden). */
export function visibleNodes(root: TaskNode[], out: TaskNode[] = []): TaskNode[] {
  for (const node of root) {
    out.push(node);
    if (!node.collapsed && node.children.length) visibleNodes(node.children, out);
  }
  return out;
}

/** The visible node before/after `id`, or null at the ends. dir: -1 prev, +1 next. */
export function adjacentVisible(
  root: TaskNode[],
  id: string,
  dir: -1 | 1,
): string | null {
  const order = visibleNodes(root);
  const i = order.findIndex((n) => n.id === id);
  if (i < 0) return null;
  const j = i + dir;
  return j >= 0 && j < order.length ? order[j].id : null;
}

// --- structural mutations (operate on an already-cloned root) -----------------

/** Insert a new empty sibling immediately after `id` (or append at root if null). */
export function insertSiblingAfter(root: TaskNode[], id: string | null): string {
  const node = createNode('');
  if (!id) {
    root.push(node);
    return node.id;
  }
  const path = locate(root, id);
  if (!path) {
    root.push(node);
    return node.id;
  }
  const lvl = path[path.length - 1];
  lvl.siblings.splice(lvl.index + 1, 0, node);
  return node.id;
}

/** Make `id` a child of its immediately preceding sibling. No-op if first child. */
export function indent(root: TaskNode[], id: string): void {
  const path = locate(root, id);
  if (!path) return;
  const lvl = path[path.length - 1];
  if (lvl.index === 0) return; // nothing to indent under
  const [node] = lvl.siblings.splice(lvl.index, 1);
  const prev = lvl.siblings[lvl.index - 1];
  prev.collapsed = false;
  prev.children.push(node);
  touch(prev);
  touch(node);
}

/** Make `id` a sibling of its parent, inserted just after the parent. No-op at root. */
export function outdent(root: TaskNode[], id: string): void {
  const path = locate(root, id);
  if (!path || path.length < 2) return; // already at root level
  const lvl = path[path.length - 1];
  const parentLvl = path[path.length - 2];
  const parent = parentLvl.siblings[parentLvl.index];
  const [node] = lvl.siblings.splice(lvl.index, 1);
  parentLvl.siblings.splice(parentLvl.index + 1, 0, node);
  touch(parent);
  touch(node);
}

/** Reorder `id` within its sibling list. dir: -1 up, +1 down. */
export function moveWithinSiblings(root: TaskNode[], id: string, dir: -1 | 1): void {
  const path = locate(root, id);
  if (!path) return;
  const lvl = path[path.length - 1];
  const target = lvl.index + dir;
  if (target < 0 || target >= lvl.siblings.length) return;
  const [node] = lvl.siblings.splice(lvl.index, 1);
  lvl.siblings.splice(target, 0, node);
  touch(node);
}

/**
 * Delete `id` (and its subtree). Returns the id that should become selected:
 * previous sibling, else parent, else next sibling, else null.
 */
export function deleteNode(root: TaskNode[], id: string): string | null {
  const path = locate(root, id);
  if (!path) return null;
  const lvl = path[path.length - 1];
  const parentLvl = path.length >= 2 ? path[path.length - 2] : null;

  let nextSel: string | null = null;
  if (lvl.index > 0) nextSel = lvl.siblings[lvl.index - 1].id;
  else if (parentLvl) nextSel = parentLvl.siblings[parentLvl.index].id;
  else if (lvl.siblings.length > 1) nextSel = lvl.siblings[lvl.index + 1].id;

  lvl.siblings.splice(lvl.index, 1);
  return nextSel;
}

export type DropWhere = 'before' | 'after' | 'inside';

/** True when `maybeId` is somewhere inside `ancestorId`'s subtree. */
export function isDescendant(
  root: TaskNode[],
  ancestorId: string,
  maybeId: string,
): boolean {
  const ancestor = findNode(root, ancestorId);
  if (!ancestor) return false;
  let found = false;
  walk(ancestor.children, (n) => {
    if (n.id === maybeId) found = true;
  });
  return found;
}

/**
 * Move `dragId` next to (or inside) `targetId` for drag-and-drop reordering.
 * No-op if dropping a node onto itself or into its own subtree.
 */
export function moveNodeRelative(
  root: TaskNode[],
  dragId: string,
  targetId: string,
  where: DropWhere,
): void {
  if (dragId === targetId) return;
  if (isDescendant(root, dragId, targetId)) return;

  const dragPath = locate(root, dragId);
  if (!dragPath) return;
  const dl = dragPath[dragPath.length - 1];
  const [dragNode] = dl.siblings.splice(dl.index, 1);

  const tPath = locate(root, targetId);
  if (!tPath) {
    // Target vanished (shouldn't happen): restore to avoid losing the node.
    dl.siblings.splice(dl.index, 0, dragNode);
    return;
  }
  const tl = tPath[tPath.length - 1];
  if (where === 'inside') {
    const target = tl.siblings[tl.index];
    target.collapsed = false;
    target.children.unshift(dragNode);
    touch(target);
  } else {
    const at = where === 'before' ? tl.index : tl.index + 1;
    tl.siblings.splice(at, 0, dragNode);
  }
  touch(dragNode);
}

export function setContent(root: TaskNode[], id: string, content: string): void {
  const node = findNode(root, id);
  if (!node) return;
  node.content = content;
  touch(node);
}

/** Assign a status id (promotes a note to a task) or null (demotes to a note). */
export function setStatus(root: TaskNode[], id: string, status: string | null): void {
  const node = findNode(root, id);
  if (!node) return;
  node.status = status;
  touch(node);
}

export function setStoryPoints(root: TaskNode[], id: string, points: number | null): void {
  const node = findNode(root, id);
  if (!node) return;
  node.storyPoints = points;
  touch(node);
}

/**
 * Next value in a cycle through [null, ...values], wrapping back to null after the
 * last value. Shared by status and story-point cycling.
 */
export function cycleValue<T>(
  current: T | null,
  values: T[],
  dir: 1 | -1 = 1,
): T | null {
  const ring: (T | null)[] = [null, ...values];
  const i = ring.findIndex((v) => v === current);
  // Unknown current: behave as if starting from null, so the next value is the
  // first real value rather than wrapping to null.
  const from = i < 0 ? 0 : i;
  return ring[(from + dir + ring.length) % ring.length];
}

export function setCollapsed(root: TaskNode[], id: string, collapsed: boolean): void {
  const node = findNode(root, id);
  if (!node || !node.children.length) return;
  node.collapsed = collapsed;
  touch(node);
}

/** True when the node has no rendered content (used for Backspace-deletes-empty). */
export function isEmpty(node: TaskNode): boolean {
  return node.content.trim() === '' && node.children.length === 0;
}

/** Deep clone of the whole project so mutations don't alias React state. */
export function cloneProject(project: ProjectFile): ProjectFile {
  const sc = (globalThis as any).structuredClone;
  return typeof sc === 'function'
    ? sc(project)
    : JSON.parse(JSON.stringify(project));
}
