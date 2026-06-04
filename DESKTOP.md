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

## Build a Windows installer

```bash
npm run desktop:dist
```

This produces an installer under `release/` (e.g. `Advanced Tasker Setup x.y.z.exe`).

**One-time prerequisite:** electron-builder downloads a code-signing helper whose archive
contains macOS symlinks, and Windows blocks creating symlinks unless **Developer Mode** is
on (or the terminal runs as Administrator). Without it you'll see
`Cannot create symbolic link … A required privilege is not held by the client`.

Enable it once: **Settings → Privacy & security → For developers → Developer Mode → On**,
then re-run `npm run desktop:dist`. (No certificate is used — the build is unsigned, so
Windows SmartScreen may warn on first launch; that's expected for a personal build.)

## Notes

- The build is **unsigned**. For a signed installer you'd add a code-signing certificate.
- App metadata (name, id, targets) lives under `"build"` in `package.json`.
- A custom app icon isn't set yet — drop a 256×256+ `build/icon.ico` and point
  `build.win.icon` at it to brand the window/installer.
- Prefer a tiny binary over Chromium's size? Tauri is possible, but its macOS webview lacks
  the File System Access API, so the folder/file persistence would need rewriting onto
  Tauri's native fs. On Windows (WebView2) it would work.
