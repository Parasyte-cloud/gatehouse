export {}

type NativeRect = { x: number; y: number; width: number; height: number }

type NativeTabState = {
  id: string
  url?: string
  title?: string
  favicon?: string | null
  loading?: boolean
  canGoBack?: boolean
  canGoForward?: boolean
  error?: string | null
}

type NativeBrowserCommand = {
  command: 'focus-location' | 'new-tab' | 'reopen-closed-tab' | 'close-active-tab'
  url?: string
}

type NativeDownload = {
  id: string
  filename: string
  url: string
  receivedBytes: number
  totalBytes: number
  state: string
  savePath: string | null
  startedAt: number
}

declare global {
  interface Window {
    electronAPI?: {
      isElectron: true
      openExternal: (url: string) => Promise<void> | void
      setBrowserSize: (size: 'compact' | 'balanced' | 'expanded' | 'maximized') => Promise<{ maximized: boolean; width: number; height: number } | void>
      getWindowState: () => Promise<{ maximized: boolean; minimized: boolean; fullScreen: boolean }>

      browserNavigate: (id: string, url: string) => Promise<{ ok: boolean; error?: string }>
      browserShow: (id: string, bounds: NativeRect) => Promise<void>
      browserHide: () => Promise<void>
      browserSetBounds: (id: string, bounds: NativeRect) => Promise<void>
      browserClose: (id: string) => Promise<void>
      browserCommand: (id: string, command: 'back' | 'forward' | 'reload' | 'stop') => Promise<void>
      onBrowserTabState: (callback: (state: NativeTabState) => void) => () => void
      onBrowserCommand: (callback: (command: NativeBrowserCommand) => void) => () => void

      listDownloads: () => Promise<NativeDownload[]>
      showDownloadInFolder: (savePath: string) => Promise<void>
      openDownload: (savePath: string) => Promise<string>
      onDownloadUpdated: (callback: (download: NativeDownload) => void) => () => void
    }
  }
}
