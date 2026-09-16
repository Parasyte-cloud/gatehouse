-- Gatehouse initial schema.
--
-- Deliberately isolated in its own Supabase project - do not run this
-- against the RA-workspace project. Gatehouse is a standalone product for
-- outside users; its auth/session surface and data must not share
-- infrastructure with RideArrivo's internal workspace data.
--
-- Two tables, both owner-scoped via RLS keyed on auth.uid(). There is no
-- separate "managed links" concept here: unlike the single-tenant RideArrivo
-- build (one company, one admin-curated list for everyone), every Gatehouse
-- user curates their own list. is_favorite just pins a site to the top of
-- the home screen - it isn't a different table.

create extension if not exists pgcrypto;

create table if not exists gatehouse_sites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  url text not null,
  category text,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists gatehouse_sites_user_url_key
  on gatehouse_sites(user_id, url);

alter table gatehouse_sites enable row level security;

create policy "select own sites" on gatehouse_sites
  for select using (auth.uid() = user_id);
create policy "insert own sites" on gatehouse_sites
  for insert with check (auth.uid() = user_id);
create policy "update own sites" on gatehouse_sites
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own sites" on gatehouse_sites
  for delete using (auth.uid() = user_id);

-- Per-user embed-trust list. This is the runtime replacement for the
-- single-tenant build's VITE_PARASYTE_EMBED_ORIGINS env var: trusting an
-- origin here only ever affects the user who trusted it.
create table if not exists gatehouse_trusted_origins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  origin text not null check (origin ~ '^https?://[^/]+$'),
  allow_same_origin boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists gatehouse_trusted_origins_user_origin_key
  on gatehouse_trusted_origins(user_id, origin);

alter table gatehouse_trusted_origins enable row level security;

create policy "select own trusted origins" on gatehouse_trusted_origins
  for select using (auth.uid() = user_id);
create policy "insert own trusted origins" on gatehouse_trusted_origins
  for insert with check (auth.uid() = user_id);
create policy "update own trusted origins" on gatehouse_trusted_origins
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own trusted origins" on gatehouse_trusted_origins
  for delete using (auth.uid() = user_id);
