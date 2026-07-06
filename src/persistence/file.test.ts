import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseProject, serialize } from './file';

const examplePath = fileURLToPath(new URL('../../examples/sprint-demo.json', import.meta.url));

describe('parseProject migration (backward compatibility)', () => {
  it('loads a legacy file that has no top-level id and generates one', () => {
    const legacy = JSON.stringify({
      version: 1,
      name: 'Legacy',
      statuses: [{ id: 'todo', label: 'To Do', color: '#888', kind: 'todo' }],
      pointScale: [1, 2, 3],
      activeTimerNodeId: null,
      root: { children: [{ id: 'x', content: 'hi', status: null, storyPoints: null, children: [] }] },
    });
    const p = parseProject(legacy);
    expect(typeof p.id).toBe('string');
    expect(p.id.length).toBeGreaterThan(0);
    // Missing node fields are still backfilled (statusHistory) and deletedAt stays absent.
    expect(p.root.children[0].statusHistory).toEqual([]);
    expect(p.root.children[0].deletedAt).toBeUndefined();
  });

  it('preserves an existing top-level id', () => {
    const withId = JSON.stringify({
      version: 1,
      id: 'proj-123',
      name: 'Has id',
      root: { children: [] },
    });
    expect(parseProject(withId).id).toBe('proj-123');
  });

  it('migrates legacy accumulatedSeconds to one deterministic synthetic interval', () => {
    const legacy = JSON.stringify({
      version: 1,
      name: 'Timer',
      root: {
        children: [
          {
            id: 'x',
            content: 'timed',
            status: null,
            storyPoints: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-06-01T00:00:00.000Z',
            time: { accumulatedSeconds: 7200, startedAt: null },
            children: [],
          },
        ],
      },
    });
    const p1 = parseProject(legacy);
    const t = p1.root.children[0].time;
    expect((t as any).accumulatedSeconds).toBeUndefined();
    // 2h interval ENDING at createdAt — anchored to a field identical on every
    // device, so two devices migrating the same task synthesize the SAME interval
    // (union-safe), placed backwards so it can't overlap future real runs.
    expect(t.intervals).toEqual([
      { start: '2025-12-31T22:00:00.000Z', end: '2026-01-01T00:00:00.000Z' },
    ]);
    // Deterministic: a second device parsing the same file gets the identical interval.
    expect(parseProject(legacy).root.children[0].time.intervals).toEqual(t.intervals);
  });

  it('round-trips the example project without dropping fields', () => {
    const text = readFileSync(examplePath, 'utf8');
    const parsed = parseProject(text);
    // A new stable id is minted for the (id-less) legacy example.
    expect(typeof parsed.id).toBe('string');
    // Re-serialise + re-parse: everything except the freshly-minted id is stable.
    const reparsed = parseProject(serialize(parsed));
    expect(reparsed).toEqual(parsed);
  });
});
