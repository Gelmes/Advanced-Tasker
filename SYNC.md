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
- **`TaskNode.statusUpdatedAt? / storyPointsUpdatedAt? / dueDateUpdatedAt?`** — the
  per-field merge clocks (ISO time of the last change to each field). No migration
  needed: merge falls back to `updatedAt` for legacy nodes, so old files behave
  exactly as before. Stamped where each field is edited (`applyStatusChange`,
  `setStoryPoints`, `setDueDateFor`).
- **`TaskNode.orderKey?: string`** — stored fractional-index key for this node's
  position among its siblings (see *Order keys*). Backfilled by `ensureOrderKeys`
  in `parseProject`, so legacy files gain keys on first load.
- **`StatusDef.updatedAt?: string`** — per-status clock for project merge.
- **`ProjectFile.updatedAt?: string`** — clock for project *metadata* (name,
  point scale, active timer).

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

- **Shared scalars** (`content`, `parentId`, `orderKey`, `time`) — **last-write-wins
  by `updatedAt`**, taken **wholesale**. Ties break deterministically by id.
- **`status` / `storyPoints` / `dueDate`** — each resolved on its **own clock**
  (`statusUpdatedAt` / `storyPointsUpdatedAt` / `dueDateUpdatedAt`), *not* the shared
  `updatedAt`. Every edit bumps `updatedAt`, so per-field clocks stop an edit to one
  field from clobbering a concurrent edit to another on the same node. For `status`
  this also keeps it consistent with the `statusHistory` tail that
  `lifecycle.ts`/`analytics.ts` replay. Legacy nodes fall back to `updatedAt`.
- **`collapsed`** — **device-local view state, not synced.** It deliberately never
  bumps `updatedAt` (so it can't win a merge and revert another device's edit), and
  the client re-applies its own collapse on adopt (`applyLocalView`).
- **`statusHistory`** — **append-only**: union both sides, dedupe by (`at`+`status`),
  keep sorted by `at`. Never lost regardless of which scalar side wins.
- **Tombstones (`deletedAt`)** — a delete wins over a live edit **only if
  `deletedAt >= the other side's `updatedAt`** (a delete at least as new as the
  last edit). A strictly-newer edit **resurrects** the node (the delete is
  discarded). Two tombstones keep the later `deletedAt`.
- A node present on **only one side** is included unchanged.

The whole pipeline is order-independent and symmetric: `merge(a, b)` and
`merge(b, a)` converge to the same set.

## Project-level merge (`src/sync/project.ts`)

`merge()` above reconciles the node *tree*. `mergeProjects(local, remote)` wraps it
and also reconciles the metadata on `ProjectFile`, then repairs references:

- **Nodes** — `rebuild(merge(...))` over both sides flattened. A delete hard-removes
  from the live tree and records the id in `ProjectFile.tombstones` (id → time);
  `mergeProjects` synthesises a tombstone node for each so the delete propagates
  through `merge` (a strictly-newer edit still resurrects). Surviving tombstones are
  kept on the merged project so late-joining devices also learn about the deletion.
- **Statuses** — `mergeStatuses`: **union by id**, last-write-wins per status by
  `StatusDef.updatedAt`. An *added* status is never lost (the real data-loss risk).
  Order = local's, with remote-only statuses appended.
- **name / pointScale / activeTimerNodeId** — whole-metadata LWW by
  `ProjectFile.updatedAt`, with a deterministic tiebreak so both peers agree.
- **Referential integrity (#4)** — after merging, any node whose `status` didn't
  survive is demoted to a note (`status = null`), and `activeTimerNodeId` is cleared
  when it points at a node that isn't live. Both peers compute identical merged sets,
  so this reconciliation is deterministic and convergent.

The store stamps the clocks: `setProjectName` / `toggleTimer` bump
`ProjectFile.updatedAt`; `addStatus` / `updateStatus` bump the status's `updatedAt`.

## Known limitations

- **`time` / timer** — merged by per-node LWW like any scalar. This is fine for
  v1, but **concurrent timing on two machines can lose banked time**: if you run
  the timer on the same node on both devices, whichever `updatedAt` is newer wins
  and the other machine's banked seconds are dropped. The future refinement is
  **interval-union** (store runs as intervals and union them). We deliberately did
  **not** rewrite the live timer model for this step.
- **Whole-node LWW for the remaining shared scalars** — `status`, `storyPoints`, and
  `dueDate` merge per-field, and `collapsed` is device-local. `content`, `time`, and
  tree position (`parentId`/`orderKey`) are still whole-node LWW, so concurrent edits
  to two *different* of those on the same node keep only the newer node's version of
  both. (`content` would need a text CRDT; `time` is the timer item below.)
- **Status edge cases still open** — (1) deleting a *status definition*
  (`removeStatus`) demotes tasks by writing `status = null` directly, bypassing the
  status path, so it bumps neither `statusUpdatedAt` nor `updatedAt` — that demotion
  won't sync yet; route it through the same stamp when wiring the server. (2) A node
  demoted to a note keeps its `statusHistory`, so `completedAt()` still reports it
  done — the analytics treatment of demoted-but-historied nodes is a separate design
  question, unchanged by this merge fix.
- **Tombstones never GC** — deleted-node ids accumulate in `ProjectFile.tombstones`
  forever. Fine at personal scale; a horizon-based sweep (drop tombstones older than
  all devices' last sync) is the eventual cleanup.
- **Status / point-scale deletion isn't propagated** — *node* deletes now propagate
  via tombstones, but `mergeStatuses` still unions statuses by id with no tombstones,
  so a *status definition* removed on one device can reappear from a device that still
  has it (additive-safe, but incomplete). `name` / `pointScale` merge as whole values
  (LWW). Proper status deletion needs the same tombstone pattern — deferred.
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
