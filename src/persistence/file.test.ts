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
