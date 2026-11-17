-- Pergamon Atlas — Pergamon Publishing v1: runtime visibility overrides
--
-- Run this once in the Supabase SQL editor (or via `supabase db push`)
-- after 0001_pergamon_profiles.sql. Safe to re-run except the table
-- creation itself, matching the convention in 0001.
--
-- Effective visibility for a page/route is:
--   override row exists for its normalized path  -> override.visibility
--   otherwise                                    -> its static atlas-meta
--                                                    visibility (baked in
--                                                    at index time, lives
--                                                    in entries.js/atlas-meta,
--                                                    never touched by this
--                                                    table)
--
-- This table stores ONLY the differences from that static baseline — see
-- operation/scripts/auth/atlas-visibility.js's setEffectiveVisibility(),
-- which deletes a row instead of writing one when the requested value
-- matches the page's static visibility, keeping this table's only rows
-- the ones that actually matter.

-- ── atlas_visibility_overrides table ────────────────────────────────────────

create table public.atlas_visibility_overrides (
  path       text primary key check (path ~ '^/'),
  visibility text not null check (visibility in ('public', 'admin')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

alter table public.atlas_visibility_overrides enable row level security;

-- ── Audit columns are server-set, never client-trusted ──────────────────────
-- Only admins can write to this table at all (RLS below), but updated_at/
-- updated_by are still stamped server-side rather than accepting whatever
-- the client sends, matching profiles.sql's protect_profile_fields pattern.

create or replace function public.set_visibility_override_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists set_visibility_override_audit_trigger on public.atlas_visibility_overrides;
create trigger set_visibility_override_audit_trigger
  before insert or update on public.atlas_visibility_overrides
  for each row execute function public.set_visibility_override_audit();

-- ── Row Level Security policies ─────────────────────────────────────────────
-- Everyone (including anon/guest) can read — Public Pergamon itself needs
-- this table to know what's been published/unpublished at runtime. Only an
-- authenticated admin (checked against profiles.role, the same trusted
-- role column protected by 0001_pergamon_profiles.sql's own RLS/grants/
-- trigger — a normal user cannot promote themselves, so this check is
-- sound) may insert/update/delete.

create policy "atlas_visibility_overrides_select_all"
  on public.atlas_visibility_overrides for select
  using (true);

create policy "atlas_visibility_overrides_admin_insert"
  on public.atlas_visibility_overrides for insert
  with check (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

create policy "atlas_visibility_overrides_admin_update"
  on public.atlas_visibility_overrides for update
  using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ))
  with check (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

create policy "atlas_visibility_overrides_admin_delete"
  on public.atlas_visibility_overrides for delete
  using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

-- ── Grants ───────────────────────────────────────────────────────────────────
-- Table-level grants are coarse; the RLS policies above are what actually
-- restrict writes to admins. anon has no write grant at all, so a guest
-- can't even reach the RLS check for insert/update/delete.

grant select on public.atlas_visibility_overrides to anon, authenticated;
grant insert, update, delete on public.atlas_visibility_overrides to authenticated;
