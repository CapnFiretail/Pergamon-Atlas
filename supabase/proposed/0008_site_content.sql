-- PROPOSED — NOT APPLIED. Review before moving into supabase/migrations/.
--
-- Pergamon Atlas — CMS v1: versioned site content
--
-- Requires 0001_pergamon_profiles.sql (profiles.role). Apply together with
-- 0009_site_media.sql (the content functions read public.site_media at run
-- time). Additive only: no existing table, policy, trigger or grant is
-- changed.
--
-- Model
--   site_content_versions is append-only history. Each row is one complete
--   content document for one page:
--     draft       the page's current working draft (at most one per page)
--     superseded  an older draft, replaced by a later save or consumed by a
--                 publish (kept as revision history)
--     published   the live version (at most one per page)
--     archived    a previously published version (rollback target)
--   Content is never edited in place: saving a draft inserts a new row and
--   marks the previous draft superseded; publishing inserts a new published
--   row and archives the old one; rollback publishes a copy of an archived
--   row. The only UPDATEs ever allowed are those status transitions, made by
--   the functions below inside their own transaction.
--
-- Access
--   Browsers never touch the tables. anon/authenticated have no table
--   privileges and RLS has no policies, so direct REST access returns
--   nothing / is denied. All reads and writes go through the SECURITY
--   DEFINER functions at the bottom, each of which checks is_admin() itself
--   (except get_published_content, which only ever returns published data).
--   Errors use PostgREST's PTnnn SQLSTATEs so the HTTP status is meaningful:
--   PT403 forbidden, PT404 not found, PT409 conflict, PT422 invalid content.

-- ── Admin check ────────────────────────────────────────────────────────────
-- The single server-side definition of "administrator", used by every
-- policy and function in 0008/0009. Reads the trusted profiles.role column
-- (self-promotion-proof: see 0001's column grants and protect_profile_fields
-- trigger). Never reads JWT metadata the user can influence.
-- MFA later: add `and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'`.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.role = 'admin' from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

revoke all on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;

-- ── Pages ──────────────────────────────────────────────────────────────────
-- Which pages the CMS manages, and which content schema each uses. Seeded
-- here; only migrations (or the service role) change it.

create table public.site_pages (
  page            text primary key check (page ~ '^[a-z][a-z0-9-]{0,31}$'),
  schema_version  integer not null check (schema_version > 0)
);

alter table public.site_pages enable row level security;
revoke all on public.site_pages from anon, authenticated;

insert into public.site_pages (page, schema_version) values ('home', 1)
on conflict (page) do nothing;

-- ── Destination allowlist ──────────────────────────────────────────────────
-- Every link a content document may point at. Internal paths only, with a
-- trailing slash, matching the site's real routes. Changed only by
-- migrations, so an admin can't add an external or javascript: URL.

create table public.site_content_routes (
  path   text primary key check (path ~ '^/[a-z0-9-]+(/[a-z0-9-]+)*/$'),
  label  text not null
);

alter table public.site_content_routes enable row level security;
revoke all on public.site_content_routes from anon, authenticated;

insert into public.site_content_routes (path, label) values
  ('/games/', 'Games'),
  ('/games/battleship/', 'Battleship'),
  ('/games/blackjack/', 'Blackjack'),
  ('/games/breakout/', 'Breakout'),
  ('/games/chess-forge/', 'Chess Forge'),
  ('/games/connect-four/', 'Connect Four'),
  ('/games/pong/', 'Pong'),
  ('/games/snake/', 'Snake'),
  ('/games/tic-tac-toe/', 'Tic Tac Toe')
on conflict (path) do nothing;

-- ── Versions ───────────────────────────────────────────────────────────────

create table public.site_content_versions (
  id                    bigint generated always as identity primary key,
  page                  text not null references public.site_pages (page),
  schema_version        integer not null,
  content               jsonb not null,
  status                text not null check (status in ('draft', 'superseded', 'published', 'archived')),
  previous_version_id   bigint references public.site_content_versions (id),
  based_on_published_id bigint references public.site_content_versions (id),
  source_version_id     bigint references public.site_content_versions (id),
  note                  text check (note is null or char_length(note) <= 280),
  created_by            uuid not null references auth.users (id),
  created_at            timestamptz not null default now(),
  published_by          uuid references auth.users (id),
  published_at          timestamptz,
  check ((status in ('published', 'archived')) = (published_at is not null and published_by is not null))
);

-- One current draft and one live version per page.
create unique index site_content_one_draft on public.site_content_versions (page) where status = 'draft';
create unique index site_content_one_published on public.site_content_versions (page) where status = 'published';
create index site_content_history on public.site_content_versions (page, id desc);

alter table public.site_content_versions enable row level security;
revoke all on public.site_content_versions from anon, authenticated;

-- Immutability. Content and attribution never change; status may only move
-- draft -> superseded or published -> archived, and only from inside the
-- functions below (which set pergamon.content_write for their transaction).
-- Rows are never deleted.

create or replace function public.site_content_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'site_content_versions rows are permanent' using errcode = 'PT403';
  end if;
  if coalesce(current_setting('pergamon.content_write', true), '') <> 'on' then
    raise exception 'site_content_versions can only change through the content functions' using errcode = 'PT403';
  end if;
  if new.id <> old.id or new.page <> old.page or new.content <> old.content
     or new.schema_version <> old.schema_version or new.created_by <> old.created_by
     or new.created_at <> old.created_at
     or new.previous_version_id is distinct from old.previous_version_id
     or new.based_on_published_id is distinct from old.based_on_published_id
     or new.source_version_id is distinct from old.source_version_id
     or new.note is distinct from old.note
     or new.published_by is distinct from old.published_by
     or new.published_at is distinct from old.published_at then
    raise exception 'site_content_versions content and attribution are immutable' using errcode = 'PT403';
  end if;
  if not ((old.status = 'draft' and new.status = 'superseded')
       or (old.status = 'published' and new.status = 'archived')) then
    raise exception 'invalid status change % -> %', old.status, new.status using errcode = 'PT403';
  end if;
  return new;
end;
$$;

create trigger site_content_guard_update
  before update or delete on public.site_content_versions
  for each row execute function public.site_content_guard();

-- ── Validation ─────────────────────────────────────────────────────────────
-- Schema v1 for page 'home' (see docs/cms/ARCHITECTURE.md for the full
-- document format). Raises PT422 with a path-qualified message on the first
-- problem. Allowlists only: unknown keys anywhere are rejected.
--
-- {
--   "schema": 1,
--   "components": {
--     "home.featured":   Card,
--     "home.spotlight":  Card,
--     "home.carousel":   { "order": ["<id>", ...] },
--     "home.carousel.<id>": { "title", "category", "href", "art"? }
--   }
-- }
-- Card = { "title", "cta", "href", "art"?, "style"?: { "rules": bool } }
-- Art  = { "source": { "media": uuid } | { "static": "/images/featured/x.webp" },
--          "alt"?, "fit"?: "cover" | "height",
--          "focus"?: Point, "focusNarrow"?: Point,
--          "scale"?, "scaleNarrow"?: 0.5–3,
--          "anchor"?: Anchor, "anchorNarrow"?: Anchor,
--          "base"?: "#rrggbb" }
-- Point  = { "x": 0–100, "y": 0–100 }               (percent)
-- Anchor = { "x": 0–100, "offset": -600–600, "y": 0–100 }  (percent, px, percent)
-- Numbers are numbers, never CSS strings; the renderer builds the CSS.

create or replace function public.cms_check_keys(obj jsonb, allowed text[], required text[], at text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare k text;
begin
  if obj is null or jsonb_typeof(obj) <> 'object' then
    raise exception '%: must be an object', at using errcode = 'PT422';
  end if;
  for k in select jsonb_object_keys(obj) loop
    if not (k = any (allowed)) then
      raise exception '%: unsupported field "%"', at, k using errcode = 'PT422';
    end if;
  end loop;
  foreach k in array required loop
    if not (obj ? k) then
      raise exception '%: missing field "%"', at, k using errcode = 'PT422';
    end if;
  end loop;
end;
$$;

-- Plain text only: no markup characters, no control characters, no
-- bidirectional overrides, trimmed, length-limited.
create or replace function public.cms_check_text(val jsonb, min_len integer, max_len integer, at text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare s text;
begin
  if val is null or jsonb_typeof(val) <> 'string' then
    raise exception '%: must be text', at using errcode = 'PT422';
  end if;
  s := val #>> '{}';
  if char_length(s) < min_len or char_length(s) > max_len then
    raise exception '%: must be % to % characters', at, min_len, max_len using errcode = 'PT422';
  end if;
  if s <> btrim(s) then
    raise exception '%: remove leading or trailing spaces', at using errcode = 'PT422';
  end if;
  if s ~ '[<>]' or s ~ '[\x00-\x1f\x7f]' or s ~ '[‪-‮⁦-⁩]' then
    raise exception '%: contains characters that are not allowed', at using errcode = 'PT422';
  end if;
end;
$$;

create or replace function public.cms_check_number(val jsonb, lo numeric, hi numeric, at text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if val is null or jsonb_typeof(val) <> 'number' then
    raise exception '%: must be a number', at using errcode = 'PT422';
  end if;
  if (val #>> '{}')::numeric < lo or (val #>> '{}')::numeric > hi then
    raise exception '%: must be between % and %', at, lo, hi using errcode = 'PT422';
  end if;
end;
$$;

create or replace function public.cms_check_point(val jsonb, at text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  perform public.cms_check_keys(val, array['x', 'y'], array['x', 'y'], at);
  perform public.cms_check_number(val -> 'x', 0, 100, at || '.x');
  perform public.cms_check_number(val -> 'y', 0, 100, at || '.y');
end;
$$;

create or replace function public.cms_check_anchor(val jsonb, at text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  perform public.cms_check_keys(val, array['x', 'offset', 'y'], array['x'], at);
  perform public.cms_check_number(val -> 'x', 0, 100, at || '.x');
  if val ? 'offset' then perform public.cms_check_number(val -> 'offset', -600, 600, at || '.offset'); end if;
  if val ? 'y' then perform public.cms_check_number(val -> 'y', 0, 100, at || '.y'); end if;
end;
$$;

-- Destinations come from site_content_routes only. Not immutable (reads a
-- table), so validate_content is stable.
create or replace function public.cms_check_href(val jsonb, at text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if val is null or jsonb_typeof(val) <> 'string' then
    raise exception '%: must be a site path', at using errcode = 'PT422';
  end if;
  if not exists (select 1 from public.site_content_routes r where r.path = val #>> '{}') then
    raise exception '%: "%" is not an allowed destination', at, left(val #>> '{}', 80) using errcode = 'PT422';
  end if;
end;
$$;

create or replace function public.cms_check_art(val jsonb, at text, media inout uuid[])
returns uuid[]
language plpgsql
stable
set search_path = ''
as $$
declare src jsonb; m text; s text;
begin
  perform public.cms_check_keys(val,
    array['source', 'alt', 'fit', 'focus', 'focusNarrow', 'scale', 'scaleNarrow', 'anchor', 'anchorNarrow', 'base'],
    array['source'], at);
  src := val -> 'source';
  perform public.cms_check_keys(src, array['media', 'static'], array[]::text[], at || '.source');
  if (src ? 'media') = (src ? 'static') then
    raise exception '%.source: give exactly one of "media" or "static"', at using errcode = 'PT422';
  end if;
  if src ? 'media' then
    m := src ->> 'media';
    if jsonb_typeof(src -> 'media') <> 'string'
       or m !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception '%.source.media: must be a media id', at using errcode = 'PT422';
    end if;
    media := array_append(media, m::uuid);
  else
    s := src ->> 'static';
    if jsonb_typeof(src -> 'static') <> 'string'
       or s !~ '^/images/featured/[a-z0-9][a-z0-9-]{0,63}\.(webp|png|jpg)$' then
      raise exception '%.source.static: must be a /images/featured/ image', at using errcode = 'PT422';
    end if;
  end if;
  if val ? 'alt' then perform public.cms_check_text(val -> 'alt', 0, 140, at || '.alt'); end if;
  if val ? 'fit' and (jsonb_typeof(val -> 'fit') <> 'string' or val ->> 'fit' not in ('cover', 'height')) then
    raise exception '%.fit: must be "cover" or "height"', at using errcode = 'PT422';
  end if;
  if val ? 'focus' then perform public.cms_check_point(val -> 'focus', at || '.focus'); end if;
  if val ? 'focusNarrow' then perform public.cms_check_point(val -> 'focusNarrow', at || '.focusNarrow'); end if;
  if val ? 'scale' then perform public.cms_check_number(val -> 'scale', 0.5, 3, at || '.scale'); end if;
  if val ? 'scaleNarrow' then perform public.cms_check_number(val -> 'scaleNarrow', 0.5, 3, at || '.scaleNarrow'); end if;
  if val ? 'anchor' then perform public.cms_check_anchor(val -> 'anchor', at || '.anchor'); end if;
  if val ? 'anchorNarrow' then perform public.cms_check_anchor(val -> 'anchorNarrow', at || '.anchorNarrow'); end if;
  if val ? 'base' and (jsonb_typeof(val -> 'base') <> 'string' or val ->> 'base' !~ '^#[0-9a-fA-F]{6}$') then
    raise exception '%.base: must be a #rrggbb colour', at using errcode = 'PT422';
  end if;
end;
$$;

-- Validates a complete document and returns the media ids it references
-- (for publish to check). Raises PT422 on the first problem.
create or replace function public.validate_content(p_page text, doc jsonb)
returns uuid[]
language plpgsql
stable
set search_path = ''
as $$
declare
  media uuid[] := array[]::uuid[];
  comps jsonb;
  k text;
  card text;
  item_id text;
  ord jsonb;
  ids text[] := array[]::text[];
  item jsonb;
begin
  if p_page <> 'home' then
    raise exception 'no content schema for page "%"', p_page using errcode = 'PT422';
  end if;
  perform public.cms_check_keys(doc, array['schema', 'components'], array['schema', 'components'], 'document');
  if jsonb_typeof(doc -> 'schema') <> 'number' or (doc ->> 'schema') <> '1' then
    raise exception 'document.schema: must be 1' using errcode = 'PT422';
  end if;
  comps := doc -> 'components';
  if jsonb_typeof(comps) <> 'object' then
    raise exception 'document.components: must be an object' using errcode = 'PT422';
  end if;
  if pg_column_size(doc) > 262144 then
    raise exception 'document: larger than 256 KB' using errcode = 'PT422';
  end if;

  -- Component ids: the two cards, the carousel order, and one entry per card.
  for k in select jsonb_object_keys(comps) loop
    if k not in ('home.featured', 'home.spotlight', 'home.carousel')
       and k !~ '^home\.carousel\.[a-z0-9][a-z0-9-]{0,39}$' then
      raise exception 'components: unsupported component "%"', left(k, 60) using errcode = 'PT422';
    end if;
  end loop;

  foreach card in array array['home.featured', 'home.spotlight'] loop
    if not (comps ? card) then
      raise exception 'components: missing "%"', card using errcode = 'PT422';
    end if;
    perform public.cms_check_keys(comps -> card, array['title', 'cta', 'href', 'art', 'style'], array['title', 'cta', 'href'], card);
    perform public.cms_check_text(comps -> card -> 'title', 1, 60, card || '.title');
    perform public.cms_check_text(comps -> card -> 'cta', 1, 24, card || '.cta');
    perform public.cms_check_href(comps -> card -> 'href', card || '.href');
    if (comps -> card) ? 'art' then
      media := public.cms_check_art(comps -> card -> 'art', card || '.art', media);
    end if;
    if (comps -> card) ? 'style' then
      perform public.cms_check_keys(comps -> card -> 'style', array['rules'], array[]::text[], card || '.style');
      if (comps -> card -> 'style') ? 'rules' and jsonb_typeof(comps -> card -> 'style' -> 'rules') <> 'boolean' then
        raise exception '%.style.rules: must be true or false', card using errcode = 'PT422';
      end if;
    end if;
  end loop;

  if not (comps ? 'home.carousel') then
    raise exception 'components: missing "home.carousel"' using errcode = 'PT422';
  end if;
  perform public.cms_check_keys(comps -> 'home.carousel', array['order'], array['order'], 'home.carousel');
  ord := comps -> 'home.carousel' -> 'order';
  if jsonb_typeof(ord) <> 'array' or jsonb_array_length(ord) > 24 then
    raise exception 'home.carousel.order: must be a list of up to 24 card ids' using errcode = 'PT422';
  end if;
  for item in select value from jsonb_array_elements(ord) loop
    if jsonb_typeof(item) <> 'string' or (item #>> '{}') !~ '^[a-z0-9][a-z0-9-]{0,39}$' then
      raise exception 'home.carousel.order: invalid card id' using errcode = 'PT422';
    end if;
    if (item #>> '{}') = any (ids) then
      raise exception 'home.carousel.order: "%" is listed twice', item #>> '{}' using errcode = 'PT422';
    end if;
    ids := array_append(ids, item #>> '{}');
    if not (comps ? ('home.carousel.' || (item #>> '{}'))) then
      raise exception 'home.carousel.order: no component for "%"', item #>> '{}' using errcode = 'PT422';
    end if;
  end loop;

  for k in select jsonb_object_keys(comps) loop
    continue when k !~ '^home\.carousel\.';
    item_id := substr(k, length('home.carousel.') + 1);
    if not (item_id = any (ids)) then
      raise exception '%: not listed in home.carousel.order', k using errcode = 'PT422';
    end if;
    perform public.cms_check_keys(comps -> k, array['title', 'category', 'href', 'art'], array['title', 'category', 'href'], k);
    perform public.cms_check_text(comps -> k -> 'title', 1, 40, k || '.title');
    if jsonb_typeof(comps -> k -> 'category') <> 'string'
       or (comps -> k ->> 'category') not in ('Strategy', 'Arcade', 'Classic', 'Card') then
      raise exception '%.category: must be Strategy, Arcade, Classic or Card', k using errcode = 'PT422';
    end if;
    perform public.cms_check_href(comps -> k -> 'href', k || '.href');
    if (comps -> k) ? 'art' and jsonb_typeof(comps -> k -> 'art') <> 'null' then
      media := public.cms_check_art(comps -> k -> 'art', k || '.art', media);
    end if;
  end loop;

  return (select coalesce(array_agg(distinct x), array[]::uuid[]) from unnest(media) x);
end;
$$;

revoke all on function public.cms_check_keys(jsonb, text[], text[], text) from public, anon, authenticated;
revoke all on function public.cms_check_text(jsonb, integer, integer, text) from public, anon, authenticated;
revoke all on function public.cms_check_number(jsonb, numeric, numeric, text) from public, anon, authenticated;
revoke all on function public.cms_check_point(jsonb, text) from public, anon, authenticated;
revoke all on function public.cms_check_anchor(jsonb, text) from public, anon, authenticated;
revoke all on function public.cms_check_href(jsonb, text) from public, anon, authenticated;
revoke all on function public.cms_check_art(jsonb, text, uuid[]) from public, anon, authenticated;
revoke all on function public.validate_content(text, jsonb) from public, anon, authenticated;

-- ── Content functions ──────────────────────────────────────────────────────
-- SECURITY DEFINER, empty search_path, fully qualified names. Each takes a
-- per-page transaction advisory lock so saves, publishes and rollbacks on
-- the same page are serialised.

create or replace function public.cms_require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'administrator access required' using errcode = 'PT403';
  end if;
  return auth.uid();
end;
$$;

revoke all on function public.cms_require_admin() from public, anon, authenticated;

create or replace function public.cms_lock_page(p_page text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.site_pages where page = p_page) then
    raise exception 'unknown page "%"', left(p_page, 40) using errcode = 'PT404';
  end if;
  perform pg_advisory_xact_lock(hashtext('pergamon.site_content:' || p_page));
  perform set_config('pergamon.content_write', 'on', true);
end;
$$;

revoke all on function public.cms_lock_page(text) from public, anon, authenticated;

-- Public: the live document only, plus public paths of the media it uses.
-- No account ids, no draft information.
-- (plpgsql rather than sql so 0008 can be created before 0009's site_media.)
create or replace function public.get_published_content(p_page text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return (
    select jsonb_build_object(
      'page', v.page,
      'version', v.id,
      'schema', v.schema_version,
      'published_at', v.published_at,
      'content', v.content,
      'media', coalesce((
        select jsonb_object_agg(m.id, jsonb_build_object('path', m.public_path, 'width', m.width, 'height', m.height))
        from public.site_media m
        where m.public_path is not null
          and m.id in (select (e ->> 'media')::uuid
                       from jsonb_path_query(v.content, 'lax $.**.source') e
                       where jsonb_typeof(e) = 'object' and e ? 'media')
      ), '{}'::jsonb)
    )
    from public.site_content_versions v
    where v.page = p_page and v.status = 'published'
  );
end;
$$;

-- Admin: the current draft (or null) and the live version id it would replace.
create or replace function public.get_draft(p_page text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare d public.site_content_versions; pub public.site_content_versions;
begin
  perform public.cms_require_admin();
  select * into d from public.site_content_versions where page = p_page and status = 'draft';
  select * into pub from public.site_content_versions where page = p_page and status = 'published';
  return jsonb_build_object(
    'page', p_page,
    'draft', case when d.id is null then null else jsonb_build_object(
      'id', d.id, 'schema', d.schema_version, 'content', d.content,
      'based_on_published_id', d.based_on_published_id, 'note', d.note,
      'created_by', d.created_by, 'created_at', d.created_at) end,
    'published', case when pub.id is null then null else jsonb_build_object(
      'id', pub.id, 'content', pub.content, 'published_at', pub.published_at, 'published_by', pub.published_by) end
  );
end;
$$;

-- Admin: save a new draft revision. p_expected_draft_id is the draft id the
-- editor loaded (null if it started from the published version); if another
-- admin has saved since, PT409 and nothing is written.
create or replace function public.save_draft(p_page text, p_content jsonb, p_expected_draft_id bigint, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.cms_require_admin();
  cur public.site_content_versions;
  pub_id bigint;
  new_id bigint;
  sv integer;
begin
  perform public.cms_lock_page(p_page);
  perform public.validate_content(p_page, p_content);
  select schema_version into sv from public.site_pages where page = p_page;
  select * into cur from public.site_content_versions where page = p_page and status = 'draft';
  if cur.id is distinct from p_expected_draft_id then
    raise exception 'the draft was changed by someone else (current %, expected %)', cur.id, p_expected_draft_id
      using errcode = 'PT409';
  end if;
  select id into pub_id from public.site_content_versions where page = p_page and status = 'published';
  if cur.id is not null then
    update public.site_content_versions set status = 'superseded' where id = cur.id;
  end if;
  insert into public.site_content_versions
    (page, schema_version, content, status, previous_version_id, based_on_published_id, note, created_by)
  values
    (p_page, sv, p_content, 'draft', cur.id, coalesce(cur.based_on_published_id, pub_id), nullif(btrim(p_note), ''), me)
  returning id into new_id;
  return jsonb_build_object('page', p_page, 'draft_id', new_id, 'previous_draft_id', cur.id);
end;
$$;

-- Admin: discard the current draft (it stays in history as superseded).
create or replace function public.discard_draft(p_page text, p_expected_draft_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare cur_id bigint;
begin
  perform public.cms_require_admin();
  perform public.cms_lock_page(p_page);
  select id into cur_id from public.site_content_versions where page = p_page and status = 'draft';
  if cur_id is null or cur_id <> p_expected_draft_id then
    raise exception 'the draft was changed by someone else' using errcode = 'PT409';
  end if;
  update public.site_content_versions set status = 'superseded' where id = cur_id;
  return jsonb_build_object('page', p_page, 'discarded_draft_id', cur_id);
end;
$$;

-- Shared by publish and rollback: every media id must have been copied to
-- the public bucket by the publish-media Edge Function.
create or replace function public.cms_require_media_ready(p_media uuid[])
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare missing uuid;
begin
  select x into missing from unnest(p_media) x
  where not exists (select 1 from public.site_media m where m.id = x and m.public_path is not null)
  limit 1;
  if missing is not null then
    raise exception 'image % has not been prepared for publishing', missing using errcode = 'PT409';
  end if;
end;
$$;

revoke all on function public.cms_require_media_ready(uuid[]) from public, anon, authenticated;

create or replace function public.cms_activate(p_page text, p_content jsonb, p_source_id bigint, p_expected_published_id bigint, p_me uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pub_id bigint;
  new_id bigint;
  new_at timestamptz := now();
  sv integer;
begin
  select id into pub_id from public.site_content_versions where page = p_page and status = 'published';
  if pub_id is distinct from p_expected_published_id then
    raise exception 'the live version changed (current %, expected %)', pub_id, p_expected_published_id
      using errcode = 'PT409';
  end if;
  perform public.cms_require_media_ready(public.validate_content(p_page, p_content));
  select schema_version into sv from public.site_pages where page = p_page;
  if pub_id is not null then
    update public.site_content_versions set status = 'archived' where id = pub_id;
  end if;
  insert into public.site_content_versions
    (page, schema_version, content, status, previous_version_id, source_version_id, created_by, published_by, published_at)
  values
    (p_page, sv, p_content, 'published', pub_id, p_source_id, p_me, p_me, new_at)
  returning id into new_id;
  update public.site_media set published_at = coalesce(published_at, new_at)
  where id = any (public.validate_content(p_page, p_content));
  return jsonb_build_object('page', p_page, 'version', new_id, 'previous_version', pub_id, 'published_at', new_at);
end;
$$;

revoke all on function public.cms_activate(text, jsonb, bigint, bigint, uuid) from public, anon, authenticated;

-- Admin: publish the current draft. All or nothing: any failure (stale
-- draft, live version changed, invalid content, image not prepared) raises
-- and the transaction leaves the live version untouched.
create or replace function public.publish(p_page text, p_draft_id bigint, p_expected_published_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.cms_require_admin();
  d public.site_content_versions;
  result jsonb;
begin
  perform public.cms_lock_page(p_page);
  select * into d from public.site_content_versions where page = p_page and status = 'draft';
  if d.id is null or d.id <> p_draft_id then
    raise exception 'draft % is not the current draft', p_draft_id using errcode = 'PT409';
  end if;
  result := public.cms_activate(p_page, d.content, d.id, p_expected_published_id, me);
  update public.site_content_versions set status = 'superseded' where id = d.id;
  return result;
end;
$$;

-- Admin: republish an earlier version's content as a NEW published version.
-- History is untouched; the current draft (if any) is left as it is.
create or replace function public.rollback(p_page text, p_version_id bigint, p_expected_published_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.cms_require_admin();
  target public.site_content_versions;
begin
  perform public.cms_lock_page(p_page);
  select * into target from public.site_content_versions where id = p_version_id and page = p_page;
  if target.id is null or target.status <> 'archived' then
    raise exception 'version % is not a previously published version of "%"', p_version_id, left(p_page, 40)
      using errcode = 'PT404';
  end if;
  return public.cms_activate(p_page, target.content, target.id, p_expected_published_id, me);
end;
$$;

-- Admin: revision history (newest first), without content bodies.
create or replace function public.list_versions(p_page text, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.cms_require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', v.id, 'status', v.status, 'note', v.note,
      'previous_version_id', v.previous_version_id, 'source_version_id', v.source_version_id,
      'created_by', v.created_by, 'created_at', v.created_at,
      'published_by', v.published_by, 'published_at', v.published_at) order by v.id desc)
    from (select * from public.site_content_versions
          where page = p_page order by id desc limit least(greatest(p_limit, 1), 200)) v
  ), '[]'::jsonb);
end;
$$;

-- ── Function permissions ───────────────────────────────────────────────────
-- Supabase grants EXECUTE on new public functions to anon/authenticated by
-- default; revoke everything, then grant exactly what each caller needs.
-- The privileged functions are not executable by anon at all, and still
-- check is_admin() themselves for authenticated callers.

revoke all on function public.get_published_content(text) from public, anon, authenticated;
revoke all on function public.get_draft(text) from public, anon, authenticated;
revoke all on function public.save_draft(text, jsonb, bigint, text) from public, anon, authenticated;
revoke all on function public.discard_draft(text, bigint) from public, anon, authenticated;
revoke all on function public.publish(text, bigint, bigint) from public, anon, authenticated;
revoke all on function public.rollback(text, bigint, bigint) from public, anon, authenticated;
revoke all on function public.list_versions(text, integer) from public, anon, authenticated;

grant execute on function public.get_published_content(text) to anon, authenticated;
grant execute on function public.get_draft(text) to authenticated;
grant execute on function public.save_draft(text, jsonb, bigint, text) to authenticated;
grant execute on function public.discard_draft(text, bigint) to authenticated;
grant execute on function public.publish(text, bigint, bigint) to authenticated;
grant execute on function public.rollback(text, bigint, bigint) to authenticated;
grant execute on function public.list_versions(text, integer) to authenticated;

-- Rollback of this migration (reference only; drops ALL CMS history):
--   drop function if exists public.list_versions(text, integer), public.rollback(text, bigint, bigint),
--     public.publish(text, bigint, bigint), public.cms_activate(text, jsonb, bigint, bigint, uuid),
--     public.cms_require_media_ready(uuid[]), public.discard_draft(text, bigint),
--     public.save_draft(text, jsonb, bigint, text), public.get_draft(text),
--     public.get_published_content(text), public.cms_lock_page(text), public.cms_require_admin(),
--     public.validate_content(text, jsonb), public.cms_check_art(jsonb, text, uuid[]),
--     public.cms_check_href(jsonb, text), public.cms_check_anchor(jsonb, text),
--     public.cms_check_point(jsonb, text), public.cms_check_number(jsonb, numeric, numeric, text),
--     public.cms_check_text(jsonb, integer, integer, text), public.cms_check_keys(jsonb, text[], text[], text);
--   drop table if exists public.site_content_versions, public.site_content_routes, public.site_pages;
--   drop function if exists public.site_content_guard(), public.is_admin();
