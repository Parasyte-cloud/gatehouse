// PArAsYtE Browser desktop shell - main process.
//
// The renderer owns browser chrome (tabs, omnibox, bookmarks, settings). Real
// third-party pages are rendered in isolated WebContentsView instances rather
// than iframes. That matters for sites such as YouTube, GitHub, Figma and many
// identity providers that intentionally refuse iframe embedding.
//
// Security invariants:
//   * renderer: contextIsolation on, Node integration off
//   * guest tabs: sandbox on, contextIsolation on, Node integration off
//   * guest tabs use an in-memory partition, so site state is discarded when
//     PArAsYtE exits unless a future explicit container/persistence feature is
//     added
//   * private/local network destinations are rejected in the main process too
//   * camera/mic/location/payment/device permissions are denied by default
//   * the shell never strips a destination's X-Frame-Options/CSP headers
//
// WebContentsView is the current Electron API for composing browser content.
// BrowserView is deprecated and <webview> is not recommended by Electron.
const {
  app,
  BrowserWindow,
  WebContentsView,
  shell,
  ipcMain,
  session,
  screen
} = require('electron')
const path = require('node:path')
const crypto = require('node:crypto')

const isDev = !app.isPackaged

const WINDOW_PRESETS = Object.freeze({
  compact: { width: 1040, height: 680 },
  balanced: { width: 1280, height: 820 },
  expanded: { width: 1500, height: 940 }
})

// One ephemeral browsing session shared by normal tabs during this app run.
// No `persist:` prefix means Chromium keeps it in memory only.
const BROWSING_PARTITION = 'parasyte-browsing-session'

/** @type {Map<number, Map<string, Electron.WebContentsView>>} */
const tabViewsByWindow = new Map()
/** @type {Map<number, string | null>} */
const activeTabByWindow = new Map()
/** @type {Map<number, {x:number,y:number,width:number,height:number}>} */
const lastBoundsByWindow = new Map()
/** @type {Map<string, {id:string, filename:string, url:string, receivedBytes:number, totalBytes:number, state:string, savePath:string|null, startedAt:number}>} */
const downloads = new Map()

function senderWindow(event) {
  return BrowserWindow.fromWebContents(event.sender)
}

function windowTabs(win) {
  let tabs = tabViewsByWindow.get(win.id)
  if (!tabs) {
    tabs = new Map()
    tabViewsByWindow.set(win.id, tabs)
  }
  return tabs
}

function clampWindowSizeToWorkArea(win, requested) {
  const display = screen.getDisplayMatching(win.getBounds())
  const { width: maxWidth, height: maxHeight } = display.workAreaSize
  return {
    width: Math.max(960, Math.min(requested.width, maxWidth)),
    height: Math.max(600, Math.min(requested.height, maxHeight))
  }
}

function normalizedBounds(win, bounds) {
  const content = win.getContentBounds()
  const x = Number.isFinite(bounds?.x) ? Math.max(0, Math.round(bounds.x)) : 0
  const y = Number.isFinite(bounds?.y) ? Math.max(0, Math.round(bounds.y)) : 0
  const width = Number.isFinite(bounds?.width) ? Math.max(1, Math.round(bounds.width)) : 1
  const height = Number.isFinite(bounds?.height) ? Math.max(1, Math.round(bounds.height)) : 1
  return {
    x: Math.min(x, Math.max(0, content.width - 1)),
    y: Math.min(y, Math.max(0, content.height - 1)),
    width: Math.max(1, Math.min(width, Math.max(1, content.width - x))),
    height: Math.max(1, Math.min(height, Math.max(1, content.height - y)))
  }
}

function privateIPv4(host) {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!match) return false
  const octets = match.slice(1).map(Number)
  if (octets.some((value) => value < 0 || value > 255)) return false
  const [a, b] = octets
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  )
}

function embeddedIPv4FromIPv6(host) {
  const dotted =
    host.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/) ||
    host.match(/^64:ff9b::(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/) ||
    host.match(/^::(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (dotted) return dotted[1]

  const hex =
    host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i) ||
    host.match(/^64:ff9b::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i) ||
    host.match(/^::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i)
  if (!hex) return null
  const hi = Number.parseInt(hex[1], 16)
  const lo = Number.parseInt(hex[2], 16)
  if (Number.isNaN(hi) || Number.isNaN(lo)) return null
  return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`
}

function isPrivateNetworkHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '')
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === '0.0.0.0' ||
    host === '::' ||
    host === '::1' ||
    (host.includes(':') && (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')))
  ) return true

  if (host.includes(':')) {
    const embedded = embeddedIPv4FromIPv6(host)
    if (embedded && privateIPv4(embedded)) return true
  }
  return privateIPv4(host)
}

function validatedWebUrl(value) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (url.username || url.password) return null
    if (isPrivateNetworkHost(url.hostname)) return null
    return url
  } catch {
    return null
  }
}

function externalProtocolUrl(value) {
  try {
    const url = new URL(value)
    return ['mailto:', 'tel:', 'sms:'].includes(url.protocol) ? url : null
  } catch {
    return null
  }
}

function navigationEventTarget(valueOrDetails, legacyIsMainFrame = true) {
  if (typeof valueOrDetails === 'string') {
    return { url: valueOrDetails, isMainFrame: legacyIsMainFrame !== false }
  }
  if (valueOrDetails && typeof valueOrDetails === 'object') {
    return {
      url: typeof valueOrDetails.url === 'string' ? valueOrDetails.url : '',
      isMainFrame: valueOrDetails.isMainFrame !== false
    }
  }
  return { url: '', isMainFrame: legacyIsMainFrame !== false }
}

function cleanUserAgent(webContents) {
  const current = webContents.getUserAgent()
  return current
    .replace(/\sElectron\/[^\s]+/g, '')
    .replace(/\sPArAsYtE\/[^\s]+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function navigationHistory(webContents) {
  const nav = webContents.navigationHistory
  const canGoBack = nav?.canGoBack ? nav.canGoBack() : Boolean(webContents.canGoBack?.())
  const canGoForward = nav?.canGoForward ? nav.canGoForward() : Boolean(webContents.canGoForward?.())
  return { canGoBack, canGoForward }
}

function emitTabState(win, tabId, view, extra = {}) {
  if (!win || win.isDestroyed() || !view || view.webContents.isDestroyed()) return
  const history = navigationHistory(view.webContents)
  win.webContents.send('browser-tab-state', {
    id: tabId,
    url: view.webContents.getURL(),
    title: view.webContents.getTitle(),
    loading: view.webContents.isLoading(),
    ...history,
    ...extra
  })
}

function sendBrowserCommand(win, command, payload = {}) {
  if (!win || win.isDestroyed()) return
  win.webContents.send('browser-command', { command, ...payload })
}

function configureGuestView(win, tabId, view) {
  const contents = view.webContents
  contents.setUserAgent(cleanUserAgent(contents))
  view.setBackgroundColor('#ffffff')

  contents.on('did-start-loading', () => emitTabState(win, tabId, view, { loading: true, error: null }))
  contents.on('did-stop-loading', () => emitTabState(win, tabId, view, { loading: false, error: null }))
  contents.on('did-finish-load', () => emitTabState(win, tabId, view, { loading: false, error: null }))
  contents.on('did-navigate', () => emitTabState(win, tabId, view, { error: null }))
  contents.on('did-navigate-in-page', () => emitTabState(win, tabId, view, { error: null }))
  contents.on('page-title-updated', (_event, title) => emitTabState(win, tabId, view, { title }))
  contents.on('page-favicon-updated', (_event, favicons) => emitTabState(win, tabId, view, { favicon: favicons?.[0] || null }))
  contents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    // Chromium reports ERR_ABORTED (-3) for normal redirects/navigation stops.
    if (!isMainFrame || errorCode === -3) return
    emitTabState(win, tabId, view, {
      loading: false,
      error: errorDescription || `Navigation failed (${errorCode})`,
      url: validatedURL || contents.getURL()
    })
  })

  // Electron 33 delivered a URL string here; newer Electron releases use a
  // navigation-details object. Accept both forms so the browser remains safe
  // while we move to supported Electron releases.
  contents.on('will-navigate', (event, valueOrDetails) => {
    const target = navigationEventTarget(valueOrDetails)
    if (externalProtocolUrl(target.url)) {
      event.preventDefault()
      void shell.openExternal(target.url)
      return
    }
    if (!validatedWebUrl(target.url)) {
      event.preventDefault()
      emitTabState(win, tabId, view, { loading: false, error: 'PArAsYtE blocked an unsafe or private-network destination.' })
    }
  })

  contents.on('will-redirect', (event, valueOrDetails, _isInPlace, legacyIsMainFrame) => {
    const target = navigationEventTarget(valueOrDetails, legacyIsMainFrame)
    if (!target.isMainFrame) return
    if (!validatedWebUrl(target.url)) {
      event.preventDefault()
      emitTabState(win, tabId, view, { loading: false, error: 'PArAsYtE blocked an unsafe or private-network redirect.' })
    }
  })

  contents.on('render-process-gone', (_event, details) => {
    emitTabState(win, tabId, view, {
      loading: false,
      error: details?.reason === 'clean-exit' ? null : 'This tab stopped unexpectedly. Reload it to continue.'
    })
  })

  contents.setWindowOpenHandler(({ url }) => {
    const parsed = validatedWebUrl(url)
    if (parsed) {
      sendBrowserCommand(win, 'new-tab', { url: parsed.toString() })
    } else if (externalProtocolUrl(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // Browser keyboard shortcuts must keep working even while focus is inside
  // the native guest view instead of the React chrome.
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || (!input.meta && !input.control)) return
    const key = String(input.key || '').toLowerCase()
    if (key === 'l') {
      event.preventDefault()
      sendBrowserCommand(win, 'focus-location')
    } else if (key === 't' && input.shift) {
      event.preventDefault()
      sendBrowserCommand(win, 'reopen-closed-tab')
    } else if (key === 't') {
      event.preventDefault()
      sendBrowserCommand(win, 'new-tab')
    } else if (key === 'w') {
      event.preventDefault()
      sendBrowserCommand(win, 'close-active-tab')
    }
  })
}

function ensureTabView(win, tabId) {
  const tabs = windowTabs(win)
  const existing = tabs.get(tabId)
  if (existing && !existing.webContents.isDestroyed()) return existing

  const view = new WebContentsView({
    webPreferences: {
      partition: BROWSING_PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: true
    }
  })
  configureGuestView(win, tabId, view)
  tabs.set(tabId, view)
  return view
}

function showTabView(win, tabId, bounds) {
  const tabs = windowTabs(win)
  const view = ensureTabView(win, tabId)
  const previousId = activeTabByWindow.get(win.id)
  if (previousId && previousId !== tabId) {
    const previous = tabs.get(previousId)
    previous?.setVisible(false)
  }

  if (!win.contentView.children.includes(view)) {
    win.contentView.addChildView(view)
  } else {
    // Re-adding an existing child makes it the top-most native view.
    win.contentView.addChildView(view)
  }

  const normalized = normalizedBounds(win, bounds || lastBoundsByWindow.get(win.id) || {})
  lastBoundsByWindow.set(win.id, normalized)
  view.setBounds(normalized)
  view.setVisible(true)
  activeTabByWindow.set(win.id, tabId)
  emitTabState(win, tabId, view)
}

function hideActiveView(win) {
  const id = activeTabByWindow.get(win.id)
  if (!id) return
  const view = windowTabs(win).get(id)
  view?.setVisible(false)
  activeTabByWindow.set(win.id, null)
}

function closeTabView(win, tabId) {
  const tabs = windowTabs(win)
  const view = tabs.get(tabId)
  if (!view) return
  if (activeTabByWindow.get(win.id) === tabId) activeTabByWindow.set(win.id, null)
  try {
    win.contentView.removeChildView(view)
  } catch {
    // no-op if already detached
  }
  if (!view.webContents.isDestroyed()) view.webContents.close()
  tabs.delete(tabId)
}

function closeAllViews(win) {
  const tabs = tabViewsByWindow.get(win.id)
  if (tabs) {
    for (const [tabId] of tabs) closeTabView(win, tabId)
  }
  tabViewsByWindow.delete(win.id)
  activeTabByWindow.delete(win.id)
  lastBoundsByWindow.delete(win.id)
}

function broadcastDownload(payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('browser-download-updated', payload)
  }
}

function configureBrowsingSession() {
  const browsingSession = session.fromPartition(BROWSING_PARTITION)

  browsingSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  browsingSession.setPermissionCheckHandler(() => false)

  // Block literal private/local destinations not only as top-level pages but
  // also when a remote page attempts to reach them as a subresource. This is
  // defense-in-depth for the browser's private-network boundary.
  browsingSession.webRequest.onBeforeRequest((details, callback) => {
    try {
      const url = new URL(details.url)
      if ((url.protocol === 'http:' || url.protocol === 'https:') && isPrivateNetworkHost(url.hostname)) {
        callback({ cancel: true })
        return
      }
    } catch {
      // Non-URL internal requests are handled by Chromium itself.
    }
    callback({})
  })

  browsingSession.on('will-download', (_event, item) => {
    const id = crypto.randomUUID()
    const snapshot = {
      id,
      filename: item.getFilename(),
      url: item.getURL(),
      receivedBytes: item.getReceivedBytes(),
      totalBytes: item.getTotalBytes(),
      state: 'progressing',
      savePath: item.getSavePath() || null,
      startedAt: Date.now()
    }
    downloads.set(id, snapshot)
    broadcastDownload(snapshot)

    item.on('updated', (_downloadEvent, state) => {
      const previous = downloads.get(id) || snapshot
      const next = {
        ...previous,
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
        state,
        savePath: item.getSavePath() || previous.savePath || null
      }
      downloads.set(id, next)
      broadcastDownload(next)
    })

    item.once('done', (_downloadEvent, state) => {
      const previous = downloads.get(id) || snapshot
      const next = {
        ...previous,
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
        state,
        savePath: item.getSavePath() || previous.savePath || null
      }
      downloads.set(id, next)
      broadcastDownload(next)
    })
  })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    title: 'PArAsYtE Browser',
    backgroundColor: '#050b12',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // The React shell should never spawn arbitrary BrowserWindows.
  win.webContents.setWindowOpenHandler(({ url }) => {
    const parsed = validatedWebUrl(url)
    if (parsed) void shell.openExternal(parsed.toString())
    return { action: 'deny' }
  })

  win.on('closed', () => closeAllViews(win))
  win.on('resize', () => {
    const activeId = activeTabByWindow.get(win.id)
    const bounds = lastBoundsByWindow.get(win.id)
    if (!activeId || !bounds) return
    const view = windowTabs(win).get(activeId)
    if (view?.getVisible()) view.setBounds(normalizedBounds(win, bounds))
  })

  const devServerUrl = process.env.GATEHOUSE_DEV_SERVER_URL || 'http://localhost:5173'
  if (isDev) void win.loadURL(devServerUrl)
  else void win.loadFile(path.join(__dirname, 'dist', 'index.html'))

  return win
}

app.whenReady().then(() => {
  configureBrowsingSession()

  // Shell permissions stay denied too. Account auth works over ordinary HTTPS
  // and does not require privileged Chromium permissions.
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  session.defaultSession.setPermissionCheckHandler(() => false)

  ipcMain.handle('open-external', (_event, url) => {
    const parsed = validatedWebUrl(url)
    if (parsed) void shell.openExternal(parsed.toString())
  })

  ipcMain.handle('window-set-browser-size', (event, size) => {
    const win = senderWindow(event)
    if (!win || win.isDestroyed()) return

    if (size === 'maximized') {
      win.maximize()
    } else if (Object.prototype.hasOwnProperty.call(WINDOW_PRESETS, size)) {
      if (win.isMaximized()) win.unmaximize()
      const bounds = clampWindowSizeToWorkArea(win, WINDOW_PRESETS[size])
      win.setSize(bounds.width, bounds.height, true)
      win.center()
    } else {
      return
    }

    const [width, height] = win.getSize()
    return { maximized: win.isMaximized(), width, height }
  })

  ipcMain.handle('window-state', (event) => {
    const win = senderWindow(event)
    if (!win || win.isDestroyed()) return { maximized: false, minimized: false, fullScreen: false }
    return {
      maximized: win.isMaximized(),
      minimized: win.isMinimized(),
      fullScreen: win.isFullScreen()
    }
  })

  ipcMain.handle('browser-tab-navigate', async (event, { id, url }) => {
    const win = senderWindow(event)
    const parsed = validatedWebUrl(url)
    if (!win || win.isDestroyed() || typeof id !== 'string' || !parsed) {
      return { ok: false, error: 'Blocked unsafe or invalid destination.' }
    }
    const view = ensureTabView(win, id)
    try {
      await view.webContents.loadURL(parsed.toString())
      return { ok: true }
    } catch (error) {
      // did-fail-load sends the renderer a detailed state update as well.
      return { ok: false, error: error instanceof Error ? error.message : 'Navigation failed.' }
    }
  })

  ipcMain.handle('browser-tab-show', (event, { id, bounds }) => {
    const win = senderWindow(event)
    if (!win || win.isDestroyed() || typeof id !== 'string') return
    showTabView(win, id, bounds)
  })

  ipcMain.handle('browser-tab-hide', (event) => {
    const win = senderWindow(event)
    if (!win || win.isDestroyed()) return
    hideActiveView(win)
  })

  ipcMain.handle('browser-tab-bounds', (event, { id, bounds }) => {
    const win = senderWindow(event)
    if (!win || win.isDestroyed() || typeof id !== 'string') return
    const normalized = normalizedBounds(win, bounds)
    lastBoundsByWindow.set(win.id, normalized)
    const view = windowTabs(win).get(id)
    if (view && activeTabByWindow.get(win.id) === id && view.getVisible()) view.setBounds(normalized)
  })

  ipcMain.handle('browser-tab-close', (event, id) => {
    const win = senderWindow(event)
    if (!win || win.isDestroyed() || typeof id !== 'string') return
    closeTabView(win, id)
  })

  ipcMain.handle('browser-tab-command', (event, { id, command }) => {
    const win = senderWindow(event)
    if (!win || win.isDestroyed() || typeof id !== 'string') return
    const view = windowTabs(win).get(id)
    if (!view || view.webContents.isDestroyed()) return
    const contents = view.webContents
    const nav = contents.navigationHistory
    if (command === 'back') {
      if (nav?.canGoBack?.()) nav.goBack()
      else if (contents.canGoBack?.()) contents.goBack()
    } else if (command === 'forward') {
      if (nav?.canGoForward?.()) nav.goForward()
      else if (contents.canGoForward?.()) contents.goForward()
    } else if (command === 'reload') {
      contents.reload()
    } else if (command === 'stop') {
      contents.stop()
    }
    emitTabState(win, id, view)
  })

  ipcMain.handle('browser-downloads-list', () => Array.from(downloads.values()).sort((a, b) => b.startedAt - a.startedAt))
  ipcMain.handle('browser-download-show-in-folder', (_event, savePath) => {
    if (typeof savePath === 'string' && savePath) shell.showItemInFolder(savePath)
  })
  ipcMain.handle('browser-download-open', async (_event, savePath) => {
    if (typeof savePath !== 'string' || !savePath) return 'Invalid download path.'
    return shell.openPath(savePath)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
