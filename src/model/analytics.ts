// Time-series + stats for the charts (SPEC.md §6). Pure and tested. Burnup/burndown
// REPLAY the status history per day (a task counts as done on day D if its latest
// transition as of end-of-D is a done-kind), so reopens are handled correctly over
// time — not just by the current completedAt.

import { completedAt, cycleTimeSeconds, leadTimeSeconds, type KindOf } from './lifecycle';
import type { StatusKind, TaskNode } from './types';

const DAY = 86_400_000;

/** UTC midnight at or before ms. */
export function dayStart(ms: number): number {
  return Math.floor(ms / DAY) * DAY;
}

/** Inclusive list of UTC day-starts from startMs's day to endMs's day. */
export function dayRange(startMs: number, endMs: number): number[] {
  const out: number[] = [];
  for (let d = dayStart(startMs); d <= dayStart(endMs); d += DAY) out.push(d);
  return out;
}

/** The status kind in effect at time atMs (null before the first transition). */
export function statusKindAsOf(node: TaskNode, atMs: number, kindOf: KindOf): StatusKind | null {
  let kind: StatusKind | null = null;
  for (const e of node.statusHistory ?? []) {
    if (Date.parse(e.at) <= atMs) kind = kindOf(e.status) ?? null;
    else break; // history is chronological
  }
  return kind;
}

/** All work items in a subtree (excludes the root container and plain notes). */
export function collectTasks(root: TaskNode): TaskNode[] {
  const out: TaskNode[] = [];
  const visit = (nodes: TaskNode[]) => {
    for (const n of nodes) {
      const isTask = n.status != null || (n.statusHistory?.length ?? 0) > 0;
      if (isTask) out.push(n);
      visit(n.children);
    }
  };
  visit(root.children);
  return out;
}

export interface BurnPoint {
  day: number;
  scope: number; // cumulative story points in scope (created on/before the day)
  done: number; // cumulative story points done as of end of the day
}

export function burnupSeries(tasks: TaskNode[], days: number[], kindOf: KindOf): BurnPoint[] {
  return days.map((d) => {
    const end = d + DAY - 1;
    let scope = 0;
    let done = 0;
    for (const t of tasks) {
      if (Date.parse(t.createdAt) > end) continue; // not created yet
      const pts = t.storyPoints ?? 0;
      scope += pts;
      if (statusKindAsOf(t, end, kindOf) === 'done') done += pts;
    }
    return { day: d, scope, done };
  });
}

export interface BurndownPoint {
  day: number;
  remaining: number; // scope - done
  ideal: number; // straight line from start scope to 0 at the due day
}

/**
 * Classic burndown: actual remaining per day plus an ideal line from the first
 * day's scope down to 0 at `dueMs` (or the last day if no due date is set).
 */
export function burndownSeries(burnup: BurnPoint[], dueMs: number | null): BurndownPoint[] {
  if (!burnup.length) return [];
  const startScope = burnup[0].scope;
  const startDay = burnup[0].day;
  const endDay = dueMs != null ? dayStart(dueMs) : burnup[burnup.length - 1].day;
  const span = Math.max(1, endDay - startDay);
  return burnup.map((p) => {
    const t = Math.min(1, Math.max(0, (p.day - startDay) / span));
    return { day: p.day, remaining: p.scope - p.done, ideal: startScope * (1 - t) };
  });
}

export interface CycleItem {
  id: string;
  content: string;
  completedAt: string;
  cycleSec: number;
  leadSec: number | null;
}

/** Completed tasks with their cycle/lead times, newest completion first. */
export function cycleItems(tasks: TaskNode[], kindOf: KindOf): CycleItem[] {
  const items: CycleItem[] = [];
  for (const t of tasks) {
    const done = completedAt(t, kindOf);
    const cycle = cycleTimeSeconds(t, kindOf);
    if (done == null || cycle == null) continue;
    items.push({
      id: t.id,
      content: t.content,
      completedAt: done,
      cycleSec: cycle,
      leadSec: leadTimeSeconds(t, kindOf),
    });
  }
  return items.sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
}

export function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Nearest-rank percentile (p in 0..1). */
export function percentile(nums: number[], p: number): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const rank = Math.ceil(p * s.length);
  return s[Math.min(s.length - 1, Math.max(0, rank - 1))];
}

export function mean(nums: number[]): number | null {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

// --- Throughput & forecasting ------------------------------------------------

/** Points completed each day (positive deltas of the burnup done-series). */
export function dailyThroughput(burnup: BurnPoint[]): number[] {
  const out: number[] = [];
  let prev = 0;
  for (const p of burnup) {
    out.push(Math.max(0, p.done - prev));
    prev = p.done;
  }
  return out;
}

export interface WeekBucket {
  weekStart: number;
  points: number;
}

/** Completed points grouped into 7-day buckets aligned to the first day. */
export function weeklyBuckets(burnup: BurnPoint[]): WeekBucket[] {
  const daily = dailyThroughput(burnup);
  const buckets: WeekBucket[] = [];
  for (let i = 0; i < burnup.length; i++) {
    const wk = Math.floor(i / 7);
    if (!buckets[wk]) buckets[wk] = { weekStart: burnup[i].day, points: 0 };
    buckets[wk].points += daily[i];
  }
  return buckets.filter(Boolean);
}

/** Average points completed per 7-day week over the observed window. */
export function averageWeeklyThroughput(daily: number[]): number {
  if (!daily.length) return 0;
  return (daily.reduce((a, b) => a + b, 0) / daily.length) * 7;
}

export interface Forecast {
  p50Days: number;
  p85Days: number;
}

/**
 * Monte-Carlo finish forecast: sample observed daily throughput (with replacement)
 * until `remaining` points are burned down, repeated `runs` times. Returns the day
 * counts at the 50th and 85th percentiles. Null when there's no throughput to
 * sample. `rng` is injectable for deterministic tests.
 */
export function monteCarloForecast(
  remaining: number,
  daily: number[],
  runs = 1000,
  rng: () => number = Math.random,
): Forecast | null {
  if (remaining <= 0) return { p50Days: 0, p85Days: 0 };
  if (!daily.length || !daily.some((d) => d > 0)) return null;

  const MAX_DAYS = 365 * 3;
  const results: number[] = [];
  for (let r = 0; r < runs; r++) {
    let acc = 0;
    let days = 0;
    while (acc < remaining && days < MAX_DAYS) {
      acc += daily[Math.floor(rng() * daily.length)] ?? 0;
      days++;
    }
    results.push(days);
  }
  results.sort((a, b) => a - b);
  const at = (p: number) => results[Math.min(results.length - 1, Math.floor(p * results.length))];
  return { p50Days: at(0.5), p85Days: at(0.85) };
}
