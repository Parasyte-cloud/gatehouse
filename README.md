# PArAsYtE Browser

A privacy-oriented browser product with two delivery targets:

- **Desktop:** the real browser client. React renders PArAsYtE's chrome while
  Electron `WebContentsView` tabs render third-party web pages as top-level
  Chromium content.
- **Hosted web:** account/bookmark/trust experience and a limited safe iframe
  fallback. A normal web application cannot replace a browser engine, so sites
  that reject framing should be opened in the desktop client or system browser.

The original repository/internal database names still use `gatehouse` to avoid
unnecessary migration risk.

## Current desktop capabilities (v0.3)

- native multi-tab browsing and new/close/switch/reopen-closed tab shortcuts
- omnibox search/URL navigation, back/forward/reload
- bookmarks and favorites
- download activity with open/show-in-folder on desktop
- Supabase email/password account auth
- account-scoped trusted-origin/session choices for the hosted fallback
- private/local literal-host blocking
- ephemeral desktop browsing session by default
- light/dark/system appearance, wallpapers, glow, window sizing and sidebar modes
- native OS window controls only (no duplicate decorative traffic lights)

See `desktop/README.md`, `AUDIT_V4_2026-09-17.md` and
`MOBILE_STRATEGY_2026-09-17.md` for architecture, audit findings and mobile
planning.

## Root web development

```bash
npm install
npm test
npm run build
npm run dev
```

Environment variables are documented in `.env.example`. Do not commit real
Supabase secrets.

## Desktop development

```bash
cd desktop
npm install
npm run dev
```

The received desktop lockfile uses an obsolete Electron 33 release. Upgrade to
a currently supported Electron line before public installer distribution; the
audit notes contain the exact migration command used for this snapshot.

## Supabase data

The app uses its own Supabase project. Core owner-scoped tables are defined in
`supabase/migrations/0001_gatehouse_init.sql`; profile/media setup is in the
follow-up migration.

Keep PArAsYtE separate from unrelated production systems so browser accounts
and sessions do not expand the blast radius of another application.

## Security boundaries

- The desktop shell and guest tabs run without Node integration.
- Guest permissions are denied by default.
- Guest tabs use an in-memory Electron session partition unless a future
  explicit persistent-container feature is chosen by the user.
- Private/local literal hosts are blocked at policy and native request layers.
- New windows are routed into controlled browser tabs.
- PArAsYtE does not strip site security headers to force embedding.

Literal-host blocking is not complete DNS-rebinding protection; see the audit
for remaining hardening work.

## Deployment

The hosted build can be deployed to Cloudflare Pages with:

- build command: `npm run build`
- output directory: `dist`
- environment: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

Desktop packages are built separately from `desktop/` with electron-builder and
must be signed/notarized before public distribution.
