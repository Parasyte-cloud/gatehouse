# PArAsYtE Browser - desktop shell (v1)

An installable native window (macOS/Windows/Linux) wrapping the same
React/Vite web app used at `gatehouse.parasyte.cloud`. It does **not** yet
replace the in-app iframe with a real per-tab `<webview>` - see "v2" below.
What v1 gives you today, that the web build alone doesn't: a real app icon
and dock/taskbar entry, a window instead of a browser tab, and external
links opening in your actual default browser instead of a second Electron
window.

## Run it in development

From this `desktop/` folder:

```
npm install
npm run dev
```

This starts the existing app's `vite dev server` (port 5173) and an
Electron window pointed at it, together. Edits to `src/` hot-reload exactly
as they do today at `localhost:5173`.

## Build an installer

```
npm install
npm run dist:mac    # .dmg, current platform only
npm run dist:win    # .exe (nsis) - build on Windows, or with wine on macOS/Linux
npm run dist:linux  # .AppImage
```

Each of these builds the web app for production first, copies it into
`desktop/dist`, then runs `electron-builder`. Output lands in
`desktop/release/`.

**Not yet done, needed before shipping installers to real users:**
- App icon - `electron-builder` needs an `.icns` (mac) / `.ico` (win) /
  `.png` (linux) under `build/` referenced from `package.json`; there's a
  placeholder mask/shield mark in `src/assets/parasyte-logo.png` on the web
  side that could be converted, but no icon files exist here yet.
- Code signing and notarization. Without these, macOS Gatekeeper will show
  an "unidentified developer" warning on first launch, and Windows
  SmartScreen will warn similarly. Signing needs an Apple Developer account
  (for notarization) and a code-signing certificate (for Windows) - both
  the user's own accounts, not something this scaffold can set up.

## What "v1" deliberately does not change

The web app inside this shell is unmodified except for one thing: external
links (the "Open in a tab" / "Open outside" buttons) now call
`window.electronAPI.openExternal()` when running inside this shell, which
opens the OS's real default browser via Electron's `shell.openExternal`,
instead of `window.open()` spawning a second in-app window. Everything else
- the approve-to-embed policy, the iframe sandbox, saved sites, auth - is
exactly the same code running exactly the same way as on the web.

## v2 (not started): real per-tab browsing instead of an iframe

The reason a "real standalone browser" was asked for in the first place:
an iframe can never load a site that sends `X-Frame-Options` or
`frame-ancestors` refusing to be framed (most banks, Google, many social
platforms) - that's enforced by the browser loading the iframe, not
something PArAsYtE's own policy can override. Electron's `<webview>` tag
(already enabled via `webviewTag: true` in `main.cjs`, not yet used) loads
a page more like a real browser tab does, so it is not automatically
subject to that same restriction (this still needs verification per-site;
mixed-content/HTTPS rules still apply regardless).

Scoping this properly, once v1 is confirmed working:
- Swap `<iframe>` for `<webview>` in `GatehouseBrowser.tsx` when
  `window.electronAPI` is present, keeping the iframe path for the plain
  web build.
- Decide whether the approve-to-embed gate still makes sense once tabs are
  real browser tabs rather than iframes sandboxed inside the app - a real
  tab doesn't need `allow-same-origin`/`allow-scripts` sandbox flags to stay
  isolated from PArAsYtE's own UI the way an embedded iframe does. It may
  become "which origins keep a persistent session partition" only, with no
  separate embed/no-embed gate at all.
- Each `<webview>` needs its own `partition` attribute (a persistent
  `persist:approved-<origin>` for storage-trusted origins, an ephemeral,
  per-tab partition for everything else) so "nothing is kept unless you
  save it" still holds for real browser tabs, not just iframes.
