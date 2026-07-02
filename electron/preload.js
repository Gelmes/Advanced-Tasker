// Preload bridge (runs with contextIsolation on). Exposes a tiny, safe surface to
// the renderer for encrypted token storage — the actual encryption happens in the
// main process via safeStorage. No Node APIs are leaked to the app.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('atSecure', {
  getToken: () => ipcRenderer.invoke('secure:getToken'),
  setToken: (token) => ipcRenderer.invoke('secure:setToken', token),
});
