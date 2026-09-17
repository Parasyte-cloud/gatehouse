# PArAsYtE Browser Desktop

The desktop app is the native PArAsYtE browser shell. React renders the browser
chrome (tabs, omnibox, sidebar, bookmarks, downloads and settings), while real
web pages are rendered as isolated Electron `WebContentsView` tabs.

## Why the desktop engine matters

A hosted web application cannot behave like a full browser: sites such as
YouTube and many identity providers intentionally block iframe embedding. The
desktop build therefore does **not** use iframes for normal browsing. Each tab
gets native Chromium web contents, so ordinary top-level sites load the same
way they do in a browser window.

Electron's own documentation recommends avoiding the `<webview>` tag for new
work. PArAsYtE uses `WebContentsView` instead.

## Development

From this `desktop/` directory:

```bash
npm install
npm run dev
```

The command starts the root Vite renderer and then launches Electron against
`http://localhost:5173`.

The root web build is still useful for the public/Cloudflare version:

```bash
cd ..
npm test
npm run build
npm run dev
```

Remember that the hosted web version is deliberately limited: third-party
sites still cannot become true top-level browser tabs there.

## Security model

- `contextIsolation: true` and `nodeIntegration: false` in the shell.
- Guest pages use sandboxed `WebContentsView` instances with Node disabled.
- Browsing tabs use an in-memory Electron session partition; site state is
  discarded when the application exits until an explicit persistent-container
  feature is introduced.
- Camera, microphone, geolocation, payment/device and other privileged browser
  permissions are denied by default.
- Literal localhost/private-network destinations are blocked both for top-level
  navigation and guest subresources.
- PArAsYtE does not strip a site's CSP or `X-Frame-Options` headers.
- `window.open`/`target=_blank` links become PArAsYtE tabs instead of arbitrary
  BrowserWindows.
- `mailto:`, `tel:` and `sms:` are handed to the operating system.

The current private-network protection is host-literal protection. A dedicated
DNS-resolution/rebinding defense is still required before describing the
browser as resistant to every DNS-rebinding variant.

## Native browser features implemented

- multiple independent tabs
- new/close/switch tabs and reopen-last-closed tab
- Cmd/Ctrl+L, Cmd/Ctrl+T, Cmd/Ctrl+W and Cmd/Ctrl+Shift+T
- back, forward, reload/stop and native navigation history
- bookmarks library
- native download tracking, open and show-in-folder
- external protocol handoff
- light/dark/system themes, wallpaper, glow and window-size presets
- one set of window controls: the operating system title bar

## Packaging

```bash
npm run dist:mac
npm run dist:win
npm run dist:linux
```

`electron-builder` writes installers to `desktop/release/`.

Before public distribution, add production application icons and configure
Apple notarization/macOS code signing and Windows signing.

## Critical dependency maintenance

The source snapshot received for this audit pins Electron 33, which is no
longer a supported Electron release. A browser must stay on a supported
Chromium/Electron line for security fixes. Before shipping the next installer,
upgrade Electron locally so `package-lock.json` is regenerated together with
`package.json`:

```bash
cd desktop
npm install --save-dev electron@44.4.1
npm run dev
```

Then run the installer build and smoke-test navigation, downloads, auth,
bookmarks, window sizing, all appearance modes and tab shortcuts on the target
OS.

## Next native-browser milestones

1. vertical tabs, pinning and tab groups
2. two-view split screen
3. named containers backed by explicit Electron session partitions
4. reader mode and translation
5. encrypted bookmark/tab/settings sync
6. extensions only after a security model and compatibility surface are
   defined; the UI must not advertise extension support before the engine
   exists
7. signed mobile apps following the platform browser rules documented in
   `../MOBILE_STRATEGY_2026-09-17.md`
