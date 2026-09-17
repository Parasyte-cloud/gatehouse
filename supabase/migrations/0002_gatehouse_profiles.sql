-- Gatehouse profile & appearance schema.
--
-- Adds account-level profile data (display name, avatar) and wallpaper
-- selection - the account-level counterpart to the device-local "browser
-- size" / "outer glow" settings, which deliberately stay in localStorage
-- (see src/lib/appearance.ts) rather than here, since chrome density and
-- glow intensity are about the window you're looking at right now, not
-- something that should silently follow you to a different machine.
--
-- One row per user, RLS-scoped to auth.uid() exactly like 0001's tables.
-- Requires a "gatehouse-media" Storage bucket (created below) for avatar
-- and wallpaper image uploads, one folder per user (path prefix = user_id),
-- enforced by the storage.objects policies below.

create table if not exists gatehouse_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  wallpaper_id text,
  wallpaper_url text,
  updated_at timestamptz not null default now()
);

alter table gatehouse_profiles enable row level security;

create policy "select own profile" on gatehouse_profiles
  for select using (auth.uid() = user_id);
create policy "insert own profile" on gatehouse_profiles
  for insert with check (auth.uid() = user_id);
create policy "update own profile" on gatehouse_profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own profile" on gatehouse_profiles
  for delete using (auth.uid() = user_id);

-- Keep updated_at honest without relying on every call site to set it.
create or replace function gatehouse_touch_profile_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists gatehouse_profiles_touch_updated_at on gatehouse_profiles;
create trigger gatehouse_profiles_touch_updated_at
  before update on gatehouse_profiles
  for each row execute function gatehouse_touch_profile_updated_at();

-- Public-read bucket (avatars/wallpapers are meant to render via a plain
-- <img src>, no signed URLs) but write-scoped per user via the folder-name
-- policies below. If this insert fails because the bucket already exists
-- under different settings, create/adjust it once by hand in the Supabase
-- dashboard (Storage > Buckets) instead of re-running this migration.
insert into storage.buckets (id, name, public)
values ('gatehouse-media', 'gatehouse-media', true)
on conflict (id) do nothing;

create policy "gatehouse media public read"
  on storage.objects for select
  using (bucket_id = 'gatehouse-media');

create policy "gatehouse media own insert"
  on storage.objects for insert
  with check (
    bucket_id = 'gatehouse-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "gatehouse media own update"
  on storage.objects for update
  using (
    bucket_id = 'gatehouse-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "gatehouse media own delete"
  on storage.objects for delete
  using (
    bucket_id = 'gatehouse-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
