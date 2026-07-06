import { describe, expect, it } from 'vitest';
import type { ProjectFile, StatusDef, TaskNode } from '../model/types';
import { createEmptyProject } from '../model/factory';
import { ensureOrderKeys } from '../model/orderKey';
import { applyLocalView, fingerprint, mergeProjects, mergeStatuses } from './project';

function node(id: string, over: Partial<TaskNode> = {}): TaskNode {
  return {
    id,
    content: id,
    status: null,
    storyPoints: null,
    time: { intervals: [], startedAt: null },
    statusHistory: [],
    collapsed: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    children: [],
    ...over,
  };
}

/** A project sharing `base`'s id (two versions of the same project), with `nodes`. */
function version(base: ProjectFile, over: Partial<ProjectFile>, nodes: TaskNode[] = []): ProjectFile {
  ensureOrderKeys(nodes);
  return { ...base, statuses: base.statuses.map((s) => ({ ...s })), root: { children: nodes }, ...over };
}

const active = (id: string, updatedAt?: string): StatusDef => ({
  id,
  label: id,
  color: '#123456',
  kind: 'active',
  updatedAt,
});

describe('mergeStatuses', () => {
  it('unions statuses added on either side (no additive loss)', () => {
    const local = { statuses: [active('todo'), active('x')] };
    const remote = { statuses: [active('todo'), active('y')] };
    expect(
      mergeStatuses(local, remote)
        .statuses.map((s) => s.id)
        .sort(),
    ).toEqual(['todo', 'x', 'y']);
  });

  it('per-status last-write-wins by updatedAt, symmetric', () => {
    const older = { statuses: [{ ...active('todo', '2026-01-01T00:00:00.000Z'), color: '#000000' }] };
    const newer = { statuses: [{ ...active('todo', '2026-06-01T00:00:00.000Z'), color: '#ffffff' }] };
    expect(mergeStatuses(older, newer).statuses[0].color).toBe('#ffffff');
    expect(mergeStatuses(newer, older).statuses[0].color).toBe('#ffffff');
  });

  it('a status tombstone kills the status on the side that still has it', () => {
    const local = {
      statuses: [active('todo')],
      statusTombstones: { blocked: '2026-06-01T00:00:00.000Z' },
    };
    const remote = { statuses: [active('todo'), active('blocked', '2026-01-01T00:00:00.000Z')] };
    const out = mergeStatuses(local, remote);
    expect(out.statuses.map((s) => s.id)).toEqual(['todo']);
    expect(out.statusTombstones.blocked).toBe('2026-06-01T00:00:00.000Z'); // propagates onward
    // Symmetric.
    const out2 = mergeStatuses(remote, local);
    expect(out2.statuses.map((s) => s.id)).toEqual(['todo']);
  });

  it('a status edited after the deletion resurrects (tombstone dropped)', () => {
    const local = { statuses: [], statusTombstones: { blocked: '2026-01-01T00:00:00.000Z' } };
    const remote = { statuses: [active('blocked', '2026-06-01T00:00:00.000Z')] };
    const out = mergeStatuses(local, remote);
    expect(out.statuses.map((s) => s.id)).toEqual(['blocked']);
    expect(out.statusTombstones.blocked).toBeUndefined();
  });

  it('two tombstones keep the later deletion time', () => {
    const a = { statuses: [], statusTombstones: { x: '2026-01-01T00:00:00.000Z' } };
    const b = { statuses: [], statusTombstones: { x: '2026-06-01T00:00:00.000Z' } };
    expect(mergeStatuses(a, b).statusTombstones.x).toBe('2026-06-01T00:00:00.000Z');
  });
});

describe('mergeProjects', () => {
  it('merges project name by updatedAt (LWW), symmetric', () => {
    const base = createEmptyProject('Proj');
    const local = version(base, { name: 'Old', updatedAt: '2026-01-01T00:00:00.000Z' });
    const remote = version(base, { name: 'New', updatedAt: '2026-06-01T00:00:00.000Z' });
    expect(mergeProjects(local, remote).name).toBe('New');
    expect(mergeProjects(remote, local).name).toBe('New'); // order-independent
  });

  it('merges the node trees (delegates to merge)', () => {
    const base = createEmptyProject('Proj');
    const local = version(base, {}, [node('a', { content: 'a-local' })]);
    const remote = version(base, {}, [node('b', { content: 'b-remote' })]);
    const ids = mergeProjects(local, remote).root.children.map((c) => c.id).sort();
    expect(ids).toEqual(['a', 'b']);
  });

  it('(#4) clears activeTimerNodeId when its node did not survive the merge', () => {
    const base = createEmptyProject('Proj');
    const local = version(
      base,
      { activeTimerNodeId: 't', updatedAt: '2026-06-01T00:00:00.000Z' },
      [node('t')],
    );
    // Remote tombstoned node t (a delete travels as a tombstone at the sync boundary).
    const remote = version(base, {}, [node('t', { deletedAt: '2026-06-02T00:00:00.000Z' })]);
    const merged = mergeProjects(local, remote);
    expect(merged.root.children.find((c) => c.id === 't')).toBeUndefined();
    expect(merged.activeTimerNodeId).toBeNull();
  });

  it('(#4) demotes a node whose status did not survive the merge', () => {
    const base = createEmptyProject('Proj'); // default statuses; no "ghost"
    const local = version(base, {}, [node('n', { status: 'ghost' })]);
    const remote = version(base, {}, []);
    const merged = mergeProjects(local, remote);
    expect(merged.root.children.find((c) => c.id === 'n')!.status).toBeNull();
  });

  it('fingerprint is stable across a clone but changes when a node updates', () => {
    const base = createEmptyProject('F');
    const p = version(base, {}, [node('a'), node('b')]);
    expect(fingerprint(p)).toBe(fingerprint(JSON.parse(JSON.stringify(p))));
    const edited = version(base, {}, [
      node('a', { updatedAt: '2027-01-01T00:00:00.000Z' }),
      node('b'),
    ]);
    expect(fingerprint(edited)).not.toBe(fingerprint(p));
  });

  it('(deletes) a tombstoned node stays deleted — does not resurrect from the other side', () => {
    const base = createEmptyProject('D');
    // Local deleted "a": gone from the tree, recorded as a tombstone.
    const local = version(base, { tombstones: { a: '2026-06-01T00:00:00.000Z' } }, []);
    // Remote still has "a" live (edited before the delete).
    const remote = version(base, {}, [node('a', { updatedAt: '2026-01-01T00:00:00.000Z' })]);
    const merged = mergeProjects(local, remote);
    expect(merged.root.children.find((c) => c.id === 'a')).toBeUndefined();
    expect(merged.tombstones?.a).toBe('2026-06-01T00:00:00.000Z'); // tombstone kept, propagates
  });

  it('(deletes) an edit newer than the delete resurrects the node', () => {
    const base = createEmptyProject('D');
    const local = version(base, { tombstones: { a: '2026-01-01T00:00:00.000Z' } }, []);
    const remote = version(base, {}, [
      node('a', { content: 'revived', updatedAt: '2026-06-01T00:00:00.000Z' }),
    ]);
    const merged = mergeProjects(local, remote);
    expect(merged.root.children.find((c) => c.id === 'a')?.content).toBe('revived');
    expect(merged.tombstones?.a).toBeUndefined(); // resurrected → tombstone dropped
  });

  it('(statuses) a deleted status stays deleted and its tasks are demoted everywhere', () => {
    const base = createEmptyProject('S');
    // Local deleted the "doing" status (tombstoned); remote still has it AND a task using it.
    const local = version(base, {
      statuses: base.statuses.filter((s) => s.id !== 'doing').map((s) => ({ ...s })),
      statusTombstones: { doing: '2026-06-01T00:00:00.000Z' },
    });
    const remote = version(base, {}, [
      node('n', { status: 'doing', updatedAt: '2026-01-01T00:00:00.000Z' }),
    ]);
    const merged = mergeProjects(local, remote);
    expect(merged.statuses.find((s) => s.id === 'doing')).toBeUndefined();
    expect(merged.statusTombstones?.doing).toBe('2026-06-01T00:00:00.000Z');
    // The task survives but is demoted to a note (integrity pass).
    expect(merged.root.children.find((c) => c.id === 'n')!.status).toBeNull();
  });

  it('applyLocalView keeps this device’s collapse state when adopting a merge', () => {
    const base = createEmptyProject('V');
    const local = version(base, {}, [node('a', { collapsed: true, children: [node('a1')] })]);
    // The merged project came back from the server with a expanded.
    const merged = version(base, {}, [node('a', { collapsed: false, children: [node('a1')] })]);
    applyLocalView(merged, local);
    expect(merged.root.children[0].collapsed).toBe(true); // local view preserved
  });

  it('is order-independent for statuses and metadata', () => {
    const base = createEmptyProject('Proj');
    const a = version(base, {
      name: 'A',
      updatedAt: '2026-05-01T00:00:00.000Z',
      statuses: [...base.statuses, active('x', '2026-05-01T00:00:00.000Z')],
    });
    const b = version(base, {
      name: 'B',
      updatedAt: '2026-06-01T00:00:00.000Z',
      statuses: [...base.statuses, active('y', '2026-06-01T00:00:00.000Z')],
    });
    const ab = mergeProjects(a, b);
    const ba = mergeProjects(b, a);
    expect(ab.name).toBe(ba.name);
    expect(ab.statuses.map((s) => s.id).sort()).toEqual(ba.statuses.map((s) => s.id).sort());
  });
});
