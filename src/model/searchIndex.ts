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
  /** Starred node — feeds the sidebar ★ tab (SPEC.md §4). */
  bookmarked: boolean;
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
        bookmarked: n.bookmarked ?? false,
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

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface HighlightSegment {
  text: string;
  hit: boolean;
}

/**
 * Split `content` into segments marking the parts that matched `query`, so results
 * can highlight the hit. `#tag` highlights exact tag occurrences (word-boundary);
 * anything else highlights case-insensitive substring matches.
 */
export function highlightMatches(content: string, query: string): HighlightSegment[] {
  const q = query.trim();
  const plain: HighlightSegment[] = [{ text: content, hit: false }];
  if (!q) return plain;

  let re: RegExp;
  if (q.startsWith('#')) {
    const tag = q.slice(1);
    if (!tag) return plain;
    re = new RegExp(`(?<![\\w])#${escapeRe(tag)}(?![\\p{L}\\p{N}_-])`, 'giu');
  } else {
    re = new RegExp(escapeRe(q), 'gi');
  }

  const segs: HighlightSegment[] = [];
  let last = 0;
  for (const m of content.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) segs.push({ text: content.slice(last, i), hit: false });
    segs.push({ text: m[0], hit: true });
    last = i + m[0].length;
  }
  if (last < content.length) segs.push({ text: content.slice(last), hit: false });
  return segs.length ? segs : plain;
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
