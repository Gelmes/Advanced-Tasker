# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

/ Advanced Tasker — a keyboard-first, capture-as-you-work task tracker (outliner of
tasks + notes with time, story points, and custom statuses). **`SPEC.md` is the
design source of truth** — read it before changing behaviour, and update it in the
same change when behaviour changes.

> Expo has changed across versions. This project is **Expo SDK 56 / React 19.2 /
> RN 0.85**. Consult the versioned docs at https://docs.expo.dev/versions/v56.0.0/
> before writing Expo-specific code (see `AGENTS.md`).

## Commands

```bash
npm run web         # run the app (desktop-first; opens in the browser via react-native-web)
npm run typecheck   # tsc --noEmit
npm test            # vitest run (unit tests for the pure model layer)
npm run test:watch  # vitest watch

# Run a single test file or by name:
npx vitest run src/model/tree.test.ts
npx vitest run -t "outdent"

# Verify the production web bundle builds (catches bundler/import errors):
npx expo export --platform web   # output goes to dist/ (gitignored); rm -rf dist after

# Desktop (Electron) — see DESKTOP.md:
npm run desktop      # export web + open the app in a native Electron window
npm run desktop:dist # build a Windows installer (needs Developer Mode; see DESKTOP.md)
```

There is no separate lint step; `npm run typecheck` is the gate. `npm run android` /
`npm run ios` exist from the scaffold but mobile is not a current target.

The desktop wrapper is `electron/main.js`: it serves the exported `dist/` over a secure
`app://` scheme (the File System Access API needs a secure context — `file://` isn't one),
so all the web code runs unchanged in Chromium. Electron config is the `"build"` block in
`package.json`.

## Architecture

The app is a tree of nodes rendered as an indented outline. Entry is `index.ts` →
`App.tsx`, which mounts the global hooks and the two screens (`WorkspaceBar`,
`OutlineView`). The code is deliberately layered so the hard logic is pure and tested:

- **`src/model/` — pure, no React, no I/O (this is where the real logic and tests live).**
  - `types.ts` — the one recursive `TaskNode` (a node with `status: null` is a *note*;
    with a status id it is a *task*) and `ProjectFile` (the on-disk JSON shape).
  - `tree.ts` — every structural operation: `locate`, `insertSiblingAfter`, `indent`,
    `outdent`, `moveWithinSiblings`, `moveNodeRelative` (drag drop before/inside/after),
    `deleteNode`, `setStatus`, `setStoryPoints`, `cycleValue`, visibility/navigation
    helpers. **All tree mutations go through here.**
  - `time.ts` — timer math (`elapsedSeconds`, `bankTime`); elapsed = banked seconds +
    live run since `startedAt`, so it survives restarts.
  - `rollups.ts` — `computeRollup` sums time/points/completion over a subtree (done =
    status of kind `done`, via an `isDone` predicate); **rollups are derived at render
    time, never stored**.
  - `lifecycle.ts` — derives `startedAt` / `completedAt` / cycle & lead time from a node's
    `statusHistory`, keyed off status **kind** (`todo`/`active`/`done`). Pure + tested.
  - `analytics.ts` — burnup/burndown time-series (which **replay** statusHistory per day so
    reopens are handled over time) + cycle-time stats. Pure; tested against the demo
    project. The charts UI lives in `src/components/charts/` (SVG via `react-native-svg`:
    `ChartsModal`, `LineChart`, `CycleTimeChart`), opened from the 📊 toolbar button and
    scoped to the selected subtree (or whole project).
  - `tags.ts` — `#hashtag` extraction (word-boundary, unicode) + tag counts + node search
    (`#tag` exact-tag filter, else substring) with breadcrumbs. Pure + tested.
  - `factory.ts`, `defaults.ts`, `ids.ts` — node/project construction, default statuses
    (each with a `kind`) and Fibonacci point scale, id generation.

  **Folders & search:** `handleStore.ts` keeps a keyed set of opened folder handles
  (IndexedDB) so the sidebar can list/switch/forget them and auto-restore the most recent.
  Search is **cross-file**: `store.folderIndex` (built by `rebuildFolderIndex`, reading every
  file on folder open) holds `IndexEntry[]` from `model/searchIndex.ts`; the sidebar combines
  it (minus the current file) with the current file flattened live, so edits show instantly
  and `loadProject` snapshots the file you leave back into the index. Clicking a result calls
  `openSearchResult` (switch to its file if needed) → `revealNode` (expand ancestors, select,
  and scroll into view via `src/rowRegistry.ts`, which NodeRow populates with row elements).
  Tags also render via the inline-markdown parser (`markdown/inline.ts` `tag` segment) and
  open the search when tapped.

  **Status-history capture:** statuses carry a `kind`; each node has an append-only
  `statusHistory` of *settled* transitions. The coalescing lives in the store
  (`recordStatusChange`/`applyStatusChange`): rapid cycling within ~3s replaces the
  in-burst entry, and a burst returning to the pre-burst status records nothing.
  Legacy files are migrated in `parseProject` (backfill `kind` + `statusHistory`).

- **`src/store/useStore.ts` — the single Zustand store and the only mutation entry point.**
  Actions clone the project (`cloneProject` → `structuredClone`), apply a pure op from
  `model/tree.ts` via the `apply`/`applyProject` helpers, then `set` — **never mutate
  state in place**, because the new object reference is what drives re-render. It also
  owns the bound file, `dirty` flag, and Recent list.

- **`src/persistence/`** — a **workspace is a folder of `.json` projects**. `directory.ts`
  lists/creates/reads projects in a File System Access *directory* handle; `file.ts` is the
  single-file open/save + `parseProject`/`serialize`; `handleStore.ts` persists the
  directory handle (IndexedDB) so the folder + last-open project reopen on startup when
  still permitted. Switching projects saves the current one first.

- **`src/hooks/`** — `useKeyboardNav` is the global keymap; it **no-ops while
  `mode === 'editing'` and ignores events targeting any text field** (node editor, title,
  status inputs) so typing is never intercepted. `useNow` ticks once a second only while a
  timer runs. `useAutosave` debounces writes back to the bound file.

- **`src/components/`** — `ProjectSidebar` (folder/project switcher; right-click a project
  for Rename/Delete, double-click to rename) · `WorkspaceBar` (File ▾ menu for new/open/save
  + Statuses + Charts + Sync + Shortcuts + save state) · `TabBar` (open projects; click
  inactive to switch, double-click to rename — renaming also renames the .json on disk via
  `renameProjectFile` — right-click for Rename/Close, ✕ to close; the title is shown *only*
  here) · `ContextMenu` (shared anchored popup + web `MouseArea` right-click wrapper) ·
  `OutlineView` → recursive `NodeRow` (twisty, drag grip, status
  dot, content, fixed-width timer + points so columns align) · `StatusManager` ·
  `ShortcutsHelp` · `DragContext` (`DragProvider`/`useDrag`: **native web pointer events**,
  not PanResponder — PanResponder doesn't capture the mouse on RNW; measures row rects on
  drag start, maps pointer-Y to before/inside/after, dispatches `moveNode`).

  Tabs are tracked in the store as `openTabs: string[]` (file names); `loadProject` adds a
  tab and `closeTab` focuses a neighbour (or a blank project) when the active tab closes.

- **`src/markdown/`** — a dependency-free inline tokenizer (`inline.ts`) + renderer for the
  single-line subset (bold/italic/`code`/links).

### The interaction model is modal (see SPEC.md §3)

A row is either **selected** (navigation) or **editing** (caret in text), toggled by
Enter/Esc. This split is load-bearing:
- **Navigation keys** (↑↓, Tab/Shift+Tab indent, Alt+↑↓ move, Enter=new sibling, `S` status,
  `P` points, Space timer, Delete) are handled by the global `useKeyboardNav` listener,
  which only acts when `mode === 'selected'`.
- **Editing keys** (Enter=commit+new sibling, Shift+Enter=newline, Esc=exit,
  Backspace-on-empty=delete) are handled locally in `NodeRow`'s `TextInput.onKeyPress`.

When adding a shortcut, decide which mode owns it and put it in the matching place; don't add
editing behaviour to the global listener or vice versa.

## Conventions

- New nodes are created as plain notes and *promoted* to tasks by assigning a status
  (`S` cycles `null → statuses → null`). Keep that flow intact.
- Status ids and the point scale are user-configurable and stored in the project file;
  the only hard-coded id is `DONE_STATUS_ID` (`'done'`) used for completion rollups.
- Add tests under `src/**/...test.ts` for any new `model/` logic — that layer is the one
  with real coverage (`tree`, `metrics`, `markdown`). UI/store glue is left untested.
