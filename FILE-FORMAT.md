# Advanced Tasker — project file format reference

**Audience: external tools and agents that read (or cautiously write) the app's
`.json` project files.** This document is self-contained — you should be able to
parse and interpret a file correctly from this page alone, without reading the
app's source. It is kept in lock-step with the code: any change to the on-disk
shape updates this file in the same commit (see the changelog at the bottom).

- One `.json` file = one project. A folder of them = a workspace.
- UTF-8, pretty-printed JSON (2-space indent). Field order is not guaranteed.
- `version` is currently `1`. All shape evolution so far has been **additive with
  on-load migration** (see *Legacy variants*), so treat unknown fields as
  "preserve, don't interpret" rather than as errors.
- All timestamps are ISO-8601 strings with milliseconds and `Z` (UTC), e.g.
  `2026-07-01T10:00:00.000Z`, except `dueDate` which is a plain `YYYY-MM-DD`.

## Annotated example

```jsonc
{
  "version": 1,
  "id": "k3jj1x8k2m",                    // stable project UUID — identity for sync (NOT the filename)
  "name": "Website Redesign",            // display name (the tab title)
  "statuses": [                           // user-configurable; order = display/cycle order
    { "id": "todo",    "label": "To Do",   "color": "#888888", "kind": "todo" },
    { "id": "doing",   "label": "Doing",   "color": "#3b82f6", "kind": "active",
      "updatedAt": "2026-07-01T10:00:00.000Z" },
    { "id": "done",    "label": "Done",    "color": "#22c55e", "kind": "done" }
  ],
  "pointScale": [1, 2, 3, 5, 8, 13],     // allowed storyPoints values
  "activeTimerNodeId": null,              // id of the ONE node whose timer runs, or null
  "tombstones": { "a9x…": "2026-07-02T08:00:00.000Z" },        // deleted NODE ids → when
  "statusTombstones": { "blocked": "2026-07-03T09:00:00.000Z" }, // deleted STATUS ids → when
  "updatedAt": "2026-07-03T09:00:00.000Z", // last project-METADATA change (name/scale/timer)
  "root": {
    "children": [                         // the outline: a recursive tree of nodes
      {
        "id": "b2ff0q",
        "content": "Migrate **blog** posts #content",  // inline markdown + #tags (see below)
        "status": "doing",                // a status id → this is a TASK; null → a NOTE
        "storyPoints": 5,                 // member of pointScale, or null
        "time": {
          "intervals": [                  // completed timer runs (start < end)
            { "start": "2026-07-01T09:00:00.000Z", "end": "2026-07-01T09:31:00.000Z" }
          ],
          "startedAt": null,              // ISO timestamp while running, else null
          "effortUpdatedAt": null         // set when the user explicitly EDITED the total
        },
        "statusHistory": [                // append-only settled status transitions, sorted by at
          { "at": "2026-07-01T08:55:00.000Z", "status": "doing" }
        ],
        "statusUpdatedAt": "2026-07-01T08:55:00.000Z",  // sync clock for `status`
        "dueDate": "2026-07-15",          // YYYY-MM-DD or null/absent
        "collapsed": false,               // UI view state (device-local; do not interpret)
        "createdAt": "2026-07-01T08:50:00.000Z",
        "updatedAt": "2026-07-01T09:31:00.000Z",        // bumped on every edit to this node
        "orderKey": "V",                  // sync bookkeeping — array order is the real order
        "children": []                    // recurse; same node shape
      }
    ]
  }
}
```

## Field reference

### Project (top level)

| Field | Type | Req | Meaning |
|---|---|---|---|
| `version` | number | ✓ | Format version; currently `1`. |
| `id` | string | ✓ | Stable project UUID. **This — not the filename — is the project's identity** (sync key). Filenames change on rename. |
| `name` | string | ✓ | Display name. |
| `statuses` | StatusDef[] | ✓ | The project's status vocabulary. Fully user-editable; never assume the defaults exist. Array order = display & cycle order. |
| `pointScale` | number[] | ✓ | Allowed `storyPoints` values (default Fibonacci `[1,2,3,5,8,13]`). |
| `activeTimerNodeId` | string \| null | ✓ | Id of the single node whose timer is running, or null. |
| `tombstones` | object (id → ISO time) | – | Ids of **deleted nodes** and when they were deleted. Sync bookkeeping: never re-create a node whose id appears here. |
| `statusTombstones` | object (id → ISO time) | – | Same, for deleted status definitions. |
| `updatedAt` | ISO time | – | Last change to project *metadata* (name / pointScale / active timer). Not bumped by node edits. |
| `root.children` | TaskNode[] | ✓ | The outline tree. `root` itself is a plain container, not a node. |

### StatusDef

| Field | Type | Req | Meaning |
|---|---|---|---|
| `id` | string | ✓ | Referenced by `TaskNode.status` and `statusHistory[].status`. Only `'done'` is conventional; ids are otherwise arbitrary user-created strings. |
| `label` | string | ✓ | Display name. |
| `color` | string | ✓ | Hex color for the UI. |
| `kind` | `'todo'` \| `'active'` \| `'done'` | ✓ | **The semantic field.** Interpret task state by `kind`, never by id or label: `todo` = not started, `active` = in progress (includes e.g. "Blocked"), `done` = complete. |
| `updatedAt` | ISO time | – | Sync clock for edits to this status definition. |

### TaskNode (recursive)

| Field | Type | Req | Meaning |
|---|---|---|---|
| `id` | string | ✓ | Unique within the project, stable for the node's lifetime. |
| `content` | string | ✓ | The text, in an inline-markdown subset (see *Interpreting content*). |
| `status` | string \| null | ✓ | A status id → this node is a **task**; `null` → a plain **note**. |
| `storyPoints` | number \| null | ✓ | Effort estimate; member of `pointScale` or null. |
| `time` | TimeTracking | ✓ | Tracked timer data (see below). |
| `statusHistory` | StatusEvent[] | ✓ | Append-only log of settled status transitions `{at, status}`, sorted ascending by `at`. Rapid back-and-forth flicks within ~3s are coalesced away, so entries are *settled* states. |
| `dueDate` | `YYYY-MM-DD` \| null | – | Target date. |
| `collapsed` | boolean | ✓ | Whether the subtree is folded in the UI. **Device-local view state — ignore for data purposes.** |
| `createdAt` / `updatedAt` | ISO time | ✓ | Creation time / last edit to this node (any field). |
| `statusUpdatedAt`, `storyPointsUpdatedAt`, `dueDateUpdatedAt`, `bookmarkedUpdatedAt` | ISO time \| null | – | Per-field sync clocks (when that specific field last changed). Useful as "when did the status change"; otherwise ignorable. |
| `bookmarked` | boolean | – | Starred for quick access (the sidebar ★ list). Absent = false. Agents may set it to surface items for the user — stamp `bookmarkedUpdatedAt` (or at least bump `updatedAt`). |
| `orderKey` | string | – | Fractional-index sync key. **The array order of `children` is the authoritative sibling order** — treat `orderKey` as opaque bookkeeping. |
| `deletedAt` | ISO time \| null | – | Sync-boundary tombstone. Normally **absent** in files (deleted nodes are removed from the tree and listed in project `tombstones` instead). |
| `children` | TaskNode[] | ✓ | Sub-nodes, same shape, in display order. |

### TimeTracking

| Field | Type | Req | Meaning |
|---|---|---|---|
| `intervals` | `{start, end}[]` | ✓ | Completed timer runs; `start < end`, ISO times. Kept sorted and non-overlapping. |
| `startedAt` | ISO time \| null | ✓ | Set while the timer is currently running (the live run has no interval yet). |
| `effortUpdatedAt` | ISO time \| null | – | Set when the user explicitly *edited* the total (a correction). The interval list is then one synthetic run — its position is meaningless, only its length. |

## How to interpret the data

- **Task vs note:** `status !== null` → task; `null` → note. Notes still nest,
  carry content/time, and structure the outline. A note may still have a
  `statusHistory` (it was a task once, then demoted) — for analytics the app
  treats "is currently a task" by `status`, but derives *lifecycle* from history.
- **Task state:** resolve `status` → the StatusDef in `statuses` → use its
  `kind`. A task whose status id is missing from `statuses` should be treated as
  a note (the app repairs this on merge).
- **Elapsed tracked time (seconds):**
  `sum(end - start over intervals) + (startedAt ? now - startedAt : 0)`.
  Interval *positions* are usually real work times, with two exceptions: files
  migrated from the legacy format have one synthetic interval ending at
  `createdAt` (possibly *before* it — that's intentional), and an explicit effort
  edit replaces the list with one synthetic run ending at the edit time. Trust
  the **sum** always; trust positions only for un-edited, post-migration data.
- **Lifecycle timestamps** (how the app derives them from `statusHistory` +
  `kind`):
  - *startedAt* = `at` of the first entry whose status kind is `active` or `done`.
  - *completedAt* = `at` of the **last** entry, if its kind is `done`; a later
    reopen clears it. (Replay entries in order for point-in-time state.)
  - *cycle time* = completedAt − startedAt; *lead time* = completedAt − createdAt.
- **Roll-ups are never stored.** Any subtree total (time, points, completion %)
  is derived at read time by summing the subtree. Completion counts **tasks
  only** (notes excluded): done-kind tasks / all tasks.
- **Interpreting `content`:** an inline-markdown subset, single logical line
  (may contain `\n` from Shift+Enter): `**bold**`, `*italic*`, `` `code` ``,
  `[label](url)`, and `#hashtags` (word-boundary; used as user-defined
  categories/labels — collect them for filtering).
- **Order matters:** sibling arrays are in the user's chosen display order.

## Sync bookkeeping — read but don't touch

`orderKey`, the `*UpdatedAt` clocks, `tombstones`, `statusTombstones`, and
`effortUpdatedAt` exist so devices can merge concurrent edits (rules live in
`SYNC.md`). A read-only consumer can ignore them all, with one exception:
**respect `tombstones`** — an id listed there is deleted; don't report or
re-create it.

**Writing files:** supported — the app **watches the open file and merges external
edits in live** (same engine as device sync, polling ~3s; the GUI updates within a
few seconds and nothing is clobbered in either direction). Two hard constraints:
keep the same top-level `id` (a changed id reads as "different project" and is
refused rather than merged), and write the file atomically if possible (a partially
written file is skipped until the next poll). Then follow the rules below so the
merge resolves your intent correctly:
1. Preserve every field it doesn't understand.
2. Bump the edited node's `updatedAt` (ISO, now) — and the matching per-field
   clock if editing `status` / `storyPoints` / `dueDate`.
3. Never reuse an id from `tombstones`; generate fresh ids for new nodes
   (any unique string; the app uses short random slugs).
4. Keep `statusHistory` append-only and sorted; append `{at, status}` when
   changing a status.
5. Don't invent `orderKey`s — omit them on new nodes (the app backfills).

## Legacy variants you may still encounter

Old files are migrated when the app loads them, but an external reader may meet
a file the app hasn't re-saved yet:

| Legacy shape | Meaning | Modern equivalent |
|---|---|---|
| `time.accumulatedSeconds: N` (number, no `intervals`) | banked timer seconds | one interval of length N (sum is what matters) |
| missing project `id` | pre-sync file | app mints one on load |
| missing `statusHistory` / `intervals` / `tombstones` | pre-feature file | treat as `[]` / `{}` |
| status without `kind` | pre-analytics file | infer: id `done` → `done`; `todo`/`backlog` → `todo`; else `active` |

## Changelog

| Date | Change |
|---|---|
| 2026-07-10 | Added `bookmarked` + `bookmarkedUpdatedAt` on nodes (sidebar ★ list; per-field merged — a side that never set the field can't clobber it). |
| 2026-07-08 | `time` became interval-based (`intervals` + optional `effortUpdatedAt`); legacy `accumulatedSeconds` migrates on load. |
| 2026-07-07 | Added `statusTombstones` (status-definition deletes sync). |
| 2026-07-06 | Added `tombstones`, per-field clocks (`statusUpdatedAt`, `storyPointsUpdatedAt`, `dueDateUpdatedAt`), `orderKey`, `StatusDef.updatedAt`, project `updatedAt`, project `id`, `deletedAt`. |
| earlier | Base format: version, name, statuses (+`kind`), pointScale, activeTimerNodeId, recursive nodes with content/status/points/time/statusHistory/dueDate. |
