-- Pergamon Atlas — Authentication v1: profiles + permanent Atlas addresses
--
-- Run this once in the Supabase SQL editor (or via `supabase db push`) on a
-- fresh project. Safe to re-run: uses CREATE OR REPLACE / IF NOT EXISTS
-- guards, except the table creation itself which will error if it already
-- exists (intentional — this is a first-time setup script).

-- ── Extensions ──────────────────────────────────────────────────────────────
-- pgcrypto/md5 is built into Postgres core; nothing to enable.

-- ── profiles table ───────────────────────────────────────────────────────────

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Explorer',
  role         text not null default 'user' check (role in ('user', 'admin')),
  atlas_address text not null unique,
  coord_x      integer not null,
  coord_y      integer not null,
  coord_z      integer not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (coord_x, coord_y, coord_z)
);

alter table public.profiles enable row level security;

-- ── Pergamon address codec (SQL port of data/pergamon-address.js) ───────────
-- Constants and bit-math mirror the JS implementation exactly so that
-- coordsToAddress(x, y, z) produces the identical 17-char address in both
-- the browser/build-time codec and this database function.

create or replace function public.pergamon_encode_axis(coord integer, key integer)
returns text
language plpgsql
immutable
as $$
declare
  coord_max constant integer := 16777215; -- 2^24 - 1
  alphabet  constant text    := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  offset_val integer;
  scrambled  integer;
  n          integer;
  result     text := '';
  digit      integer;
begin
  offset_val := coord + coord_max;               -- unsigned [0, 33554430]
  scrambled  := offset_val # key;                 -- XOR, stays within 25 bits
  n := scrambled;
  for i in 1..5 loop
    digit := n % 32;
    result := substr(alphabet, digit + 1, 1) || result;
    n := n / 32; -- integer division
  end loop;
  return result;
end;
$$;

create or replace function public.pergamon_coords_to_address(x integer, y integer, z integer)
returns text
language plpgsql
immutable
as $$
declare
  coord_max constant integer := 16777215;
  pc_hi     constant integer := 1346850375;  -- 0x50455247 ("PERG")
  pc_lo     constant integer := 1095954254;  -- 0x414D4F4E ("AMON")
  sx        constant integer := pc_hi & 33554431;            -- & 0x1FFFFFF
  sy        constant integer := pc_lo & 33554431;
  sz        constant integer := (pc_hi # pc_lo) & 33554431;
begin
  if x < -coord_max or x > coord_max
     or y < -coord_max or y > coord_max
     or z < -coord_max or z > coord_max then
    raise exception 'Coordinates must be in [-%, +%]', coord_max, coord_max;
  end if;
  return public.pergamon_encode_axis(x, sx) || '-' ||
         public.pergamon_encode_axis(y, sy) || '-' ||
         public.pergamon_encode_axis(z, sz);
end;
$$;

-- ── Deterministic coordinate generator for dynamic (account) entities ──────
-- Not the same algorithm as the static indexer's mulberry32 (that PRNG seeds
-- from page paths, a build-time-only concern). This generates coordinates
-- from `<uuid>:<attempt>` so retries are deterministic and reproducible for
-- the same account, while keeping the addressable space identical (same
-- COORD_MAX, same encoder above).

create or replace function public.pergamon_axis_hash(seed_input text, suffix text)
returns integer
language plpgsql
immutable
as $$
declare
  span   constant integer := 33554431; -- 2*COORD_MAX + 1
  hbytes bytea;
  h      bigint;
begin
  -- decode()/get_byte() are unambiguous core Postgres functions (unlike the
  -- 'x'||hex::bit(n) idiom) so this hex->integer conversion has no
  -- version/behavior surprises.
  hbytes := decode(substr(md5(seed_input || suffix), 1, 8), 'hex');
  h := (get_byte(hbytes, 0)::bigint << 24)
     | (get_byte(hbytes, 1)::bigint << 16)
     | (get_byte(hbytes, 2)::bigint << 8)
     |  get_byte(hbytes, 3)::bigint;
  return (h % span);
end;
$$;

create or replace function public.pergamon_generate_user_coords(seed_input text)
returns table (x integer, y integer, z integer)
language plpgsql
immutable
as $$
declare
  coord_max constant integer := 16777215;
begin
  x := public.pergamon_axis_hash(seed_input, ':x') - coord_max;
  y := public.pergamon_axis_hash(seed_input, ':y') - coord_max;
  z := public.pergamon_axis_hash(seed_input, ':z') - coord_max;
  return next;
end;
$$;

-- ── New-account provisioning trigger ────────────────────────────────────────
-- Runs SECURITY DEFINER so it can insert into public.profiles regardless of
-- RLS. This is the ONLY path that ever writes atlas_address/coord_*/role —
-- client code never can. Role is always hard-coded to 'user'; any
-- client-supplied metadata (including an attempted "role" key) is ignored
-- except for an optional display_name.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  attempt       integer := 0;
  max_attempts  constant integer := 50;
  gen_coords    record;
  gen_address   text;
  chosen_name   text;
begin
  chosen_name := coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), 'Explorer');

  loop
    select * into gen_coords
      from public.pergamon_generate_user_coords(new.id::text || ':' || attempt::text);

    gen_address := public.pergamon_coords_to_address(gen_coords.x, gen_coords.y, gen_coords.z);

    begin
      insert into public.profiles (id, display_name, role, atlas_address, coord_x, coord_y, coord_z)
      values (new.id, chosen_name, 'user', gen_address, gen_coords.x, gen_coords.y, gen_coords.z);
      exit; -- success
    exception
      when unique_violation then
        attempt := attempt + 1;
        if attempt >= max_attempts then
          raise exception 'Could not allocate a unique Atlas address for user % after % attempts', new.id, max_attempts;
        end if;
        -- loop again with next attempt
    end;
  end loop;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Protect immutable / privileged fields ───────────────────────────────────
-- Defense-in-depth behind the column grants below: even if a future policy
-- or role change accidentally allows a broader UPDATE, this trigger silently
-- reverts role/atlas_address/coord_* to their existing values unless the
-- caller is the service_role (trusted backend/admin context).

create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    new.role          := old.role;
    new.atlas_address := old.atlas_address;
    new.coord_x       := old.coord_x;
    new.coord_y       := old.coord_y;
    new.coord_z       := old.coord_z;
    new.id            := old.id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists protect_profile_fields_trigger on public.profiles;
create trigger protect_profile_fields_trigger
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- ── Row Level Security policies ─────────────────────────────────────────────
-- Owner can read and update their own row. No INSERT or DELETE policy for
-- client roles at all — profiles are only ever created by the trigger above.

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ── Column-level grants ──────────────────────────────────────────────────────
-- Even with the update policy above, restrict which columns the
-- `authenticated` role may write. role / atlas_address / coord_* are
-- deliberately never granted, so any client UPDATE naming them fails
-- outright at the privilege-check level (the trigger above is the backstop).

grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

-- ── Manual admin promotion (reference only — do not run automatically) ─────
-- update public.profiles set role = 'admin' where id = '<supabase-auth-user-uuid>';
