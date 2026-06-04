import { describe, expect, it } from 'vitest';
import { cycleTimeSeconds, isCompleted, type KindOf } from './lifecycle';
import { completion, computeRollup } from './rollups';
import type { ProjectFile, TaskNode } from './types';
import demo from '../../examples/sprint-demo.json';

// Validates the generated demo project (examples/sprint-demo.json) by running the
// real derivations on it — guards both the data and the analytics code.

const project = demo as unknown as ProjectFile;
const kindOf: KindOf = (id) => project.statuses.find((s) => s.id === id)?.kind;
const doneIds = new Set(project.statuses.filter((s) => s.kind === 'done').map((s) => s.id));
const NOW = Date.parse('2026-06-03T12:00:00.000Z');

function findByContent(nodes: TaskNode[], text: string): TaskNode | null {
  for (const n of nodes) {
    if (n.content === text) return n;
    const found = findByContent(n.children, text);
    if (found) return found;
  }
  return null;
}

const epic = project.root.children[0];

describe('demo project', () => {
  it('rolls up the sprint correctly', () => {
    const r = computeRollup(epic, (id) => doneIds.has(id), NOW);
    expect(r.points).toBe(55);
    expect(r.taskCount).toBe(11); // epic + 10 tasks (the note is excluded)
    expect(r.doneCount).toBe(8);
    expect(completion(r)).toBeCloseTo(8 / 11);
  });

  it('computes cycle time for a completed task', () => {
    const ci = findByContent([epic], 'Set up CI pipeline')!;
    expect(cycleTimeSeconds(ci, kindOf)).toBe(25.5 * 3600); // 05-19 09:30 → 05-20 11:00
  });

  it('measures cycle time across a reopen (first active → last done)', () => {
    const bug = findByContent([epic], 'Bug: logout crash')!;
    expect(isCompleted(bug, kindOf)).toBe(true);
    expect(cycleTimeSeconds(bug, kindOf)).toBe(49.5 * 3600); // 06-01 08:30 → 06-03 10:00
  });

  it('leaves in-progress work without a completion', () => {
    const notif = findByContent([epic], 'Notifications')!;
    expect(isCompleted(notif, kindOf)).toBe(false);
    expect(cycleTimeSeconds(notif, kindOf)).toBeNull();
  });
});
