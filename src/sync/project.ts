// Project-level merge (SYNC.md). `merge()` reconciles the node tree; this layer
// reconciles the metadata that lives on ProjectFile — the status set, point scale,
// name, and active timer — and then runs a referential-integrity pass so a merged
// project can never point at a status or timer node that didn't survive the merge.
//
// Pure — no React, no I/O. Inputs are not mutated (the tree is rebuilt fresh).

import type { ProjectFile, StatusDef, TaskNode } from '../model/types';
import { flatten, rebuild } from './flatten';
import { merge } from './merge';

/**
 * Merge two status sets: union by id, last-write-wins per status by `updatedAt`.
 * This never drops an *added* status (the real data-loss risk). Deletion is not yet
 * propagated — a status removed on one device can reappear from a device that still
 * has it (SYNC.md "status deletion"); that needs status tombstones, deferred.
 * Order: the local set's order, with remote-only statuses appended.
 */
export function mergeStatuses(local: StatusDef[], remote: StatusDef[]): StatusDef[] {
  const byId = new Map<string, StatusDef>();
  for (const s of local) byId.set(s.id, s);
  for (const s of remote) {
    const cur = byId.get(s.id);
    byId.set(s.id, cur ? pickNewerStatus(cur, s) : s);
  }
  return [...byId.values()];
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
  const rebuilt = rebuild(merge(flatten(local), flatten(remote)));
  const statuses = mergeStatuses(local.statuses, remote.statuses);
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
    root: rebuilt,
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
  return JSON.stringify([p.updatedAt ?? '', p.name, p.activeTimerNodeId ?? '', p.pointScale, statuses, nodes]);
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
