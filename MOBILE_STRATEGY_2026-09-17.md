# PArAsYtE Mobile Strategy - iOS and Android

PArAsYtE mobile should be a real platform browser client, not a thin wrapper
around the current Cloudflare web app. Wrapping the iframe-based web build would
reintroduce the same anti-framing limitations that prevented sites such as
YouTube from working correctly.

## Shared product layer

Share brand/design tokens, Supabase account APIs, bookmarks, trusted choices,
settings schema and sync models. Do **not** try to reuse the Electron renderer
engine directly on phones.

## iOS

Recommended first implementation:

- Swift + SwiftUI browser chrome
- `WKWebView` per live tab
- `WKNavigationDelegate` / `WKUIDelegate` for navigation and new-window routing
- private/incognito tabs using non-persistent website data stores
- Keychain for app credentials/secrets
- download/share-sheet integration through iOS APIs
- request Apple's default-browser entitlement and meet the App Review browser
  requirements before offering “set as default browser”

Apple's App Review rules generally require browser apps to use the appropriate
WebKit framework unless the app qualifies for and receives an alternative
browser-engine entitlement. BrowserEngineKit/alternative-engine paths are a
special entitlement track, not the sensible MVP dependency.

## Android

Recommended first implementation:

- Kotlin + Jetpack Compose browser chrome
- Android `WebView` instances managed as tabs
- `WebViewClient` and `WebChromeClient` for navigation/window behavior
- request the Android browser role (`ROLE_BROWSER`) with the required HTTP/HTTPS
  intent filters so users can select PArAsYtE as their default browser
- Jetpack WebKit profiles for isolated Personal/Work/Banking/Temporary browsing
  identities where supported
- Android DownloadManager/share intents for native downloads and handoff

## Mobile delivery phases

### Phase 1 - browser MVP

URL/search bar, back/forward/reload, tabs, bookmarks, downloads, dark/light/
system theme, account sign-in and basic settings.

### Phase 2 - operating-system browser integration

Default-browser role/entitlement, universal/deep link handling, share-to-browser,
password/autofill integration where permitted, and robust external-protocol
handoff.

### Phase 3 - privacy identities

Private tabs, isolated named containers, explicit per-site permissions and
session-clearing controls.

### Phase 4 - PArAsYtE platform

Encrypted sync, tab handoff, reader mode, translation, privacy controls,
crash/telemetry controls and optional AI features with explicit privacy
boundaries.

## Build requirements

- iOS: current Xcode/macOS, Apple Developer account, provisioning/signing,
  physical-device testing and App Store Connect/TestFlight.
- Android: current Android Studio/SDK, emulator + physical devices, signing
  keystore and Play Console internal testing.

The present Linux audit environment cannot compile or sign the mobile clients.
The next implementation milestone should create separate `mobile/ios` and
`mobile/android` projects and test them through their native toolchains.
