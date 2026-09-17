// Minimal contextBridge surface. Keep all Electron/Node objects in the main
// process; the renderer only gets narrowly-scoped browser commands.
const { contextBridge, ipcRenderer } = require('electron')

function on(channel, callback) {
  const listener = (_event, payload) => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  setBrowserSize: (size) => ipcRenderer.invoke('window-set-browser-size', size),
  getWindowState: () => ipcRenderer.invoke('window-state'),

  browserNavigate: (id, url) => ipcRenderer.invoke('browser-tab-navigate', { id, url }),
  browserShow: (id, bounds) => ipcRenderer.invoke('browser-tab-show', { id, bounds }),
  browserHide: () => ipcRenderer.invoke('browser-tab-hide'),
  browserSetBounds: (id, bounds) => ipcRenderer.invoke('browser-tab-bounds', { id, bounds }),
  browserClose: (id) => ipcRenderer.invoke('browser-tab-close', id),
  browserCommand: (id, command) => ipcRenderer.invoke('browser-tab-command', { id, command }),
  onBrowserTabState: (callback) => on('browser-tab-state', callback),
  onBrowserCommand: (callback) => on('browser-command', callback),

  listDownloads: () => ipcRenderer.invoke('browser-downloads-list'),
  showDownloadInFolder: (savePath) => ipcRenderer.invoke('browser-download-show-in-folder', savePath),
  openDownload: (savePath) => ipcRenderer.invoke('browser-download-open', savePath),
  onDownloadUpdated: (callback) => on('browser-download-updated', callback)
})
