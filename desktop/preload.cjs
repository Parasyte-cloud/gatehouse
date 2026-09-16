// Minimal contextBridge surface. contextIsolation is on and nodeIntegration
// is off in the main window (see main.cjs), so this is the *only* thing a
// loaded page can reach of Electron/Node - keep it exactly this small.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  openExternal: (url) => ipcRenderer.invoke('open-external', url)
})
