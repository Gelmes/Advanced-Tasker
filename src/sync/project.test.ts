import { describe, expect, it } from 'vitest';
import type { ProjectFile, StatusDef, TaskNode } from '../model/types';
import { createEmptyProject } from '../model/factory';
import { ensureOrderKeys } from '../model/orderKey';
import { fingerprint, mergeProjects, mergeStatuses } from './project';

function node(id: string, over: Partial<TaskNode> = {}): TaskNode {
  return {
    id,
    content: id,
    status: null,
    storyPoints: null,
    time: { accumulatedSeconds: 0, startedAt: null },
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
    const local = [active('todo'), active('x')];
    const remote = [active('todo'), active('y')];
    expect(mergeStatuses(local, remote).map((s) => s.id).sort()).toEqual(['todo', 'x', 'y']);
  });

  it('per-status last-write-wins by updatedAt, symmetric', () => {
    const older = { ...active('todo', '2026-01-01T00:00:00.000Z'), color: '#000000' };
    const newer = { ...active('todo', '2026-06-01T00:00:00.000Z'), color: '#ffffff' };
    expect(mergeStatuses([older], [newer])[0].color).toBe('#ffffff');
    expect(mergeStatuses([newer], [older])[0].color).toBe('#ffffff');
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
