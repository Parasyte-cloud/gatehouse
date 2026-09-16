export {}

declare global {
  interface Window {
    /**
     * Present only when this build is running inside the PArAsYtE Browser
     * desktop shell (see /desktop). Exposed via a contextBridge preload
     * script - never assume Node/Electron APIs are reachable beyond what's
     * listed here. Undefined on the plain web build (Cloudflare Pages),
     * so every call site must guard with `window.electronAPI?.`.
     */
    electronAPI?: {
      isElectron: true
      /** Opens a URL in the user's real OS default browser via shell.openExternal. */
      openExternal: (url: string) => void
    }
  }
}
