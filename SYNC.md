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

Additive fields, backward compatible:

- **`ProjectFile.id: string`** — a stable project UUID. Project identity for sync
  (the filename isn't stable across devices). Generated in `parseProject` when missing.
- **`TaskNode.deletedAt?: string | null`** — a tombstone timestamp. Absent/null =
  live. A hard-removed node is indistinguishable from "not yet synced", so deletes
  must be representable to merge correctly. The live delete path still hard-removes
  nodes; tombstones are produced/consumed only at the sync boundary.
- **`TaskNode.statusUpdatedAt?: string | null`** — ISO time of the last status
  change, the per-field clock for merging `status` (below). Set in the store's
  status path (`applyStatusChange`). No migration needed: merge falls back to
  `updatedAt` for legacy nodes, so old files behave exactly as before.
- **`TaskNode.orderKey?: string`** — stored fractional-index key for this node's
  position among its siblings (see *Order keys*). Backfilled by `ensureOrderKeys`
  in `parseProject`, so legacy files gain keys on first load.

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
  statusUpdatedAt,           // per-field clock for `status`
  createdAt, updatedAt,
  deletedAt: string | null;  // tombstone
}
```

- **`flatten(project)`** — nested tree → flat `SyncNode[]`. Reads each node's
  **stored** `orderKey` (positional fallback only for legacy nodes that predate it;
  `parseProject` backfills those on load).
- **`rebuild(nodes)`** — inverse. Groups by `parentId`, sorts siblings by
  `orderKey`, recurses. `rebuild(flatten(p))` is identity for tree + fields
  (tested). Tombstoned nodes are excluded; a live child of a missing/tombstoned
  parent is re-parented to the top level. **Parent cycles** — two devices moving
  `x` under `y` and `y` under `x` — are broken deterministically (the max-id member
  of each unreachable component is re-rooted), so a concurrent-move cycle can never
  silently drop a subtree, and every peer breaks it identically.

## Order keys — fractional indexing (`src/model/orderKey.ts`)

Sibling order is a **stored** base-62 fractional-index string on each node
(`TaskNode.orderKey`), so two clients can insert *between* two siblings without
colliding or renumbering — and, crucially, so an unchanged node keeps the **same**
key on every device. That stability is what makes concurrent inserts/reorders
merge: keys are **not** regenerated from array position at flatten time, they're
maintained by the tree ops.

- `keyBetween(a, b)` — a key strictly between `a` and `b` (either may be `null` for
  an open end), always leaving room to subdivide again; a true base-62 midpoint
  that only grows in length when a whole-digit gap isn't available.
- `reindexAt(siblings, i)` — called by every op that repositions a node
  (`insertSiblingAfter`, `indent`, `outdent`, `moveWithinSiblings`,
  `moveNodeRelative`, `insertSubtreeAfter`), in the *same op* that `touch()`es it,
  so the rekey and the `updatedAt` bump travel together and survive the merge.
- `ensureOrderKeys(children)` — idempotent backfill for any un-keyed sibling group,
  run in `parseProject` (legacy files) and on sample data.

Array order stays the live source of truth; the stored key is kept consistent with
it. Dependency-free; stress-tested (deep squeezes + thousands of interleaved
inserts stay sorted and unique).

## Merge rules (`src/sync/merge.ts`)

`merge(local, remote)` unions by id. For a node on both sides:

- **Scalar fields** (`content`, `storyPoints`, `dueDate`, `collapsed`,
  `parentId`, `orderKey`, `time`) — **last-write-wins by `updatedAt`**, taken
  **wholesale** (the newer node's whole scalar payload wins; we do not field-merge).
  Ties break deterministically by id so both peers converge to the same result.
- **`status`** — resolved on its **own clock** (`statusUpdatedAt`), *not* `updatedAt`.
  Any edit bumps `updatedAt`, so without this a content edit on one device would
  clobber a concurrent status change on another — and leave `status` disagreeing with
  the `statusHistory` tail that `lifecycle.ts`/`analytics.ts` replay (`completedAt`
  reads the last history entry; `computeRollup` reads `status` — they must agree).
  Legacy nodes without `statusUpdatedAt` fall back to `updatedAt`. Ties break by id.
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
- **Per-node LWW for most scalars** — `status` is now merged per-field (its own
  clock). The other scalars (`content`, `storyPoints`, `dueDate`, `collapsed`,
  `time`, position) are still whole-node LWW, so concurrent edits to two *different*
  such fields of the same node keep only the newer node's version of both. Extending
  the per-field treatment to `time`/`storyPoints` is the next candidate.
- **Status edge cases still open** — (1) deleting a *status definition*
  (`removeStatus`) demotes tasks by writing `status = null` directly, bypassing the
  status path, so it bumps neither `statusUpdatedAt` nor `updatedAt` — that demotion
  won't sync yet; route it through the same stamp when wiring the server. (2) A node
  demoted to a note keeps its `statusHistory`, so `completedAt()` still reports it
  done — the analytics treatment of demoted-but-historied nodes is a separate design
  question, unchanged by this merge fix.
- **Order-key rebalancing** — keys only grow; pathological repeated inserts at the
  same spot lengthen keys but never break ordering. No compaction pass yet.

## How this plugs into a future server

The server is a plain key-value store of `SyncNode`s keyed by `(projectId, nodeId)`:

1. **Push** — `flatten(project)`, send nodes whose `updatedAt` (or `deletedAt`)
   changed since the last sync watermark. Persist `statusUpdatedAt` as its own
   column so `status` merges on its own clock server-side too.
2. **Pull** — fetch the server's nodes for `project.id`, `merge(localFlat,
   remoteFlat)`, then `rebuild(...)` back into `project.root`.
3. Deletes travel as tombstones; the server keeps them so late-joining devices
   learn about removals. Convergence is guaranteed by the symmetric merge rules
   above — every device that sees the same set of node versions rebuilds the same
   tree.

Nothing above requires the live app to change: sync reads a project, produces a
merged project, and the existing store loads it like any other file.
