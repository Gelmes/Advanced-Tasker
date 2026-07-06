import { describe, expect, it } from 'vitest';
import {
  flattenForIndex,
  highlightMatches,
  searchIndex,
  tagCountsFromEntries,
} from './searchIndex';
import type { TaskNode } from './types';

function n(content: string, children: TaskNode[] = []): TaskNode {
  return {
    id: content,
    content,
    status: null,
    storyPoints: null,
    time: { intervals: [], startedAt: null },
    statusHistory: [],
    collapsed: false,
    createdAt: '',
    updatedAt: '',
    children,
  };
}

const fileA = flattenForIndex(
  [n('Plan #personal', [n('Subtask #important')])],
  'a.json',
  'Project A',
);
const fileB = flattenForIndex([n('Notes #important')], 'b.json', 'Project B');
const all = [...fileA, ...fileB];

describe('flattenForIndex', () => {
  it('carries file, tags and breadcrumb', () => {
    const sub = fileA.find((e) => e.content === 'Subtask #important')!;
    expect(sub.fileName).toBe('a.json');
    expect(sub.tags).toEqual(['important']);
    expect(sub.breadcrumb).toBe('Plan #personal');
  });
});

describe('searchIndex', () => {
  it('finds a tag across files', () => {
    const m = searchIndex(all, '#important');
    expect(m.map((e) => e.fileName).sort()).toEqual(['a.json', 'b.json']);
  });

  it('does substring search across files', () => {
    expect(searchIndex(all, 'notes')).toHaveLength(1);
  });
});

describe('tagCountsFromEntries', () => {
  it('counts tags across files, most-used first', () => {
    expect(tagCountsFromEntries(all)).toEqual([
      { tag: 'important', count: 2 },
      { tag: 'personal', count: 1 },
    ]);
  });
});

describe('highlightMatches', () => {
  it('marks a case-insensitive substring hit', () => {
    expect(highlightMatches('Fix the Bug now', 'bug')).toEqual([
      { text: 'Fix the ', hit: false },
      { text: 'Bug', hit: true },
      { text: ' now', hit: false },
    ]);
  });

  it('marks an exact tag, not a longer tag', () => {
    const segs = highlightMatches('a #important and #importantly', '#important');
    expect(segs.filter((s) => s.hit).map((s) => s.text)).toEqual(['#important']);
  });

  it('returns the whole string unmarked when nothing matches', () => {
    expect(highlightMatches('nothing here', 'xyz')).toEqual([
      { text: 'nothing here', hit: false },
    ]);
  });
});
