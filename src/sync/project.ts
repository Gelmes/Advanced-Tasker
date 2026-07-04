// Project-level merge (SYNC.md). `merge()` reconciles the node tree; this layer
// reconciles the metadata that lives on ProjectFile — the status set, point scale,
// name, and active timer — and then runs a referential-integrity pass so a merged
// project can never point at a status or timer node that didn't survive the merge.
//
// Pure — no React, no I/O. Inputs are not mutated (the tree is rebuilt fresh).

import type { ProjectFile, StatusDef, TaskNode } from '../model/types';
import { flatten, rebuild, type SyncNode } from './flatten';
import { merge } from './merge';

/** The status-definition slice of a project: the live set + deletion records. */
export interface StatusSet {
  statuses: StatusDef[];
  statusTombstones?: Record<string, string>;
}

/**
 * Merge two status sets: union by id, last-write-wins per status by `updatedAt`,
 * so an *added* status is never lost. Deletions propagate via tombstones
 * (id → deletedAt): a tombstone kills the status unless it was edited strictly
 * after the deletion (`updatedAt > deletedAt` resurrects, dropping the tombstone);
 * two tombstones keep the later time. A legacy status without `updatedAt` counts
 * as oldest, so a delete always beats it. Order: local's, remote-only appended.
 */
export function mergeStatuses(
  local: StatusSet,
  remote: StatusSet,
): { statuses: StatusDef[]; statusTombstones: Record<string, string> } {
  const byId = new Map<string, StatusDef>();
  for (const s of local.statuses) byId.set(s.id, s);
  for (const s of remote.statuses) {
    const cur = byId.get(s.id);
    byId.set(s.id, cur ? pickNewerStatus(cur, s) : s);
  }

  // Later tombstone per id across both sides.
  const merged: Record<string, string> = { ...(local.statusTombstones ?? {}) };
  for (const [id, at] of Object.entries(remote.statusTombstones ?? {})) {
    merged[id] = merged[id] && merged[id] >= at ? merged[id] : at;
  }

  const statusTombstones: Record<string, string> = {};
  for (const [id, at] of Object.entries(merged)) {
    const s = byId.get(id);
    if (s && (s.updatedAt ?? '') > at) continue; // edited after the delete — resurrect
    byId.delete(id);
    statusTombstones[id] = at;
  }
  return { statuses: [...byId.values()], statusTombstones };
}

/** The status edited more recently; legacy (no `updatedAt`) counts as oldest. */
function pickNewerStatus(a: StatusDef, b: StatusDef): StatusDef {
  const ta = a.updatedAt ?? '';
  const tb = b.updatedAt ?? '';
  if (ta !== tb) return ta > tb ? a : b;
  return a; // same id, same clock — identical enough; keep a for determinism
}

/**
 * Merge two versions of the same project. Nodes go through `merge()` + `rebuild()`;
 * statuses through `mergeStatuses`; name/pointScale/activeTimer are whole-metadata
 * LWW by `ProjectFile.updatedAt`. Order-independent: `mergeProjects(a, b)` and
 * `mergeProjects(b, a)` converge.
 */
export function mergeProjects(local: ProjectFile, remote: ProjectFile): ProjectFile {
  // Include synthetic tombstone nodes so merge()'s deletedAt logic propagates deletes
  // (an edit newer than the delete still resurrects, via resolveTombstone).
  const mergedNodes = merge(flattenWithTombstones(local), flattenWithTombstones(remote));
  const rebuilt = rebuild(mergedNodes); // excludes tombstoned nodes from the live tree
  // Keep the surviving tombstones so late-joining devices also learn about deletes.
  const tombstones: Record<string, string> = {};
  for (const n of mergedNodes) if (n.deletedAt) tombstones[n.id] = n.deletedAt;

  const { statuses, statusTombstones } = mergeStatuses(local, remote);
  const meta = pickMeta(local, remote);

  // --- referential integrity (#4) -------------------------------------------
  // A node may not reference a status that didn't survive the merge, and the active
  // timer must point at a node that's still live. Both peers compute the same merged
  // sets, so this reconciliation is deterministic and convergent.
  const statusIds = new Set(statuses.map((s) => s.id));
  const liveNodeIds = new Set<string>();
  const reconcile = (nodes: TaskNode[]) => {
    for (const n of nodes) {
      liveNodeIds.add(n.id);
      if (n.status !== null && !statusIds.has(n.status)) n.status = null; // demote
      reconcile(n.children);
    }
  };
  reconcile(rebuilt.children);
  const activeTimerNodeId =
    meta.activeTimerNodeId && liveNodeIds.has(meta.activeTimerNodeId)
      ? meta.activeTimerNodeId
      : null;

  return {
    version: Math.max(local.version, remote.version),
    id: local.id, // same project — ids match
    name: meta.name,
    statuses,
    pointScale: meta.pointScale,
    activeTimerNodeId,
    updatedAt: newer(local.updatedAt, remote.updatedAt),
    tombstones,
    statusTombstones,
    root: rebuilt,
  };
}

/**
 * flatten() plus a synthetic tombstone SyncNode for each recorded deletion that isn't
 * already a live node — so merge()'s deletedAt handling resolves delete-vs-edit.
 */
function flattenWithTombstones(p: ProjectFile): SyncNode[] {
  const live = flatten(p);
  const liveIds = new Set(live.map((n) => n.id));
  const out = [...live];
  for (const [id, at] of Object.entries(p.tombstones ?? {})) {
    if (!liveIds.has(id)) out.push(tombstoneNode(id, at));
  }
  return out;
}

/**
 * A minimal deletedAt SyncNode. Its `updatedAt` equals the deletion time, so a
 * strictly-newer live edit on the other side resurrects it (see resolveTombstone).
 */
function tombstoneNode(id: string, at: string): SyncNode {
  return {
    id,
    parentId: null,
    orderKey: '',
    content: '',
    status: null,
    storyPoints: null,
    dueDate: null,
    collapsed: false,
    time: { accumulatedSeconds: 0, startedAt: null },
    statusHistory: [],
    createdAt: at,
    updatedAt: at,
    deletedAt: at,
  };
}

/**
 * The project whose metadata wins: newer `updatedAt`, else a deterministic,
 * order-independent tiebreak on the serialized metadata (so both peers agree).
 */
function pickMeta(a: ProjectFile, b: ProjectFile): ProjectFile {
  const ta = a.updatedAt ?? '';
  const tb = b.updatedAt ?? '';
  if (ta !== tb) return ta > tb ? a : b;
  const key = (p: ProjectFile) => JSON.stringify([p.name, p.pointScale, p.activeTimerNodeId]);
  return key(a) >= key(b) ? a : b;
}

/** The later of two optional ISO timestamps (undefined if both are absent). */
function newer(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/**
 * A content fingerprint used to tell whether a merge actually changed anything.
 * Order-independent (sorted) and built from the fields that carry a change signal
 * (every meaningful edit bumps a node's `updatedAt`/`statusUpdatedAt`), so
 * `fingerprint(local) === fingerprint(merged)` means the sync brought back nothing
 * new — the client can skip adopting it (no undo reset, no cursor jump).
 */
export function fingerprint(p: ProjectFile): string {
  const nodes = flatten(p)
    .map(
      (n) =>
        `${n.id}|${n.updatedAt}|${n.statusUpdatedAt ?? ''}|${n.deletedAt ?? ''}|${n.orderKey}|${n.parentId ?? ''}`,
    )
    .sort();
  const statuses = p.statuses.map((s) => `${s.id}|${s.updatedAt ?? ''}`).sort();
  const tombs = Object.entries(p.tombstones ?? {})
    .map(([id, at]) => `${id}|${at}`)
    .sort();
  const stombs = Object.entries(p.statusTombstones ?? {})
    .map(([id, at]) => `${id}|${at}`)
    .sort();
  return JSON.stringify([
    p.updatedAt ?? '',
    p.name,
    p.activeTimerNodeId ?? '',
    p.pointScale,
    statuses,
    tombs,
    stombs,
    nodes,
  ]);
}

/**
 * Overlay this device's local view state (collapse) onto a merged project before the
 * client adopts it. Collapse is device-local (SYNC.md) — never synced — so each node
 * keeps whatever collapsed value it had locally; nodes new from the merge keep theirs.
 * Mutates `merged` in place (it's a freshly-parsed object owned by the caller).
 */
export function applyLocalView(merged: ProjectFile, local: ProjectFile): void {
  const localCollapsed = new Map<string, boolean>();
  const gather = (nodes: TaskNode[]) => {
    for (const n of nodes) {
      localCollapsed.set(n.id, n.collapsed);
      gather(n.children);
    }
  };
  gather(local.root.children);
  const overlay = (nodes: TaskNode[]) => {
    for (const n of nodes) {
      const c = localCollapsed.get(n.id);
      if (c !== undefined) n.collapsed = c;
      overlay(n.children);
    }
  };
  overlay(merged.root.children);
}
