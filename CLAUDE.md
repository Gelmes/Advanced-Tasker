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
```

There is no separate lint step; `npm run typecheck` is the gate. `npm run android` /
`npm run ios` exist from the scaffold but mobile is not a current target.

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
  - `rollups.ts` — `computeRollup` sums time/points/completion over a subtree; **rollups
    are derived at render time, never stored**.
  - `factory.ts`, `defaults.ts`, `ids.ts` — node/project construction, default statuses
    (`todo/doing/blocked/done`) and Fibonacci point scale, id generation.

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

- **`src/components/`** — `ProjectSidebar` (folder/project switcher) · `WorkspaceBar`
  (folder/file actions + Statuses + Shortcuts) · `OutlineView` (editable title) → recursive
  `NodeRow` (twisty, drag grip, status dot, content, timer, points are independent click
  targets) · `StatusManager` · `ShortcutsHelp` · `DragContext` (`DragProvider`/`useDrag`:
  measures rows on drag start, maps pointer-Y to a before/inside/after drop, dispatches
  `moveNode`).

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
