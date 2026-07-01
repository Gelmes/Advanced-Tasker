import { describe, expect, it } from 'vitest';
import type { ProjectFile, TaskNode } from '../model/types';
import { createEmptyProject } from '../model/factory';
import { flatten, rebuild } from './flatten';

/** Full-shape node builder (all fields present so round-trip is exact). */
function n(id: string, children: TaskNode[] = [], over: Partial<TaskNode> = {}): TaskNode {
  return {
    id,
    content: id,
    status: null,
    storyPoints: null,
    time: { accumulatedSeconds: 0, startedAt: null },
    statusHistory: [],
    dueDate: null,
    collapsed: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    children,
    ...over,
  };
}

function sampleProject(): ProjectFile {
  const p = createEmptyProject('Round-trip');
  p.root.children = [
    n('a', [
      n('a1', [], { status: 'doing', storyPoints: 3 }),
      n('a2', [n('a2a', [], { dueDate: '2026-02-01' })], { collapsed: true }),
    ]),
    n('b', [], {
      status: 'done',
      statusHistory: [{ at: '2026-01-02T00:00:00.000Z', status: 'done' }],
      time: { accumulatedSeconds: 120, startedAt: null },
    }),
  ];
  return p;
}

describe('flatten / rebuild round-trip', () => {
  it('rebuild(flatten(p)) equals the original tree', () => {
    const p = sampleProject();
    const rebuilt = rebuild(flatten(p));
    expect(rebuilt.children).toEqual(p.root.children);
  });

  it('flatten addresses each node by parentId', () => {
    const flat = flatten(sampleProject());
    const byId = Object.fromEntries(flat.map((f) => [f.id, f]));
    expect(byId['a'].parentId).toBeNull();
    expect(byId['a1'].parentId).toBe('a');
    expect(byId['a2a'].parentId).toBe('a2');
    expect(byId['b'].parentId).toBeNull();
  });

  it('sibling order keys sort in tree order', () => {
    const flat = flatten(sampleProject());
    const top = flat.filter((f) => f.parentId === null);
    expect(top.map((f) => f.id)).toEqual(['a', 'b']);
    expect(top[0].orderKey < top[1].orderKey).toBe(true);
  });

  it('excludes tombstoned nodes from the rebuilt tree', () => {
    const flat = flatten(sampleProject());
    // Tombstone the a2 subtree (a2 + a2a), as a real subtree delete would.
    const dead = new Set(['a2', 'a2a']);
    const withTomb = flat.map((f) =>
      dead.has(f.id) ? { ...f, deletedAt: '2026-03-01T00:00:00.000Z' } : f,
    );
    const rebuilt = rebuild(withTomb);
    const a = rebuilt.children.find((c) => c.id === 'a')!;
    expect(a.children.map((c) => c.id)).toEqual(['a1']);
    // Nothing leaked to the top level either.
    expect(rebuilt.children.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('re-parents an orphan (live child of a tombstoned parent) to top level', () => {
    const flat = flatten(sampleProject());
    // Only a2 is deleted; its live child a2a must not be silently dropped.
    const withTomb = flat.map((f) =>
      f.id === 'a2' ? { ...f, deletedAt: '2026-03-01T00:00:00.000Z' } : f,
    );
    const rebuilt = rebuild(withTomb);
    expect(rebuilt.children.map((c) => c.id).sort()).toEqual(['a', 'a2a', 'b']);
  });

  it('order is stable under a shuffled flat list (rebuild sorts by key)', () => {
    const flat = flatten(sampleProject());
    const shuffled = [...flat].reverse();
    const rebuilt = rebuild(shuffled);
    expect(rebuilt.children.map((c) => c.id)).toEqual(['a', 'b']);
    const a = rebuilt.children[0];
    expect(a.children.map((c) => c.id)).toEqual(['a1', 'a2']);
  });
});
