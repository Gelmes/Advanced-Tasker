// Timer math (SPEC.md §2). Tracked time is a list of completed run intervals
// plus the live run since `startedAt` — elapsed stays correct across restarts,
// and intervals merge across devices by set union (SYNC.md "time"). All interval
// lists are kept normalized: sorted by start, overlaps/touches coalesced.

import type { TaskNode, TimeInterval } from './types';

/** Sum of a normalized interval list, in seconds. */
export function sumIntervals(intervals: TimeInterval[]): number {
  let total = 0;
  for (const iv of intervals) {
    total += Math.max(0, (Date.parse(iv.end) - Date.parse(iv.start)) / 1000);
  }
  return total;
}

/**
 * Normalize: sort by start and merge overlapping or touching intervals. Pure —
 * returns a new array. This is what makes union merges idempotent and keeps a
 * timer left running on two devices from double-counting the same wall-clock.
 */
export function coalesceIntervals(intervals: TimeInterval[]): TimeInterval[] {
  const valid = intervals.filter((iv) => Date.parse(iv.end) > Date.parse(iv.start));
  const sorted = [...valid].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  const out: TimeInterval[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv.start <= last.end) {
      if (iv.end > last.end) last.end = iv.end; // extend the open run
    } else {
      out.push({ ...iv });
    }
  }
  return out;
}

/** Union two interval lists (both sides kept, overlaps counted once). */
export function unionIntervals(a: TimeInterval[], b: TimeInterval[]): TimeInterval[] {
  return coalesceIntervals([...a, ...b]);
}

/** Seconds elapsed for a node at the given wall-clock time (ms since epoch). */
export function elapsedSeconds(node: TaskNode, nowMs: number): number {
  const { intervals, startedAt } = node.time;
  const banked = sumIntervals(intervals ?? []);
  if (!startedAt) return banked;
  const since = (nowMs - Date.parse(startedAt)) / 1000;
  return banked + Math.max(0, since);
}

export function isRunning(node: TaskNode): boolean {
  return node.time.startedAt != null;
}

/** Close the live run into a completed interval and clear the running marker. */
export function bankTime(node: TaskNode, nowMs: number): void {
  const { startedAt } = node.time;
  if (startedAt) {
    const end = new Date(Math.max(nowMs, Date.parse(startedAt))).toISOString();
    node.time.intervals = coalesceIntervals([
      ...(node.time.intervals ?? []),
      { start: startedAt, end },
    ]);
  }
  node.time.startedAt = null;
}

/**
 * Explicitly overwrite a node's banked effort (the details-panel correction for a
 * runaway timer). Replaces the interval list with one synthetic interval ending
 * now, and stamps `effortUpdatedAt` so the correction beats the union in merge.
 * If the timer is live, its run restarts from now so the total is exact at this
 * instant and keeps counting.
 */
export function setEffort(node: TaskNode, seconds: number, nowMs: number): void {
  const secs = Math.max(0, Math.round(seconds));
  const now = new Date(nowMs).toISOString();
  node.time.intervals = secs > 0 ? [{ start: new Date(nowMs - secs * 1000).toISOString(), end: now }] : [];
  node.time.effortUpdatedAt = now;
  if (node.time.startedAt) node.time.startedAt = now;
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
