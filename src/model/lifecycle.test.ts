import { describe, expect, it } from 'vitest';
import {
  completedAt,
  cycleTimeSeconds,
  isCompleted,
  leadTimeSeconds,
  startedAt,
  type KindOf,
} from './lifecycle';
import type { StatusEvent, TaskNode } from './types';

// doing/blocked are 'active', done is 'done', todo is 'todo'.
const kindOf: KindOf = (id) =>
  id === 'done' ? 'done' : id === 'todo' ? 'todo' : 'active';

function node(createdAt: string, history: StatusEvent[]): TaskNode {
  return {
    id: 'n',
    content: '',
    status: history.length ? history[history.length - 1].status : null,
    storyPoints: null,
    time: { intervals: [], startedAt: null },
    statusHistory: history,
    collapsed: false,
    createdAt,
    updatedAt: createdAt,
    children: [],
  };
}

const T = (h: number) => `2026-01-01T0${h}:00:00.000Z`;

describe('lifecycle', () => {
  it('startedAt is the first active (or done) transition', () => {
    const n = node(T(0), [
      { at: T(1), status: 'todo' },
      { at: T(2), status: 'doing' },
      { at: T(3), status: 'blocked' },
    ]);
    expect(startedAt(n, kindOf)).toBe(T(2));
  });

  it('completedAt is set only when currently done', () => {
    const done = node(T(0), [
      { at: T(2), status: 'doing' },
      { at: T(4), status: 'done' },
    ]);
    expect(completedAt(done, kindOf)).toBe(T(4));
    expect(isCompleted(done, kindOf)).toBe(true);
  });

  it('a reopen clears completedAt', () => {
    const reopened = node(T(0), [
      { at: T(2), status: 'doing' },
      { at: T(4), status: 'done' },
      { at: T(5), status: 'doing' }, // reopened
    ]);
    expect(completedAt(reopened, kindOf)).toBeNull();
    expect(isCompleted(reopened, kindOf)).toBe(false);
  });

  it('computes cycle and lead time in seconds', () => {
    const n = node(T(0), [
      { at: T(1), status: 'doing' },
      { at: T(4), status: 'done' },
    ]);
    expect(cycleTimeSeconds(n, kindOf)).toBe(3 * 3600); // started→done
    expect(leadTimeSeconds(n, kindOf)).toBe(4 * 3600); // created→done
  });

  it('returns null timings when never started or not done', () => {
    const todo = node(T(0), [{ at: T(1), status: 'todo' }]);
    expect(startedAt(todo, kindOf)).toBeNull();
    expect(cycleTimeSeconds(todo, kindOf)).toBeNull();
  });
});
