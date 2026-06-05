// Electron main process. Serves the exported web bundle (../dist) over a custom
// `app://` scheme registered as a *secure* context, which is what the File System
// Access API (folder/file pickers, handle persistence) requires — file:// is not a
// secure context and would break it. The renderer is plain Chromium, so all of the
// app's web code (FSA, IndexedDB, SVG charts, etc.) runs unchanged.

const { app, BrowserWindow, protocol, shell, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');

const SCHEME = 'app';

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};

// Locate the exported web bundle: beside main.js (portable build) or one level up
// (dev run + electron-builder asar).
const DIST = [path.join(__dirname, 'dist'), path.join(__dirname, '..', 'dist')].find(
  (p) => fsSync.existsSync(p),
) ?? path.join(__dirname, '..', 'dist');

protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

async function serve(request) {
  try {
    const pathname = decodeURIComponent(new URL(request.url).pathname);
    let filePath = path.join(DIST, pathname === '/' ? '/index.html' : pathname);
    if (!filePath.startsWith(DIST)) filePath = path.join(DIST, 'index.html'); // no traversal

    let data;
    try {
      data = await fs.readFile(filePath);
    } catch {
      filePath = path.join(DIST, 'index.html'); // fall back to the app shell
      data = await fs.readFile(filePath);
    }
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    return new Response(data, { headers: { 'content-type': type } });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

const ICON = [
  path.join(__dirname, 'icon.ico'),
  path.join(__dirname, '..', 'build', 'icon.ico'),
].find((p) => fsSync.existsSync(p));

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: 'Advanced Tasker',
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    ...(ICON ? { icon: ICON } : {}),
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  // Markdown links etc. open in the system browser, not a new app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.loadURL(`${SCHEME}://local/index.html`);
}

app.whenReady().then(() => {
  protocol.handle(SCHEME, serve);
  // This is a local, single-user app — grant File System Access fully so remembered
  // folders stay authorized across restarts (queryPermission returns 'granted'), and
  // pickers don't prompt for permission.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, cb) => cb(true));
  session.defaultSession.setPermissionCheckHandler(() => true);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
