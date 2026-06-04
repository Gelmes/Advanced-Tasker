// Subtree roll-ups (SPEC.md §4), computed live from the tree — never stored.
// A roll-up covers a node and all its descendants: summed tracked time, summed
// story points, and task-completion counts (notes excluded from completion).

import { elapsedSeconds } from './time';
import type { TaskNode } from './types';

export interface Rollup {
  seconds: number;
  points: number;
  /** Nodes with a status (notes excluded). */
  taskCount: number;
  /** Tasks whose status is of kind 'done'. */
  doneCount: number;
}

const EMPTY: Rollup = { seconds: 0, points: 0, taskCount: 0, doneCount: 0 };

/** `isDone` tells whether a status id counts as completed (kind === 'done'). */
export function computeRollup(
  node: TaskNode,
  isDone: (statusId: string) => boolean,
  nowMs: number,
): Rollup {
  let acc: Rollup = {
    seconds: elapsedSeconds(node, nowMs),
    points: node.storyPoints ?? 0,
    taskCount: node.status ? 1 : 0,
    doneCount: node.status && isDone(node.status) ? 1 : 0,
  };
  for (const child of node.children) {
    const r = computeRollup(child, isDone, nowMs);
    acc = {
      seconds: acc.seconds + r.seconds,
      points: acc.points + r.points,
      taskCount: acc.taskCount + r.taskCount,
      doneCount: acc.doneCount + r.doneCount,
    };
  }
  return acc;
}

/** Completion fraction 0..1, or null when the subtree has no tasks. */
export function completion(r: Rollup): number | null {
  return r.taskCount === 0 ? null : r.doneCount / r.taskCount;
}

export { EMPTY as EMPTY_ROLLUP };
