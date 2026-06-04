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
  "statuses": [                       // fully user-configurable
    { "id": "todo",    "label": "To Do",   "color": "#888888" },
    { "id": "doing",   "label": "Doing",   "color": "#3b82f6" },
    { "id": "blocked", "label": "Blocked", "color": "#ef4444" },
    { "id": "done",    "label": "Done",    "color": "#22c55e" }
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

**`done` completion:** a task counts as complete when its status id is `done` (the
status flagged as terminal). Completion % of a subtree = complete tasks / total tasks
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
| `S` — set/cycle status (promotes note → task)  |                                                  |
| `P` — set story points                         |                                                  |
| `Delete` — delete node (and its children)      |                                                  |

Tree-op rules:
- **Indent** makes the node a child of its immediately preceding sibling (no-op if it
  is the first child).
- **Outdent** makes the node a sibling of its parent, inserted just after the parent
  (no-op at root level).
- **Move up/down** reorders within the current sibling list only.
- **Drag** (the `⠿` grip): drop **before**/**after** a target row, or **inside** it as
  its first child. Cannot drop a node into its own subtree.
- Deleting a node removes its entire subtree; selection falls to the previous sibling,
  else the parent.

The global key listener ignores events whose target is a text field (node editor,
project title, status inputs), and `?` toggles the shortcuts reference.

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
- **Project sidebar:** a left slideout lists every project in the open workspace folder
  (title only); click to focus one, or create a new one in the folder.

## 5. Architecture

- **State store** (Zustand or a reducer) holding the tree + `activeTimerNodeId` +
  selection/mode + open-file metadata. All mutations are **pure tree operations**
  (create, indent, outdent, move, promote, setStatus, setPoints, timer) so they are
  unit-testable in isolation.
- **One keyboard-handler hook** owns the keymap and dispatches by mode
  (selected vs. editing). Single source of truth for shortcuts.
- **Workspace = a folder of `.json` projects.** Opening a folder (File System Access
  directory handle) lists every `.json` as a project; each file is one project. The
  directory handle is persisted (IndexedDB) so the same folder + last-open project
  reopen on startup when still permitted. Switching projects saves the current one
  first. A standalone single-file Open/Save As path also exists for files outside a
  folder. Auto-save is debounced on change.
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
