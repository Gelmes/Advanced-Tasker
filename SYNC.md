# Advanced Tasker — Sync Design (per-item merge)

Step 1 of cross-device sync: the **pure, tested foundation** for per-node merge.
No network/backend here — this document + `src/sync/` are the local groundwork a
server plugs into later. The live interactive app (in-memory nested tree, edit /
delete / undo paths) is untouched; sync operates only at its own boundary.

See `SPEC.md` for the app design and `src/model/types.ts` for the on-disk shape.

## Why per-node merge

The tree is stored nested and human-readable on disk (SPEC.md §2). But two
devices editing the same project can't merge a nested blob sensibly — you'd lose
one side. So sync **flattens** the tree to a flat, id-addressable list, merges
**per node**, then **rebuilds** the tree. Each node carries enough to place
itself (`parentId` + an order key) and to resolve conflicts (`updatedAt`).

## Schema additions (backward compatible)

Two additive fields, migrated in `parseProject` so old files load unchanged:

- **`ProjectFile.id: string`** — a stable project UUID. Project identity for sync
  (the filename isn't stable across devices). Generated when missing.
- **`TaskNode.deletedAt?: string | null`** — a tombstone timestamp. Absent/null =
  live. A hard-removed node is indistinguishable from "not yet synced", so deletes
  must be representable to merge correctly. The live delete path still hard-removes
  nodes; tombstones are produced/consumed only at the sync boundary.

**`updatedAt` discipline.** Per-node last-write-wins needs a reliable `updatedAt`.
The `touch()` helper in `model/tree.ts` bumps it; every tree mutation op already
calls it, and the store paths that mutate a node directly (due date, timer,
effort) now call it too. Undo is unaffected — it restores whole project snapshots.

## Sync data shape — `SyncNode` (`src/sync/flatten.ts`)

```ts
interface SyncNode {
  id: string;
  parentId: string | null;   // null = top level
  orderKey: string;          // fractional index; sorts among siblings
  content, status, storyPoints, dueDate, collapsed, time, statusHistory,
  createdAt, updatedAt,
  deletedAt: string | null;  // tombstone
}
```

- **`flatten(project)`** — nested tree → flat `SyncNode[]`. Derives each node's
  `orderKey` from its current position in the sibling array (`initialKeys`).
- **`rebuild(nodes)`** — inverse. Groups by `parentId`, sorts siblings by
  `orderKey`, recurses. `rebuild(flatten(p))` is identity for tree + fields
  (tested). Tombstoned nodes are excluded from the live tree; a live child whose
  parent is missing/tombstoned is re-parented to the top level so nothing is
  silently dropped.

## Order keys — fractional indexing (`src/sync/orderKey.ts`)

Sibling order is a **base-62 fractional-index string** so two clients can insert
*between* two siblings without colliding or renumbering the whole list.
`keyBetween(a, b)` returns a key strictly between `a` and `b` (either may be
`null` for an open end), always leaving room to subdivide again — it's a true
base-62 midpoint that only grows in length when a whole-digit gap isn't
available. Dependency-free; stress-tested (deep squeezes + thousands of random
interleaved inserts stay sorted and unique). A move is just a new `orderKey` (and
possibly `parentId`) with a bumped `updatedAt`.

## Merge rules (`src/sync/merge.ts`)

`merge(local, remote)` unions by id. For a node on both sides:

- **Scalar fields** (`content`, `status`, `storyPoints`, `dueDate`, `collapsed`,
  `parentId`, `orderKey`, `time`) — **last-write-wins by `updatedAt`**, taken
  **wholesale** (the newer node's whole scalar payload wins; we do not field-merge).
  Ties break deterministically by id so both peers converge to the same result.
- **`statusHistory`** — **append-only**: union both sides, dedupe by (`at`+`status`),
  keep sorted by `at`. Never lost regardless of which scalar side wins.
- **Tombstones (`deletedAt`)** — a delete wins over a live edit **only if
  `deletedAt >= the other side's `updatedAt`** (a delete at least as new as the
  last edit). A strictly-newer edit **resurrects** the node (the delete is
  discarded). Two tombstones keep the later `deletedAt`.
- A node present on **only one side** is included unchanged.

The whole pipeline is order-independent and symmetric: `merge(a, b)` and
`merge(b, a)` converge to the same set.

## Known limitations

- **`time` / timer** — merged by per-node LWW like any scalar. This is fine for
  v1, but **concurrent timing on two machines can lose banked time**: if you run
  the timer on the same node on both devices, whichever `updatedAt` is newer wins
  and the other machine's banked seconds are dropped. The future refinement is
  **interval-union** (store runs as intervals and union them). We deliberately did
  **not** rewrite the live timer model for this step.
- **Per-node, not per-field, LWW** — an edit to `content` on one device and to
  `status` on another for the *same* node keeps only the newer node's version of
  *both*. Per-field LWW (or a CRDT per field) is a possible later refinement;
  per-node is simpler and correct-by-convergence for now.
- **Order-key rebalancing** — keys only grow; pathological repeated inserts at the
  same spot lengthen keys but never break ordering. No compaction pass yet.

## How this plugs into a future server

The server is a plain key-value store of `SyncNode`s keyed by `(projectId, nodeId)`:

1. **Push** — `flatten(project)`, send nodes whose `updatedAt` (or `deletedAt`)
   changed since the last sync watermark.
2. **Pull** — fetch the server's nodes for `project.id`, `merge(localFlat,
   remoteFlat)`, then `rebuild(...)` back into `project.root`.
3. Deletes travel as tombstones; the server keeps them so late-joining devices
   learn about removals. Convergence is guaranteed by the symmetric merge rules
   above — every device that sees the same set of node versions rebuilds the same
   tree.

Nothing above requires the live app to change: sync reads a project, produces a
merged project, and the existing store loads it like any other file.
