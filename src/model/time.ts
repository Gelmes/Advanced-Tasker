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

/**
 * Parse a human duration into seconds — the inverse of `formatDuration`.
 * Accepts h/m/s tokens in any combination (`1h30m`, `2h`, `45s`, `1h03m`) and a
 * bare number, which is read as minutes (`90` → 90m). Returns null if nothing
 * parses, so callers can reject bad input and leave the value unchanged.
 */
export function parseDuration(input: string): number | null {
  const str = input.trim().toLowerCase();
  if (!str) return null;
  // A bare number is the common case when correcting a timer: read it as minutes.
  if (/^\d+(\.\d+)?$/.test(str)) return Math.round(parseFloat(str) * 60);
  // `formatDuration` renders "1h30" (hours + zero-padded minutes, no trailing m);
  // normalise that bare-minutes tail to an explicit "m" so the token scan reads it.
  const norm = str.replace(/(\d)h(\d+)(?![\dhms])/g, '$1h$2m');
  const re = /(\d+(?:\.\d+)?)\s*([hms])/g;
  let total = 0;
  let matched = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(norm)) !== null) {
    matched = true;
    const val = parseFloat(m[1]);
    total += m[2] === 'h' ? val * 3600 : m[2] === 'm' ? val * 60 : val;
  }
  return matched ? Math.round(total) : null;
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
