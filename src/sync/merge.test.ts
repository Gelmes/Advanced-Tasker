import { describe, expect, it } from 'vitest';
import type { SyncNode } from './flatten';
import { merge, unionHistory } from './merge';

/** Minimal SyncNode builder. */
function sn(id: string, over: Partial<SyncNode> = {}): SyncNode {
  return {
    id,
    parentId: null,
    orderKey: 'V',
    content: id,
    status: null,
    storyPoints: null,
    dueDate: null,
    collapsed: false,
    time: { accumulatedSeconds: 0, startedAt: null },
    statusHistory: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...over,
  };
}

const byId = (list: SyncNode[]) => Object.fromEntries(list.map((n) => [n.id, n]));

describe('merge', () => {
  it('(a) concurrent edits to DIFFERENT nodes — both survive', () => {
    const local = [sn('x', { content: 'x local' }), sn('y')];
    const remote = [sn('x'), sn('y', { content: 'y remote' })];
    const out = byId(merge(local, remote));
    expect(Object.keys(out).sort()).toEqual(['x', 'y']);
  });

  it('(b) concurrent edits to the SAME node — newer updatedAt wins', () => {
    const older = sn('x', { content: 'old', updatedAt: '2026-01-01T00:00:00.000Z' });
    const newer = sn('x', { content: 'new', updatedAt: '2026-06-01T00:00:00.000Z' });
    expect(byId(merge([older], [newer]))['x'].content).toBe('new');
    // Symmetric: order of arguments must not change the winner.
    expect(byId(merge([newer], [older]))['x'].content).toBe('new');
  });

  it('(b) LWW is per-node wholesale, not per-field', () => {
    const local = sn('x', {
      content: 'local',
      status: 'todo',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const remote = sn('x', {
      content: 'remote',
      status: 'done',
      updatedAt: '2026-06-01T00:00:00.000Z',
    });
    const m = byId(merge([local], [remote]))['x'];
    expect(m.content).toBe('remote');
    expect(m.status).toBe('done');
  });

  it('(c) delete newer than edit wins (node stays deleted)', () => {
    const edit = sn('x', { content: 'edited', updatedAt: '2026-01-01T00:00:00.000Z' });
    const del = sn('x', {
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: '2026-06-01T00:00:00.000Z',
    });
    expect(byId(merge([edit], [del]))['x'].deletedAt).toBe('2026-06-01T00:00:00.000Z');
    // Direction reversed — same outcome.
    expect(byId(merge([del], [edit]))['x'].deletedAt).toBe('2026-06-01T00:00:00.000Z');
  });

  it('(c) edit newer than delete resurrects the node', () => {
    const del = sn('x', {
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: '2026-01-01T00:00:00.000Z',
    });
    const edit = sn('x', { content: 'revived', updatedAt: '2026-06-01T00:00:00.000Z' });
    const m1 = byId(merge([del], [edit]))['x'];
    expect(m1.deletedAt).toBeNull();
    expect(m1.content).toBe('revived');
    const m2 = byId(merge([edit], [del]))['x'];
    expect(m2.deletedAt).toBeNull();
  });

  it('(c) two tombstones keep the later deletedAt', () => {
    const d1 = sn('x', { deletedAt: '2026-01-01T00:00:00.000Z' });
    const d2 = sn('x', { deletedAt: '2026-06-01T00:00:00.000Z' });
    expect(byId(merge([d1], [d2]))['x'].deletedAt).toBe('2026-06-01T00:00:00.000Z');
  });

  it('(d) statusHistory union + dedupe, sorted by at', () => {
    const local = sn('x', {
      statusHistory: [
        { at: '2026-01-01T00:00:00.000Z', status: 'todo' },
        { at: '2026-01-03T00:00:00.000Z', status: 'done' },
      ],
    });
    const remote = sn('x', {
      statusHistory: [
        { at: '2026-01-03T00:00:00.000Z', status: 'done' }, // duplicate
        { at: '2026-01-02T00:00:00.000Z', status: 'doing' },
      ],
    });
    const h = byId(merge([local], [remote]))['x'].statusHistory;
    expect(h).toEqual([
      { at: '2026-01-01T00:00:00.000Z', status: 'todo' },
      { at: '2026-01-02T00:00:00.000Z', status: 'doing' },
      { at: '2026-01-03T00:00:00.000Z', status: 'done' },
    ]);
  });

  it('(d) same timestamp, different status are both kept', () => {
    const a = sn('x', { statusHistory: [{ at: '2026-01-01T00:00:00.000Z', status: 'todo' }] });
    const b = sn('x', { statusHistory: [{ at: '2026-01-01T00:00:00.000Z', status: 'doing' }] });
    const h = byId(merge([a], [b]))['x'].statusHistory;
    expect(h).toHaveLength(2);
  });

  it('(e) a move (parentId + orderKey) merges by the newer side', () => {
    const local = sn('x', {
      parentId: 'p1',
      orderKey: 'V',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const moved = sn('x', {
      parentId: 'p2',
      orderKey: 'g',
      updatedAt: '2026-06-01T00:00:00.000Z',
    });
    const m = byId(merge([local], [moved]))['x'];
    expect(m.parentId).toBe('p2');
    expect(m.orderKey).toBe('g');
  });

  it('(f) order keys keep sibling order stable across a merge', () => {
    // Same three siblings on both sides, one edited on each — keys unchanged.
    const keys = { a: '1', b: '2', c: '3' } as const;
    const local = [
      sn('a', { parentId: 'p', orderKey: keys.a, content: 'a*', updatedAt: '2026-06-01T00:00:00.000Z' }),
      sn('b', { parentId: 'p', orderKey: keys.b }),
      sn('c', { parentId: 'p', orderKey: keys.c }),
    ];
    const remote = [
      sn('a', { parentId: 'p', orderKey: keys.a }),
      sn('b', { parentId: 'p', orderKey: keys.b, content: 'b*', updatedAt: '2026-06-01T00:00:00.000Z' }),
      sn('c', { parentId: 'p', orderKey: keys.c }),
    ];
    const out = byId(merge(local, remote));
    const ordered = ['a', 'b', 'c']
      .map((id) => out[id])
      .sort((x, y) => (x.orderKey < y.orderKey ? -1 : 1))
      .map((n) => n.id);
    expect(ordered).toEqual(['a', 'b', 'c']);
    expect(out['a'].content).toBe('a*');
    expect(out['b'].content).toBe('b*');
  });

  it('includes a node present on only one side, unchanged', () => {
    const local = [sn('only-local', { content: 'keep me' })];
    const remote = [sn('only-remote')];
    const out = byId(merge(local, remote));
    expect(out['only-local'].content).toBe('keep me');
    expect(out['only-remote']).toBeDefined();
  });
});

describe('unionHistory', () => {
  it('dedupes by at+status and sorts', () => {
    const h = unionHistory(
      [{ at: '2026-01-02T00:00:00.000Z', status: 'done' }],
      [
        { at: '2026-01-02T00:00:00.000Z', status: 'done' },
        { at: '2026-01-01T00:00:00.000Z', status: 'todo' },
      ],
    );
    expect(h).toEqual([
      { at: '2026-01-01T00:00:00.000Z', status: 'todo' },
      { at: '2026-01-02T00:00:00.000Z', status: 'done' },
    ]);
  });
});
