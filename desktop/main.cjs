// PArAsYtE Browser desktop shell - main process.
//
// v1 scaffold: wraps the existing web app (the same Vite/React build used
// on gatehouse.parasyte.cloud) in an installable native window instead of
// a browser tab. It does not yet replace the in-app iframe with a real
// per-tab <webview> - that's the planned v2 (see the desktop README and
// the project decision doc). This file's job is just to host that web app
// as a real desktop app: window chrome, external-link handling, and
// locking down what any page loaded inside this app - now or once webviews
// are added - is allowed to do.
const { app, BrowserWindow, shell, ipcMain, session } = require('electron')
const path = require('node:path')

const isDev = !app.isPackaged

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    title: 'PArAsYtE Browser',
    backgroundColor: '#050b12',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // Enabled now so the v2 per-tab <webview> work can land without
      // another main-process change. Each <webview> tag still needs its
      // own contextIsolation/nodeIntegration attributes set explicitly
      // when it's added - this flag only permits the tag to exist.
      webviewTag: true,
      sandbox: true
    }
  })

  // Anything loaded in this window - or, later, in a <webview> guest -
  // that tries to open a new window (window.open, target="_blank", a
  // <webview> new-window event) is handed to the user's real OS browser
  // instead. Nothing a loaded page runs can ever spawn a second window
  // inside this app. This is the desktop-shell equivalent of never
  // granting allow-popups in the web build's iframe sandbox.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  const devServerUrl = process.env.GATEHOUSE_DEV_SERVER_URL || 'http://localhost:5173'
  if (isDev) {
    void win.loadURL(devServerUrl)
  } else {
    void win.loadFile(path.join(__dirname, 'dist', 'index.html'))
  }

  return win
}

app.whenReady().then(() => {
  // Mirrors the iframe build's `allow="camera 'none'; microphone 'none'; ..."`
  // permissions policy: nothing loaded anywhere in this app - the shell
  // itself or, later, a webview guest - can be granted camera, mic,
  // geolocation, clipboard, etc.
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })

  ipcMain.handle('open-external', (_event, url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      void shell.openExternal(url)
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
