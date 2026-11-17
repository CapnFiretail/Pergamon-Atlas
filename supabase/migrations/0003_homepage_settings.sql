-- Pergamon Atlas — Homepage customization v1: homepage_settings
--
-- Run this once in the Supabase SQL editor (or via `supabase db push`)
-- after 0002_atlas_visibility_overrides.sql. Safe to re-run except the
-- table creation itself, matching the convention in 0001/0002.
--
-- Scope of this table (deliberately small — see the phase plan):
--   hero_image_path  — object path in the 'homepage' Storage bucket
--                      (see 0004_homepage_storage.sql). NOT a URL, NOT
--                      base64. The public URL is derived at render time.
--   featured_path    — the normalized Atlas path of the artifact shown in
--                      "Featured Today" (e.g. '/games/chess-forge'). Title,
--                      description, card image and destination are resolved
--                      from that artifact's canonical metadata in
--                      entries.js — never duplicated here.
--   published        — which homepage the PUBLIC receives. false → the
--                      classic .public-hero; true → the configurable
--                      homepage. This is the homepage's entire publication
--                      model. '/' itself stays permanently visibility:
--                      "public" in entries.js and is never given a row in
--                      atlas_visibility_overrides — Home is always in
--                      navigation/search and '/' is always reachable.
--
-- Editing (hero_image_path / featured_path) and publishing (published) are
-- independent: the client sends disjoint column sets, and saving content
-- while unpublished changes nothing the public can see (the RLS SELECT
-- policy below hides the row from anon until published).

-- ── homepage_settings table (single row) ────────────────────────────────────
-- `id boolean primary key default true check (id)` is the one-row guard:
-- the only value that satisfies the CHECK is true, and it's the primary
-- key, so a second row is impossible.

create table public.homepage_settings (
  id              boolean primary key default true check (id),
  hero_image_path text,
  featured_path   text,
  published       boolean     not null default false,
  published_at    timestamptz,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users (id)
);

alter table public.homepage_settings enable row level security;

-- Seed the single row now so the client only ever UPDATEs it.
insert into public.homepage_settings (id) values (true)
on conflict (id) do nothing;

-- ── Audit + published_at are server-set, never client-trusted ───────────────
-- Mirrors set_visibility_override_audit() from 0002. published_at is
-- stamped only on the false → true transition so it records first
-- publication; toggling back and forth doesn't churn it.

create or replace function public.set_homepage_settings_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if new.published and not coalesce(old.published, false) then
    new.published_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists set_homepage_settings_audit_trigger on public.homepage_settings;
create trigger set_homepage_settings_audit_trigger
  before insert or update on public.homepage_settings
  for each row execute function public.set_homepage_settings_audit();

-- ── Row Level Security ─────────────────────────────────────────────────────
-- SELECT: the public may read the row ONLY while the homepage is published
-- (that's exactly the config needed to render the published homepage). An
-- authenticated admin can always read it, published or not, so the Admin
-- View editor works on the draft. The policy is self-referential on the
-- single row — no cross-table dependency.
--
-- INSERT/UPDATE: authenticated admin only, checked against profiles.role
-- (the trusted, self-promotion-proof column from 0001). Same pattern as
-- atlas_visibility_overrides in 0002. No DELETE policy — the row is
-- permanent and only ever updated.

create policy "homepage_settings_select_public_or_admin"
  on public.homepage_settings for select
  using (
    published = true
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "homepage_settings_admin_insert"
  on public.homepage_settings for insert
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ));

create policy "homepage_settings_admin_update"
  on public.homepage_settings for update
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ));

-- ── Grants ────────────────────────────────────────────────────────────────
-- Coarse table grants; the RLS policies above are the real restriction.
-- anon has no write grant at all, so a guest can't even reach the RLS
-- check for insert/update.

grant select on public.homepage_settings to anon, authenticated;
grant insert, update on public.homepage_settings to authenticated;

-- ── One-time cleanup ──────────────────────────────────────────────────────
-- '/' no longer participates in the per-path visibility system. If a stray
-- override row was ever written for it (e.g. during earlier testing),
-- remove it so effective visibility of '/' is always its static "public".

delete from public.atlas_visibility_overrides where path = '/';
