import { describe, expect, it } from 'vitest';
import { collectTags, extractTags, searchNodes } from './tags';
import type { TaskNode } from './types';

function n(content: string, children: TaskNode[] = []): TaskNode {
  return {
    id: content,
    content,
    status: null,
    storyPoints: null,
    time: { accumulatedSeconds: 0, startedAt: null },
    statusHistory: [],
    collapsed: false,
    createdAt: '',
    updatedAt: '',
    children,
  };
}

describe('extractTags', () => {
  it('pulls word-boundary hashtags, lower-cased and distinct', () => {
    expect(extractTags('Fix #Bug ASAP #important #bug')).toEqual(['bug', 'important']);
  });

  it('ignores # not at a word boundary', () => {
    expect(extractTags('C# and a#b are not tags')).toEqual([]);
  });
});

describe('collectTags', () => {
  it('counts nodes per tag, most-used first', () => {
    const tree = [
      n('alpha #personal', [n('beta #personal #bookmarked')]),
      n('gamma #note'),
    ];
    expect(collectTags(tree)).toEqual([
      { tag: 'personal', count: 2 },
      { tag: 'bookmarked', count: 1 },
      { tag: 'note', count: 1 },
    ]);
  });
});

describe('searchNodes', () => {
  const tree = [
    n('Plan trip #personal', [n('Book flights'), n('Pack bags #important')]),
    n('Read docs #important'),
  ];

  it('filters by exact tag with #query', () => {
    expect(searchNodes(tree, '#important').map((m) => m.content)).toEqual([
      'Pack bags #important',
      'Read docs #important',
    ]);
  });

  it('does substring search otherwise, with a breadcrumb', () => {
    const m = searchNodes(tree, 'flights');
    expect(m).toHaveLength(1);
    expect(m[0].breadcrumb).toBe('Plan trip #personal');
  });

  it('returns nothing for an empty query', () => {
    expect(searchNodes(tree, '   ')).toEqual([]);
  });
});
