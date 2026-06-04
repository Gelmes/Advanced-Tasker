// Lifecycle timestamps derived from a node's status history (SPEC.md §6). These
// are computed, never stored. Metrics key off status *kind* (not id), so cycling
// among same-kind statuses (e.g. doing <-> blocked, both 'active') doesn't move
// them. The chart layer will build on these per-node values.

import type { StatusKind, TaskNode } from './types';

export type KindOf = (statusId: string) => StatusKind | undefined;

function history(node: TaskNode) {
  return node.statusHistory ?? [];
}

/** First time the task entered active work (or jumped straight to done). */
export function startedAt(node: TaskNode, kindOf: KindOf): string | null {
  for (const e of history(node)) {
    const k = kindOf(e.status);
    if (k === 'active' || k === 'done') return e.at;
  }
  return null;
}

/**
 * When the task was completed — only if it is *currently* done (the last
 * transition was into a done-kind status). A later reopen clears this.
 */
export function completedAt(node: TaskNode, kindOf: KindOf): string | null {
  const h = history(node);
  if (!h.length) return null;
  const last = h[h.length - 1];
  return kindOf(last.status) === 'done' ? last.at : null;
}

export function isCompleted(node: TaskNode, kindOf: KindOf): boolean {
  return completedAt(node, kindOf) != null;
}

/** Wall-clock seconds from first active to completion (null unless completed). */
export function cycleTimeSeconds(node: TaskNode, kindOf: KindOf): number | null {
  const s = startedAt(node, kindOf);
  const d = completedAt(node, kindOf);
  if (!s || !d) return null;
  return Math.max(0, (Date.parse(d) - Date.parse(s)) / 1000);
}

/** Wall-clock seconds from creation to completion (null unless completed). */
export function leadTimeSeconds(node: TaskNode, kindOf: KindOf): number | null {
  const d = completedAt(node, kindOf);
  if (!d || !node.createdAt) return null;
  return Math.max(0, (Date.parse(d) - Date.parse(node.createdAt)) / 1000);
}
