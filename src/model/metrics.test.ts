import { describe, expect, it } from 'vitest';
import { completion, computeRollup } from './rollups';
import { bankTime, elapsedSeconds, formatDuration } from './time';
import type { TaskNode } from './types';

function node(partial: Partial<TaskNode> & { id: string }): TaskNode {
  return {
    content: partial.id,
    status: null,
    storyPoints: null,
    time: { accumulatedSeconds: 0, startedAt: null },
    collapsed: false,
    createdAt: '',
    updatedAt: '',
    children: [],
    ...partial,
  };
}

const T0 = Date.parse('2026-01-01T00:00:00.000Z');

describe('elapsedSeconds', () => {
  it('returns banked seconds when stopped', () => {
    const n = node({ id: 'a', time: { accumulatedSeconds: 90, startedAt: null } });
    expect(elapsedSeconds(n, T0)).toBe(90);
  });

  it('adds the live run when running', () => {
    const n = node({
      id: 'a',
      time: { accumulatedSeconds: 10, startedAt: new Date(T0).toISOString() },
    });
    expect(elapsedSeconds(n, T0 + 30_000)).toBe(40); // 10 banked + 30s live
  });
});

describe('bankTime', () => {
  it('folds the live run into the banked total and stops', () => {
    const n = node({
      id: 'a',
      time: { accumulatedSeconds: 5, startedAt: new Date(T0).toISOString() },
    });
    bankTime(n, T0 + 20_000);
    expect(n.time.accumulatedSeconds).toBe(25);
    expect(n.time.startedAt).toBeNull();
  });
});

describe('formatDuration', () => {
  it('formats across units', () => {
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(12 * 60)).toBe('12m');
    expect(formatDuration(63 * 60)).toBe('1h03');
    expect(formatDuration(120 * 60)).toBe('2h');
  });
});

describe('computeRollup', () => {
  const tree = node({
    id: 'root',
    status: 'doing',
    storyPoints: 3,
    time: { accumulatedSeconds: 100, startedAt: null },
    children: [
      node({ id: 'c1', status: 'done', storyPoints: 2, time: { accumulatedSeconds: 50, startedAt: null } }),
      node({ id: 'c2', status: 'todo', time: { accumulatedSeconds: 25, startedAt: null } }),
      node({ id: 'note', time: { accumulatedSeconds: 5, startedAt: null } }), // a note
    ],
  });

  it('sums time and points over the subtree (self included)', () => {
    const r = computeRollup(tree, 'done', T0);
    expect(r.seconds).toBe(180);
    expect(r.points).toBe(5);
  });

  it('counts only tasks for completion, excluding notes', () => {
    const r = computeRollup(tree, 'done', T0);
    expect(r.taskCount).toBe(3); // root, c1, c2 — the note is excluded
    expect(r.doneCount).toBe(1);
    expect(completion(r)).toBeCloseTo(1 / 3);
  });

  it('returns null completion when there are no tasks', () => {
    const notesOnly = node({ id: 'n', children: [node({ id: 'n2' })] });
    expect(completion(computeRollup(notesOnly, 'done', T0))).toBeNull();
  });
});
