# PArAsYtE Liquid Glass UI v2

This revision replaces the compact Gatehouse MVP presentation with the approved PArAsYtE Browser visual direction.

## Visual changes

- Cinematic amber/blue scene built from CSS layers (no screenshot used as the UI).
- Large liquid-glass authentication card matching the approved login concept.
- Browser-style title/tab bar, omnibox and sidebar.
- PArAsYtE home hero with logo, private search, six quick-access tiles and two glass feature cards.
- Desktop/tablet/mobile responsive behaviour.

## Security preserved

The policy engine, private-network blocking, Supabase owner-scoped data model and iframe sandbox restrictions are unchanged. The iframe still receives only `allow-forms allow-scripts`, plus `allow-same-origin` only for origins the user explicitly marks trusted.

## Verification performed here

- `npm test`: 13/13 policy tests pass.
- Modified TSX files transpile successfully with TypeScript's parser.
- A full Vite build was not run in the sandbox because dependencies are not installed and the npm registry is unavailable from this environment.
