// Cross-file search index (SPEC.md §7). Flattens every node of every project in a
// folder into searchable entries carrying their file. Pure; the store builds the
// index by reading each file, and keeps the current file fresh from memory.

import { extractTags } from './tags';
import type { TaskNode } from './types';

export interface IndexEntry {
  fileName: string;
  projectName: string;
  id: string;
  content: string;
  breadcrumb: string;
  tags: string[];
}

/** Flatten a project's nodes into index entries (with ancestor breadcrumbs). */
export function flattenForIndex(
  children: TaskNode[],
  fileName: string,
  projectName: string,
): IndexEntry[] {
  const out: IndexEntry[] = [];
  const visit = (nodes: TaskNode[], trail: string[]) => {
    for (const n of nodes) {
      out.push({
        fileName,
        projectName,
        id: n.id,
        content: n.content,
        breadcrumb: trail.join(' › '),
        tags: extractTags(n.content),
      });
      visit(n.children, [...trail, n.content || 'Untitled']);
    }
  };
  visit(children, []);
  return out;
}

/** `#tag` filters by exact tag; anything else is a content substring match. */
export function searchIndex(entries: IndexEntry[], query: string): IndexEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const isTag = q.startsWith('#');
  const tag = isTag ? q.slice(1) : '';
  return entries.filter((e) =>
    isTag ? tag !== '' && e.tags.includes(tag) : e.content.toLowerCase().includes(q),
  );
}

export interface TagCount {
  tag: string;
  count: number;
}

export function tagCountsFromEntries(entries: IndexEntry[]): TagCount[] {
  const counts = new Map<string, number>();
  for (const e of entries) for (const t of e.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
