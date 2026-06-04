import { describe, expect, it } from 'vitest';
import {
  averageWeeklyThroughput,
  burndownSeries,
  burnupSeries,
  collectTasks,
  cycleItems,
  dailyThroughput,
  dayRange,
  median,
  monteCarloForecast,
  percentile,
  statusKindAsOf,
  weeklyBuckets,
  type BurnPoint,
} from './analytics';
import type { KindOf } from './lifecycle';
import type { ProjectFile } from './types';
import demo from '../../examples/sprint-demo.json';

const project = demo as unknown as ProjectFile;
const kindOf: KindOf = (id) => project.statuses.find((s) => s.id === id)?.kind;
const epic = project.root.children[0];
const tasks = collectTasks(epic);
const NOW = Date.parse('2026-06-03T12:00:00.000Z');

const start = Math.min(...tasks.map((t) => Date.parse(t.createdAt)));
const days = dayRange(start, NOW);
const burnup = burnupSeries(tasks, days, kindOf);
const onDay = (d: string) =>
  burnup.find((p) => p.day === Date.parse(`${d}T00:00:00.000Z`))!;

describe('collectTasks', () => {
  it('returns the 10 work items (note + epic excluded)', () => {
    expect(tasks).toHaveLength(10);
  });
});

describe('statusKindAsOf (replay)', () => {
  const bug = tasks.find((t) => t.content === 'Bug: logout crash')!;
  it('reflects the reopen over time', () => {
    expect(statusKindAsOf(bug, Date.parse('2026-06-01T13:00:00Z'), kindOf)).toBe('done');
    expect(statusKindAsOf(bug, Date.parse('2026-06-02T13:00:00Z'), kindOf)).toBe('active');
    expect(statusKindAsOf(bug, Date.parse('2026-06-03T13:00:00Z'), kindOf)).toBe('done');
  });
});

describe('burnupSeries', () => {
  it('grows scope and done over the sprint', () => {
    expect(onDay('2026-05-22')).toMatchObject({ scope: 27, done: 8 });
    // bug is reopened on 06-02 (not done), then done again on 06-03
    expect(onDay('2026-06-02')).toMatchObject({ scope: 55, done: 35 });
    expect(onDay('2026-06-03')).toMatchObject({ scope: 55, done: 37 });
  });
});

describe('burndownSeries', () => {
  it('tracks remaining and an ideal line to the due date', () => {
    const due = Date.parse('2026-06-05T00:00:00Z');
    const bd = burndownSeries(burnup, due);
    expect(bd[0].remaining).toBe(burnup[0].scope - burnup[0].done);
    expect(bd[0].ideal).toBeCloseTo(burnup[0].scope); // full at the start
    expect(bd[bd.length - 1].remaining).toBe(18); // 55 - 37
  });
});

describe('cycleItems + stats', () => {
  it('lists completed tasks with cycle times', () => {
    const items = cycleItems(tasks, kindOf);
    expect(items).toHaveLength(8); // 8 currently-done tasks
    const bug = items.find((i) => i.content === 'Bug: logout crash')!;
    expect(bug.cycleSec).toBe(49.5 * 3600);
  });

  it('computes median and percentile', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.85)).toBe(9);
  });
});

describe('throughput + forecast', () => {
  // Synthetic burnup: done climbs 0,2,2,5 over 4 days (deltas 2,0,3).
  const bp = (done: number, day: number): BurnPoint => ({ day, scope: 10, done });
  const synth = [bp(0, 0), bp(2, 1), bp(2, 2), bp(5, 3)];

  it('derives positive daily throughput', () => {
    expect(dailyThroughput(synth)).toEqual([0, 2, 0, 3]);
  });

  it('averages weekly throughput', () => {
    // total 5 over 4 days → (5/4)*7
    expect(averageWeeklyThroughput(dailyThroughput(synth))).toBeCloseTo((5 / 4) * 7);
  });

  it('buckets throughput into weeks', () => {
    const tenDays = Array.from({ length: 10 }, (_, i) => bp(i, i)); // 1/day
    expect(weeklyBuckets(tenDays)).toHaveLength(2); // 7 + 3
  });

  it('forecasts deterministically with a fixed rng', () => {
    // rng always 0 → always samples daily[0]=4 → 12 points needs 3 days.
    const f = monteCarloForecast(12, [4, 0, 0], 200, () => 0)!;
    expect(f.p50Days).toBe(3);
    expect(f.p85Days).toBe(3);
  });

  it('returns null when there is no throughput', () => {
    expect(monteCarloForecast(5, [0, 0, 0], 100, () => 0)).toBeNull();
  });
});
