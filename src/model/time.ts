// Timer math (SPEC.md §2). Elapsed time = banked seconds + the live run since
// `startedAt`. Because `startedAt` is an absolute timestamp, elapsed stays correct
// across app restarts.

import type { TaskNode } from './types';

/** Seconds elapsed for a node at the given wall-clock time (ms since epoch). */
export function elapsedSeconds(node: TaskNode, nowMs: number): number {
  const { accumulatedSeconds, startedAt } = node.time;
  if (!startedAt) return accumulatedSeconds;
  const since = (nowMs - Date.parse(startedAt)) / 1000;
  return accumulatedSeconds + Math.max(0, since);
}

export function isRunning(node: TaskNode): boolean {
  return node.time.startedAt != null;
}

/** Move the live run into the banked total and clear the running marker. */
export function bankTime(node: TaskNode, nowMs: number): void {
  node.time.accumulatedSeconds = Math.round(elapsedSeconds(node, nowMs));
  node.time.startedAt = null;
}

/** Compact human duration: 45s, 12m, 1h03m, 2h. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h${String(rem).padStart(2, '0')}` : `${h}h`;
}
