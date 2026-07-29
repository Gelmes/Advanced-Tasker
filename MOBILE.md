# Advanced Tasker — Mobile (Android) Design

Design source of truth for the Android app. Companion doc to `SPEC.md` (app
design), `SYNC.md` (merge rules), and `DESKTOP.md` (Electron wrapper). Decisions
here were agreed with Marco on 2026-07-29.

## Decisions (settled)

- **Framework: React Native / Expo, this repo.** No Flutter, no second codebase.
  The pure layers (`src/model/`, `src/sync/`, the Zustand store) run unchanged
  on native; mobile is a UI shell + platform adapters, not a rewrite. iOS later
  reuses everything.
- **V1 scope: companion app.** View outlines, expand/collapse, cycle statuses,
  run timers, quick-capture, inline text edits, sync. Structural editing
  (indent/outdent, drag reorder, status manager, charts) is v2+.
- **Offline-capable from the start.** Projects are cached locally; edits work
  offline and merge on reconnect. The symmetric per-field merge engine
  (`SYNC.md`) already makes this safe — offline support is plumbing, not new
  sync logic.
- **Fast capture is a core goal.** A phone is a capture device first. Quick-add
  must go from pocket to saved task in two taps.

## Architecture: shared brain, two shells

```
src/model  src/sync  src/store  src/markdown   ← shared, unchanged
        │
        ├── desktop shell: existing components (react-native-web + Electron)
        └── mobile shell:  src/mobile/ screens (touch-first, native Android)
```

**Do not retrofit the desktop components for touch.** They are full of
web-isms (raw `<div>` MouseArea, hover ContextMenu, CSS `var(--at-*)` styling,
`boxShadow` strings, `<input type=color>`, pointer-event DragContext). Mobile
gets its own small screen set that consumes the same store and model. Entry
point splits by platform in `App.tsx` (`Platform.OS`).

### Platform adapters (the web-only landmines, and their mobile replacements)

| Desktop (web) | Mobile replacement |
| --- | --- |
| File System Access folder of `.json` files (`persistence/directory.ts`, `file.ts`, `handleStore.ts`) | **No folder/file concept.** Server is the project source; local cache per project id via `expo-file-system` (JSON blob per project) + AsyncStorage for the project index / last-opened |
| Electron `secretStore` / web localStorage token | `expo-secure-store` for the sync token |
| CSS-variable theming (`var(--at-*)`) | Runtime palette context fed by the same `palettes` / `resolvedTheme` exported from `theme.ts` |
| `useKeyboardNav` global keymap | Not mounted on mobile (hardware-keyboard support is a later nicety) |
| DragContext (web pointer events) | v2: `react-native-gesture-handler` drag handle. Absent in v1 |
| ContextMenu on right-click/hover | Long-press bottom-sheet menu |
| File watch (`useFileWatch`), autosave-to-disk | Not applicable; replaced by the mobile sync loop |
| Tabs, split view | Back-stack navigation (Projects → Outline) |

### Mobile sync loop

Same engine, same server API (pull by project id, POST-merge, version polling —
no CORS concerns on native). Only the rhythm changes:

- **On app foreground:** sync the active project (and refresh the project list).
- **After local edits:** debounce ~3–5 s, then push-merge.
- **While an outline is open:** version-poll like desktop (15 s is fine).
- **Offline:** edits land in the local cache with a dirty flag; next successful
  sync merges. No queue of operations — the merge engine reconciles whole
  project states, which is exactly what it was built for.
- The server API is already sufficient: `GET /projects` (list), `GET /sync/:id`
  (pull), `POST /sync/:id` (push-merge), `GET /sync/:id/version` (poll),
  `DELETE /sync/:id` (tombstone). No server changes needed for v1.

## V1 screens

1. **Projects** — server + cached project list; sync state per project
   (synced / dirty / offline); pull-to-refresh; prominent quick-add (see 4).
2. **Outline** — the core screen. Recursive rows like `NodeRow` but
   touch-first: ≥48 dp row height, twisty to expand/collapse, **tap status dot
   to cycle status**, timer chip to start/stop, tap content once to select, tap
   again to edit text inline. Long-press → bottom sheet (details, bookmark,
   delete; structural ops appear here in v2). Rollups/points render read-only.
3. **Task details** — bottom sheet or screen: due date, points, effort/timer
   intervals, status history. Mirrors `TaskDetails`.
4. **Quick capture** — FAB on Projects and Outline. Opens a single text field
   over the keyboard; Enter saves and keeps the field open for the next entry
   (rapid-fire capture); dismiss to close. Captures append to a chosen
   **inbox project** (configurable, defaults to last used).
5. **Sync settings** — server URL + token (secure store), last-sync info.
   First-run experience is basically this screen.

### Text editing on native

`TextInput` on Android ≠ web: `onKeyPress` is limited (no reliable
Backspace-on-empty or Shift+Enter). V1 keeps editing simple: edit content,
done/return commits. The desktop editing-key cleverness stays desktop-only.
Keyboard avoidance (`KeyboardAvoidingView` / scroll-into-view) keeps the
editing row visible. V2 adds an **input accessory toolbar** above the keyboard
(new sibling, indent, outdent, status, points) — the standard mobile-outliner
answer to keys a soft keyboard can't express.

## Phases

- **Phase 0 — boot.** Make `npx expo start` + Expo Go on Marco's phone render a
  hello-mobile shell without pulling in web-only modules (platform-split entry;
  guard web imports). Decide dev loop: Expo Go while deps allow, EAS/dev-client
  APK when needed.
- **Phase 1 — read + sync.** Persistence adapter (cache + secure token), theme
  adapter, Projects + Outline read-only, full sync loop. *Milestone: browse
  real projects on the phone, live-synced from Railway.*
- **Phase 2 — companion interactions.** Status cycling, timers, quick capture,
  inline content edit, task details, offline dirty-flag flow. *Milestone: daily
  usable.*
- **Phase 3 — structural editing.** *Done.* A structural toolbar
  (outdent / indent / move up / move down / new task / Done) plus a Move section
  in the long-press sheet. The toolbar follows the **selection, not editing**:
  Android blurs the editor on touch-down and a moved row can be remounted by the
  list, so anything keyed to keyboard focus vanished mid-reorder. Editing resumes
  after an op on a best-effort basis; blur therefore only *saves* the draft, and
  edit mode ends on explicit exits (Done, row switch, long-press, back) or
  `keyboardDidHide`.

  **Drag reorder** is a grip on the selected row (`PanResponder` — unreliable
  for *mouse* on RNW, which is why the desktop uses raw pointer events, but the
  right tool for touch). The pan is **quantised into steps** that run the same
  store actions as the toolbar — vertical steps `moveSelected`, horizontal steps
  indent/outdent — instead of painting a ghost and computing a drop target. So
  the tree reorders live under the finger, every move goes through the tested
  tree ops, there are no virtualised-row measurements to get wrong, and no new
  native deps. The list scroll-follows the row so a drag can run past the bottom
  of the screen. Trade-offs: vertical movement is sibling-scoped (cross-parent
  moves = outdent then move, rather than `moveNodeRelative`'s free
  before/inside/after drop), and one drag records several undo steps.
- **Phase 4 — Android polish.** Share-sheet capture, home-screen widget,
  notifications for running timers, charts.

## Testing gate

Unchanged: `npm run typecheck` + `npx vitest run` + `npx expo export --platform
web` (desktop must never regress). Mobile additions should keep new logic in
pure modules where possible so it lands under vitest; screen glue follows the
existing convention of staying untested.
