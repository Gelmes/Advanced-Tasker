import { describe, expect, it } from 'vitest';
import type { ProjectFile, TaskNode } from '../model/types';
import { createEmptyProject } from '../model/factory';
import { ensureOrderKeys } from '../model/orderKey';
import { insertSiblingAfter, moveWithinSiblings } from '../model/tree';
import { flatten, rebuild } from './flatten';
import { merge } from './merge';

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
    ensureOrderKeys(p.root.children); // a real loaded project is always keyed
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

/** Depth-first list of every id in a rebuilt tree (to check nothing is lost/duplicated). */
function allIds(children: TaskNode[]): string[] {
  const out: string[] = [];
  const visit = (ns: TaskNode[]) => ns.forEach((c) => (out.push(c.id), visit(c.children)));
  visit(children);
  return out;
}

describe('rebuild breaks parent cycles (concurrent-move safety)', () => {
  it('keeps both nodes when a merge left a 2-node parentId cycle', () => {
    // Concurrent moves: device A put x under y, device B put y under x. After merge
    // both parentId edges survive → x.parent=y AND y.parent=x. Naively, rebuild from
    // the root reaches neither and drops both subtrees. It must not.
    const p = createEmptyProject('cycle');
    p.root.children = [n('x'), n('y')];
    const flat = flatten(p).map((f) =>
      f.id === 'x' ? { ...f, parentId: 'y' } : f.id === 'y' ? { ...f, parentId: 'x' } : f,
    );
    const ids = allIds(rebuild(flat).children);
    expect(ids.sort()).toEqual(['x', 'y']); // both present, exactly once
  });

  it('breaks a 3-node cycle deterministically and keeps a live child attached', () => {
    // x→y→z→x, and z has a real child c. All four must survive as one valid tree.
    const p = createEmptyProject('cycle3');
    p.root.children = [n('x'), n('y'), n('z', [n('c')])];
    const parent: Record<string, string> = { x: 'y', y: 'z', z: 'x' };
    const flat = flatten(p).map((f) => (parent[f.id] ? { ...f, parentId: parent[f.id] } : f));
    const ids = allIds(rebuild(flat).children);
    expect(ids.sort()).toEqual(['c', 'x', 'y', 'z']);
  });

  it('is order-independent: a shuffled cyclic list rebuilds the same id set', () => {
    const p = createEmptyProject('cycle-shuffle');
    p.root.children = [n('x'), n('y')];
    const flat = flatten(p).map((f) =>
      f.id === 'x' ? { ...f, parentId: 'y' } : f.id === 'y' ? { ...f, parentId: 'x' } : f,
    );
    expect(allIds(rebuild(flat).children).sort()).toEqual(
      allIds(rebuild([...flat].reverse()).children).sort(),
    );
  });
});

describe('persisted order keys', () => {
  it('an insert keeps the neighbours’ keys and slots the new node strictly between', () => {
    const p = createEmptyProject('k');
    p.root.children = [n('a'), n('b')];
    ensureOrderKeys(p.root.children);
    const ka = p.root.children[0].orderKey!;
    const kb = p.root.children[1].orderKey!;
    const id = insertSiblingAfter(p.root.children, 'a'); // between a and b
    const byId = Object.fromEntries(p.root.children.map((c) => [c.id, c]));
    expect(byId['a'].orderKey).toBe(ka); // unchanged
    expect(byId['b'].orderKey).toBe(kb); // unchanged
    expect(ka < byId[id].orderKey! && byId[id].orderKey! < kb).toBe(true);
  });

  it('a reorder rekeys only the moved node and stays sorted', () => {
    const p = createEmptyProject('k');
    p.root.children = [n('a'), n('b'), n('c')];
    ensureOrderKeys(p.root.children);
    const before = Object.fromEntries(p.root.children.map((c) => [c.id, c.orderKey]));
    moveWithinSiblings(p.root.children, 'c', -1); // [a, c, b]
    const after = Object.fromEntries(p.root.children.map((c) => [c.id, c.orderKey]));
    expect(after['a']).toBe(before['a']); // untouched
    expect(after['b']).toBe(before['b']); // untouched
    expect(after['c']).not.toBe(before['c']); // rekeyed to its new slot
    const keys = p.root.children.map((c) => c.orderKey!);
    expect(keys).toEqual([...keys].sort());
    expect(p.root.children.map((c) => c.id)).toEqual(['a', 'c', 'b']);
  });

  it('(payoff) concurrent inserts on two devices merge into one valid order', () => {
    // Shared, already-keyed base [a, b]; each device inserts between a and b.
    const base = createEmptyProject('k');
    base.root.children = [n('a'), n('b')];
    ensureOrderKeys(base.root.children);

    const a: ProjectFile = { ...base, root: rebuild(flatten(base)) };
    const b: ProjectFile = { ...base, root: rebuild(flatten(base)) };
    const xId = insertSiblingAfter(a.root.children, 'a'); // A: [a, x, b]
    const yId = insertSiblingAfter(b.root.children, 'a'); // B: [a, y, b]

    const order = rebuild(merge(flatten(a), flatten(b))).children.map((c) => c.id);
    // a stays first, b stays last, and both inserts land between them — the stored
    // keys keep this stable, which the old regenerate-from-position scheme could not.
    expect(order[0]).toBe('a');
    expect(order[order.length - 1]).toBe('b');
    expect([...order].sort()).toEqual(['a', 'b', xId, yId].sort());
  });
});
