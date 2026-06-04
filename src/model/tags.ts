// Hashtags + search over a node tree (SPEC.md §7). A tag is `#` followed by
// letters/digits/_/- at a word boundary (so "C#" or "a#b" aren't tags). Pure.

import type { TaskNode } from './types';

const TAG_RE = /(?<![\w])#([\p{L}\p{N}_-]+)/gu;

/** Distinct, lower-cased tags in a single node's content (without the leading #). */
export function extractTags(content: string): string[] {
  const set = new Set<string>();
  for (const m of content.matchAll(TAG_RE)) set.add(m[1].toLowerCase());
  return [...set];
}

export interface TagCount {
  tag: string;
  count: number;
}

/** All tags in a subtree with the number of nodes carrying each, most-used first. */
export function collectTags(children: TaskNode[]): TagCount[] {
  const counts = new Map<string, number>();
  const visit = (nodes: TaskNode[]) => {
    for (const n of nodes) {
      for (const t of extractTags(n.content)) counts.set(t, (counts.get(t) ?? 0) + 1);
      visit(n.children);
    }
  };
  visit(children);
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export interface Match {
  id: string;
  content: string;
  /** Ancestor contents, for context in the results list. */
  breadcrumb: string;
}

/**
 * Find nodes matching `query`. A query starting with `#` filters by exact tag;
 * otherwise it's a case-insensitive substring match on content.
 */
export function searchNodes(children: TaskNode[], query: string): Match[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const isTag = q.startsWith('#');
  const tag = isTag ? q.slice(1) : '';
  const out: Match[] = [];
  const visit = (nodes: TaskNode[], trail: string[]) => {
    for (const n of nodes) {
      const matched = isTag
        ? tag !== '' && extractTags(n.content).includes(tag)
        : n.content.toLowerCase().includes(q);
      if (matched) out.push({ id: n.id, content: n.content, breadcrumb: trail.join(' › ') });
      visit(n.children, [...trail, n.content || 'Untitled']);
    }
  };
  visit(children, []);
  return out;
}
