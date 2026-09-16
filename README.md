# Gatehouse

Open what you trust. Everything else waits at the door.

Gatehouse is a standalone product, spun out of the hardening work done on
RideArrivo's PArAsYtE Browser. Same core idea (deny-by-default iframe
embedding, everything unapproved opens in its own tab, private-network
destinations blocked including IPv4-in-IPv6 encodings) but built for outside
users with their own accounts, not one company's intranet:

- Every user has their own saved sites and their own trusted-origins list.
  There's no shared admin-curated list - trust is per-user data, checked at
  runtime, not a build-time env var. One user trusting an origin never makes
  it embeddable for anyone else.
- Auth is open sign-up (email + password via Supabase Auth), not gated to a
  single email domain.
- `src/lib/policy.ts` is the same tested policy engine (13/13 tests), just
  with the RideArrivo-specific naming stripped out.

## Why a separate Supabase project

This must run on its own Supabase project, never RA-workspace's. RA-workspace
holds RideArrivo's real internal data (HR records, KYC documents, payments,
support cases). Mixing a public product's auth/session surface into that
project would put unrelated blast radius on both sides. Two tables, both
owner-scoped by RLS - see `supabase/migrations/0001_gatehouse_init.sql`:

- `gatehouse_sites` - each user's saved sites (replaces the old "managed
  links + bookmarks" split with one list; `is_favorite` just pins something
  to the top of the home screen)
- `gatehouse_trusted_origins` - each user's personal embed-allowlist

## Deploying

1. **Create a new Supabase project** (supabase.com/dashboard, or `supabase
   projects create` from a terminal that's actually logged in - the CLI
   config exists on this Mac but wasn't reachable from the sandboxed shell
   used to build this). Note the project URL and anon key.
2. Run the migration: paste `supabase/migrations/0001_gatehouse_init.sql`
   into the SQL editor, or `supabase db push` if you link the CLI to the new
   project.
3. In Supabase Auth settings, decide whether to require email confirmation
   for sign-up (recommended: on, so `signUp` results in "check your email"
   rather than an instant session).
4. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` /
   `VITE_SUPABASE_ANON_KEY` from step 1.
5. `npm install && npm run dev` to test locally.
6. Deploy: create a **new** Cloudflare Pages project for this repo (don't
   reuse the `ra-workspace` Pages project - this is a different app with a
   different build). Set the same two env vars in the Pages project's
   environment variables. Build command `npm run build`, output directory
   `dist`.
7. Add the custom domain in that Pages project: `gatehouse.parasyte.cloud`.
   Since `parasyte.cloud`'s DNS is already in Cloudflare, this is just
   adding the custom domain in the Pages project settings and accepting the
   CNAME record it proposes - no manual DNS record needed if the zone is on
   Cloudflare and Pages manages it for you.

## Verified before delivery

- `npm test` (the policy engine's own test suite): 13/13 pass, including the
  IPv4-in-IPv6 private-network bypass regression tests.
- `npx tsc -b`: clean, zero errors, strict mode with `noUnusedLocals`/
  `noUnusedParameters`.
- `npx vite build`: succeeds, produces a working production bundle.

Not yet done, intentionally left for you: actually creating the Supabase
project and Cloudflare Pages project (needs your accounts), and any product
polish beyond the MVP (password reset flow, email templates, a real logo -
this ships with text-only branding on purpose since it's still the
"getting people used to it" phase under the parasyte.cloud subdomain).
