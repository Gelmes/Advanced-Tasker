# Running Advanced Tasker as a desktop app

The app is wrapped in **Electron** (a Chromium window), so everything — the folder/file
pickers, charts, drag, etc. — works exactly as in Chrome, but in its own window with no
browser chrome. `electron/main.js` serves the exported web bundle over a secure `app://`
scheme (the File System Access API needs a *secure context*, which `file://` is not).

## Run it now (no build, no setup)

```bash
npm run desktop
```

This exports the web bundle and opens the app in a native window. Use this day-to-day —
it's the "don't use the browser" experience without packaging anything. (You can also run
`npm run export:web` once and then `npx electron electron/main.js` to skip re-exporting.)

## Build a portable app (recommended — no setup)

```bash
npm run desktop:portable
```

Produces a self-contained folder at **`release/Advanced Tasker-win32-x64/`** — copy it
anywhere and double-click **`Advanced Tasker.exe`**. No installer, no admin, no Windows
Developer Mode. Uses `@electron/packager` (which doesn't pull the signing helper that the
installer does). The folder is ~300 MB because it embeds Chromium.

## Build a Windows installer (optional)

```bash
npm run desktop:dist
```

Produces an installer under `release/` (e.g. `Advanced Tasker Setup x.y.z.exe`) with a
Start-menu entry and uninstaller.

**One-time prerequisite:** electron-builder downloads a code-signing helper whose archive
contains macOS symlinks, and Windows (the OS) blocks creating symlinks unless **Developer
Mode** is on. Without it you'll see
`Cannot create symbolic link … A required privilege is not held by the client`.

Enable it once in **Windows Settings → Privacy & security → For developers → Developer
Mode → On** (not a browser setting), then re-run `npm run desktop:dist`. If you'd rather
not, just use the **portable** build above — it needs none of this.

Both builds are **unsigned**, so Windows SmartScreen may warn on first launch ("More info →
Run anyway"); that's expected for a personal build.

## Icon

`build/icon.png` / `build/icon.ico` are generated from an inline SVG by
`npm run icon` (`scripts/gen-icon.mjs`). Edit the SVG there and re-run to rebrand.

## Notes

- The build is **unsigned**. For a signed installer you'd add a code-signing certificate.
- App metadata (name, id, targets) lives under `"build"` in `package.json`.
- Prefer a tiny binary over Chromium's size? Tauri is possible, but its macOS webview lacks
  the File System Access API, so the folder/file persistence would need rewriting onto
  Tauri's native fs. On Windows (WebView2) it would work.
