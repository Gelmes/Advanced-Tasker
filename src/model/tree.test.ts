import { describe, expect, it } from 'vitest';
import type { TaskNode } from './types';
import {
  adjacentVisible,
  cycleValue,
  deleteNode,
  findNode,
  indent,
  insertSiblingAfter,
  isDescendant,
  moveNodeRelative,
  moveWithinSiblings,
  outdent,
  setStatus,
  setStoryPoints,
  visibleNodes,
  walk,
} from './tree';

/** Compact node builder; id doubles as content for readable assertions. */
function n(id: string, children: TaskNode[] = []): TaskNode {
  return {
    id,
    content: id,
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

const ids = (nodes: TaskNode[]) => nodes.map((x) => x.id);

/**
 *  a
 *  ├ a1
 *  └ a2
 *    └ a2a
 *  b
 */
function sample(): TaskNode[] {
  return [n('a', [n('a1'), n('a2', [n('a2a')])]), n('b')];
}

describe('locate / findNode', () => {
  it('finds nested nodes', () => {
    const root = sample();
    expect(findNode(root, 'a2a')?.id).toBe('a2a');
    expect(findNode(root, 'missing')).toBeNull();
  });
});

describe('visibleNodes', () => {
  it('lists in depth-first order', () => {
    expect(ids(visibleNodes(sample()))).toEqual(['a', 'a1', 'a2', 'a2a', 'b']);
  });

  it('hides children of collapsed nodes', () => {
    const root = sample();
    root[0].collapsed = true;
    expect(ids(visibleNodes(root))).toEqual(['a', 'b']);
  });
});

describe('adjacentVisible', () => {
  it('returns the next and previous visible nodes', () => {
    const root = sample();
    expect(adjacentVisible(root, 'a2', 1)).toBe('a2a');
    expect(adjacentVisible(root, 'a2', -1)).toBe('a1');
  });

  it('returns null at the ends', () => {
    const root = sample();
    expect(adjacentVisible(root, 'a', -1)).toBeNull();
    expect(adjacentVisible(root, 'b', 1)).toBeNull();
  });
});

describe('insertSiblingAfter', () => {
  it('inserts immediately after the target in the same sibling list', () => {
    const root = sample();
    const id = insertSiblingAfter(root, 'a1');
    expect(ids(root[0].children)).toEqual(['a1', id, 'a2']);
  });

  it('appends at root when no id is given', () => {
    const root = sample();
    const id = insertSiblingAfter(root, null);
    expect(ids(root)).toEqual(['a', 'b', id]);
  });
});

describe('indent', () => {
  it('nests under the preceding sibling', () => {
    const root = sample();
    indent(root, 'a2');
    expect(ids(root[0].children)).toEqual(['a1']);
    expect(ids(root[0].children[0].children)).toEqual(['a2']);
  });

  it('is a no-op for the first child', () => {
    const root = sample();
    indent(root, 'a1');
    expect(ids(root[0].children)).toEqual(['a1', 'a2']);
  });
});

describe('outdent', () => {
  it('promotes a node to a sibling of its parent, just after it', () => {
    const root = sample();
    outdent(root, 'a2a');
    // a2a moves up to sit after a2 inside a's children
    expect(ids(root[0].children)).toEqual(['a1', 'a2', 'a2a']);
    expect(ids(root[0].children[1].children)).toEqual([]);
  });

  it('is a no-op at root level', () => {
    const root = sample();
    outdent(root, 'a');
    expect(ids(root)).toEqual(['a', 'b']);
  });
});

describe('moveWithinSiblings', () => {
  it('reorders within the sibling list', () => {
    const root = sample();
    moveWithinSiblings(root, 'a2', -1);
    expect(ids(root[0].children)).toEqual(['a2', 'a1']);
  });

  it('clamps at the bounds', () => {
    const root = sample();
    moveWithinSiblings(root, 'a1', -1); // already first
    expect(ids(root[0].children)).toEqual(['a1', 'a2']);
  });
});

describe('cycleValue', () => {
  it('cycles null → first → … → last → null', () => {
    const scale = [1, 2, 3];
    expect(cycleValue(null, scale)).toBe(1);
    expect(cycleValue(1, scale)).toBe(2);
    expect(cycleValue(3, scale)).toBeNull();
  });

  it('treats an unknown current as the start of the ring', () => {
    expect(cycleValue(99, [1, 2])).toBe(1);
  });

  it('cycles backward with dir -1', () => {
    const scale = [1, 2, 3];
    expect(cycleValue(null, scale, -1)).toBe(3); // wrap back to last
    expect(cycleValue(2, scale, -1)).toBe(1);
    expect(cycleValue(1, scale, -1)).toBeNull();
  });
});

describe('setStatus / setStoryPoints', () => {
  it('promotes a note to a task and back', () => {
    const root = sample();
    setStatus(root, 'a1', 'doing');
    expect(findNode(root, 'a1')?.status).toBe('doing');
    setStatus(root, 'a1', null);
    expect(findNode(root, 'a1')?.status).toBeNull();
  });

  it('sets story points', () => {
    const root = sample();
    setStoryPoints(root, 'b', 5);
    expect(findNode(root, 'b')?.storyPoints).toBe(5);
  });
});

describe('walk', () => {
  it('visits every node', () => {
    const seen: string[] = [];
    walk(sample(), (n) => seen.push(n.id));
    expect(seen.sort()).toEqual(['a', 'a1', 'a2', 'a2a', 'b']);
  });
});

describe('isDescendant', () => {
  it('detects nodes within a subtree', () => {
    const root = sample();
    expect(isDescendant(root, 'a', 'a2a')).toBe(true);
    expect(isDescendant(root, 'a2', 'a1')).toBe(false);
  });
});

describe('moveNodeRelative', () => {
  it('drops before a target in another sibling list', () => {
    const root = sample();
    moveNodeRelative(root, 'b', 'a1', 'before');
    expect(ids(root)).toEqual(['a']);
    expect(ids(root[0].children)).toEqual(['b', 'a1', 'a2']);
  });

  it('drops after a target', () => {
    const root = sample();
    moveNodeRelative(root, 'a1', 'b', 'after');
    expect(ids(root)).toEqual(['a', 'b', 'a1']);
  });

  it('drops inside a target as its first child', () => {
    const root = sample();
    moveNodeRelative(root, 'b', 'a2', 'inside');
    expect(ids(root)).toEqual(['a']);
    expect(ids(root[0].children[1].children)).toEqual(['b', 'a2a']);
  });

  it('refuses to drop a node into its own subtree', () => {
    const root = sample();
    moveNodeRelative(root, 'a', 'a2a', 'inside');
    expect(ids(root)).toEqual(['a', 'b']); // unchanged
  });

  it('is a no-op onto itself', () => {
    const root = sample();
    moveNodeRelative(root, 'a', 'a', 'after');
    expect(ids(root)).toEqual(['a', 'b']);
  });
});

describe('deleteNode', () => {
  it('selects the previous sibling when present', () => {
    const root = sample();
    expect(deleteNode(root, 'a2')).toBe('a1');
    expect(ids(root[0].children)).toEqual(['a1']);
  });

  it('selects the parent when deleting a first child', () => {
    const root = sample();
    expect(deleteNode(root, 'a1')).toBe('a');
  });

  it('selects the next sibling when first at root', () => {
    const root = sample();
    expect(deleteNode(root, 'a')).toBe('b');
    expect(ids(root)).toEqual(['b']);
  });
});
