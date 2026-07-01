# Advanced Tasker — Design Spec

A keyboard-first, capture-as-you-work task tracker that lives in the gap between a
todo app and a notebook. You keep a tree of tasks and notes; as you work you take
notes under tasks, spin up new tasks on the fly, track time and story points, and
move things around with VS Code-style shortcuts. Data is human-readable JSON on disk.

This document is the source of truth for the design. Code should follow it; when the
two disagree, update this file in the same change.

---

## 1. Stack & platform

- **Expo (React Native + react-native-web)**, **TypeScript**.
- **Desktop-first**, run in the browser today; wrappable as Electron/desktop later.
  Mobile is possible afterward but is not a v1 target.
- Keyboard handling relies on real DOM `keydown` events (web). The persistence and
  keyboard layers are abstracted so a desktop (Electron) or mobile target can be added
  without rewriting the core.

## 2. Core model — one recursive node type

Everything is a **node**. A node with no `status` is a *plain note*; a node with a
`status` is a *tracked task*. Same shape everywhere, arbitrarily nested. New nodes are
created as plain notes and *promoted* to tasks when you assign a status.

Rollups (summed time, summed story points, completion %) are **computed at render
time from the subtree — never stored**.

### On-disk JSON (one file per project)

```jsonc
{
  "version": 1,
  "name": "My Project",
  "statuses": [                       // fully user-configurable; kind drives analytics
    { "id": "todo",    "label": "To Do",   "color": "#888888", "kind": "todo" },
    { "id": "next",    "label": "Next",    "color": "#f59e0b", "kind": "todo" },
    { "id": "doing",   "label": "Doing",   "color": "#3b82f6", "kind": "active" },
    { "id": "blocked", "label": "Blocked", "color": "#ef4444", "kind": "active" },
    { "id": "done",    "label": "Done",    "color": "#22c55e", "kind": "done" }
  ],
  "pointScale": [1, 2, 3, 5, 8, 13],  // Fibonacci; the allowed set
  "activeTimerNodeId": null,          // at most ONE timer runs at a time
  "root": {
    "children": [
      {
        "id": "uuid-v4",
        "content": "Markdown text…",  // raw markdown; rendered in UI when not editing
        "status": null,               // null = plain note; a status id = task
        "storyPoints": null,          // null until assigned; must be in pointScale
        "time": {
          "accumulatedSeconds": 0,    // banked time
          "startedAt": null           // ISO timestamp while running, else null
        },
        "statusHistory": [],          // settled status transitions [{at, status}]
        "collapsed": false,
        "createdAt": "2026-01-01T00:00:00.000Z",
        "updatedAt": "2026-01-01T00:00:00.000Z",
        "children": []                // recurse
      }
    ]
  }
}
```

**Timer semantics:** elapsed = `accumulatedSeconds + (now - startedAt)` while running.
Storing `startedAt` as a timestamp means elapsed time stays correct across app
restarts. Starting a timer on a node sets `activeTimerNodeId` and stops any other
running timer (banking its elapsed into `accumulatedSeconds`).

The effort total is **editable** from the details panel: clicking the "Effort (timer)"
value lets you type a corrected duration (`1h30m`, `90m`, `45s`, or a bare number read as
minutes) to fix a runaway timer left running after you walked away. Committing overwrites
`accumulatedSeconds`; if the timer is live it restarts `startedAt` from now so the edited
total is exact and keeps counting. Unparseable input reverts.

**Status kinds & analytics capture (the basis for burndown/cycle-time):** every status
has a `kind` of `todo` / `active` / `done` (Blocked folds under `active`). Each node keeps
an append-only `statusHistory` of *settled* transitions: a status change is held briefly
(~3s) and rapid cycling replaces the in-burst entry, so only the value you land on is
logged; a burst that returns to the pre-burst status records nothing. From this we derive
(never stored) `startedAt` (first active/done), `completedAt` (last transition into done,
cleared by a reopen), and cycle/lead time — keyed off *kind*, so cycling among active
statuses doesn't move the numbers. `Ctrl+Z` reverts a status change and its log entry
together.

**Charts** (the 📊 toolbar button) open a responsive modal scoped to the selected subtree
(or the whole project): **Burnup** (scope vs done over time), **Burndown** (remaining vs an
ideal line anchored to an optional per-node `dueDate`), **Throughput** (completed points per
week + a Monte-Carlo finish forecast giving p50/p85 dates from sampled daily throughput),
and **Cycle time** (per-task bars + median/p85/avg). Burnup/burndown/throughput *replay* the
status history per day, so a task counts as done on a day only if its latest transition as
of that day was a done-kind — reopens are reflected over time. All series are derived in
`model/analytics.ts` (pure + tested against the demo project; the forecast RNG is injectable
for determinism) and drawn with `react-native-svg` (line charts) / Views (bars).

**`done` completion:** a task counts as complete when its status is of kind `done`.
Completion % of a subtree = complete tasks / total tasks
in the subtree (notes excluded).

## 3. Interaction model — modal

A row is either **selected** (navigation) or **editing** (caret in its text), toggled
by `Enter`/`Esc`, like VS Code's editor vs. command focus. Bare keys are shortcuts only
when selected.

### Keymap

| Selected (navigation)                         | Editing (caret in text)                          |
| --------------------------------------------- | ------------------------------------------------ |
| `↑` / `↓` — move selection                     | `Enter` — commit + new sibling below, stay editing |
| `←` / `→` — collapse / expand subtree          | `Shift+Enter` — newline within node              |
| `Enter` — new sibling below, enter edit mode   | `Esc` — exit to navigation                       |
| `Tab` / `Shift+Tab` — indent / outdent         | `Backspace` on empty node — delete + select prev |
| `Alt+↑` / `Alt+↓` — move node among siblings   |                                                  |
| `Space` — start/stop timer on the node         |                                                  |
| `S` / `Shift+S` — cycle status fwd/back (promotes) |                                              |
| `P` / `Shift+P` — cycle story points fwd/back   |                                                  |
| `Delete` — delete node (and its children)      |                                                  |

Tree-op rules:
- **Indent** makes the node a child of its immediately preceding sibling (no-op if it
  is the first child).
- **Outdent** makes the node a sibling of its parent, inserted just after the parent
  (no-op at root level).
- **Move up/down** reorders within the current sibling list only.
- **Drag** (the `⠿` grip): drop **before**/**after** a target row, or **inside** it as
  its first child. Cannot drop a node into its own subtree.
- **Copy / cut / paste** (`Ctrl/Cmd+C`/`X`/`V`): copy or cut a node *and its subtree* to
  an internal clipboard; paste inserts it as a **sibling below** the selection (then `Tab`
  to nest). Paste always assigns fresh ids. A **copy** is a fresh duplicate (tracked time
  cleared, status history reseeded at paste); a **cut** preserves everything (a move).
  Works across files. `Ctrl/Cmd+C` defers to the browser if you've selected text.
- Deleting a node removes its entire subtree; selection falls to the previous sibling,
  else the parent.

The global key listener ignores events whose target is a text field (node editor,
project title, status inputs), and `?` toggles the shortcuts reference.

**Vim navigation** (opt-in toggle in the shortcuts panel, persisted to localStorage):
adds `j/k` (down/up), `h/l` (collapse/expand), `gg`/`G` (top/bottom), `Ctrl-d`/`Ctrl-u`
(half-page), and the insert family `i`/`a` (edit) + `o` (new row below). It's additive —
arrows and the other shortcuts still work — except `i` becomes *insert*, so the details
panel moves to `Shift+I` (and the toolbar button). Moving the selection now scrolls it
into view.

**Undo/redo** (`Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z` or `Ctrl+Y`): every committed mutation
pushes the previous project snapshot onto an undo stack (rapid same-target typing is
coalesced into one step). Collapse/expand is not recorded; loading a different project
resets history.

## 4. UI rules

- **Row coloring:** task rows get a subtle left-border + faint background tint in the
  status color. Notes are uncolored.
- **Markdown:** node content renders as markdown when the row is *not* being edited;
  shows raw markdown text when editing.
- **Rollup display:** each parent row shows summed tracked time, summed story points,
  and completion % of its subtree, derived live.
- Indentation communicates depth; collapsed nodes hide their subtree and show a count.
- **Tabs:** open projects appear as tabs above the outline. Click an inactive tab to
  switch; click the active tab to rename it inline; ✕ closes it. The title is shown
  here only (not duplicated as a header or in the save indicator).
- **Project sidebar:** a left slideout with (1) every **remembered folder** (📁 — click to
  switch, ✕ to forget) and (2) a **Projects / Search** tab. Projects lists the open folder's
  `.json` files; Search filters the current project by text or `#tag` (with clickable tag
  chips) and jumps to a result on click (expanding its ancestors **and scrolling it into
  view**). `#hashtags` render in purple in the outline and open the tag search when tapped —
  use them as categories (#important, #bookmarked, …). Search is **cross-file**: a folder
  index (built by reading every file on open, kept fresh for the current file from memory)
  lets results span all projects; clicking a result in another file opens that file first,
  then reveals the node.

## 5. Architecture

- **State store** (Zustand or a reducer) holding the tree + `activeTimerNodeId` +
  selection/mode + open-file metadata. All mutations are **pure tree operations**
  (create, indent, outdent, move, promote, setStatus, setPoints, timer) so they are
  unit-testable in isolation.
- **One keyboard-handler hook** owns the keymap and dispatches by mode
  (selected vs. editing). Single source of truth for shortcuts.
- **Workspace = a folder of `.json` projects.** Opening a folder (File System Access
  directory handle) lists every `.json` as a project; each file is one project. The
  directory handle, its **open tabs**, and last-open project are persisted (IndexedDB)
  and reopened on startup when still permitted — so you return to the files you had open,
  not the sample. (The desktop app grants the FSA permission so this is automatic; in a
  browser the permission resets per session, so the sidebar opens to the remembered
  folder for one-click reopen.) Switching projects saves the current one first. A
  standalone single-file Open/Save As path also exists. Auto-save is debounced.
- **Components:** `ProjectSidebar` (folder switcher) · `WorkspaceBar` (folder/file
  actions, statuses, shortcuts, save state) · `TabBar` (open projects + editable title)
  · `OutlineView` → recursive `NodeRow` · `StatusManager` · `ShortcutsHelp` ·
  `DragProvider` (web pointer-event drag-and-drop).

## 6. Milestones

1. **Scaffold** — Expo web app, state store, basic recursive tree render.
2. **Keyboard core + persistence** — modal nav, create/indent/outdent/move/delete,
   load/save to a real JSON file.
3. **Tasks** — configurable statuses + row coloring, promote note → task, story points.
4. **Timer + rollups** — single-active start/stop timer surviving restart; render-time
   rollups of time / points / completion.
5. **Markdown + workspace** — markdown rendering, folder-based multi-project workspace
   with a sidebar switcher, collapse persistence.
6. **Polish** — drag-to-reorder, editable project title, shortcuts reference.

Post-v1 (not scheduled): search/filter, mobile target, Electron packaging.

## 7. Defaults chosen (change here if you disagree)

- Row coloring = subtle left-border + tint (not full-row fill).
- Markdown renders inline when idle, raw when editing.
- Search/filter deferred past v1.
- Story-point scale is Fibonacci `[1,2,3,5,8,13]`, editable like statuses.
