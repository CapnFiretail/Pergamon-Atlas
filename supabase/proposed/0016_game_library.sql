-- 0016: the Game Library, the Games page and the two P1 widgets.
--
-- PROPOSED. Not applied anywhere.
--
-- Requires 0008, 0009, 0011–0014. Adds two rows to site_pages; creates or
-- replaces functions. No table, column, policy, trigger or storage change; no
-- content is created, published, converted or deleted, and
-- atlas_visibility_overrides is neither read nor written.
--
-- The Game Library is one more versioned document (page 'library', schema 1), so
-- its drafts, publishing, history and image checks are the existing ones:
--
--   { "schema": 1, "components": {
--       "library.games":       { "order": [id, …] },                -- ≤ 64
--       "library.games.<id>":  Record } }
--   Record = { "name", "category", "destination", "availability",
--              "description"?, "art"?: Art|null, "wide"?: Art|null }
--     availability  available | coming-soon | hidden | archived
--     destination   a game page in site_content_routes, at most one record each
--     art, wide     square and wide artwork, each with its default crop
--
-- Availability decides discovery (listings), not access: a game's own page stays
-- reachable at its address.
--
-- A page document (schema 2, any page in site_pages but the library) may refer to
-- records instead of describing games:
--   list card             { "game": id, "crop"? }
--   Featured / Spotlight  { "game": id, "cta", "crop"?, "style"? }
--   crop                  Art's framing fields, without the image or its text
-- and may hold two more widgets:
--   page-heading  one component: { "title", "subtitle"?, "emblem", "count", "countLabel"? }
--   card-grid     an ordered list of game references only (≤ 24)
-- Nothing in a region may end below a card-grid, which grows with its content.
--
-- References stay whole:
--   * A record that has been published keeps its id in every later version of the
--     library (archive it instead): checked when the library is saved or
--     published. The set of published ids therefore only ever grows.
--   * An earlier library is restored as a draft, never straight to visitors.
--   * Saving a page's draft needs each game it adds in the live library or its draft.
--     A draft may outlive the library draft it used (discarded or changed): what it
--     already refers to is kept, so nothing else in it is ever held back. Publishing or
--     restoring a page needs every game in the live library, without exception.
--   * Page writes take the page's lock, then (if it has references) the library's,
--     shared; library writes take the library's, exclusive; a publish then locks its
--     images, by id. Always in that order, so no write can wait in a circle; and no
--     page is checked against a library that is being changed at that moment. That
--     needs READ COMMITTED (PostgREST's default): any other level is refused.
--   * get_published_content reads the page and its records in one snapshot.
--
-- The sizes (64 records, 24 cards in a grid) are this implementation's limits, not
-- architectural ones: each is one number here and one in the browser's checks.
--
-- Visitors receive, with a page, the records it refers to that are available or
-- coming soon. References to any other record are taken out of what they
-- receive, with the record. The library itself is never served to them; drafts
-- and whole records are for administrators (get_draft).
--
-- Backward compatible: schema 1 keeps its validator (0014's, untouched); every
-- schema-2 document valid before is valid after; a page without references is
-- answered exactly as before (verify_0016.sql compares). cms_validate_home_v2
-- (0014) is no longer called; it stays for recovery_0016.sql.
--
-- Rollout: preflight_0016.sql, this, verify_0016.sql, on staging and then on
-- production, each before the code that uses it. Until a library is published,
-- nothing visible changes. Undo: recovery_0016.sql, only while nothing has been
-- saved for 'games' or 'library'; afterwards leave 0016 in place (older code
-- ignores it, and version rows are permanent). Apply and recover in a maintenance
-- window: no open editors, no saves or publishes (docs/cms/CONCURRENCY-0016.md).

begin;

do $$
begin
  if to_regprocedure('public.cms_validate_home_v1(jsonb)') is null
     or to_regprocedure('public.cms_check_tile(jsonb,text,uuid[])') is null
     or to_regprocedure('public.cms_check_card(jsonb,text,uuid[])') is null
     or to_regprocedure('public.cms_require_media_ready(uuid[])') is null then
    raise exception '0016 needs 0008, 0009, 0012, 0013 and 0014';
  end if;
end;
$$;

insert into public.site_pages (page, schema_version) values ('games', 2), ('library', 1)
on conflict (page) do nothing;

-- ── References to games ────────────────────────────────────────────────────
-- Every game a document refers to.
create or replace function public.cms_game_refs(doc jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(distinct c.value ->> 'game'), array[]::text[])
  from jsonb_each(case when jsonb_typeof(doc -> 'components') = 'object' then doc -> 'components' else '{}'::jsonb end) c
  where jsonb_typeof(c.value) = 'object' and jsonb_typeof(c.value -> 'game') = 'string';
$$;

-- A widget's own framing of a record's artwork: Art's framing fields only.
create or replace function public.cms_check_crop(val jsonb, at text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  perform public.cms_check_keys(val, array['fit', 'focus', 'focusNarrow', 'scale', 'scaleNarrow', 'anchor', 'anchorNarrow', 'base'], array[]::text[], at);
  -- The same checks as an image's own framing (the source here is only a stand-in).
  perform public.cms_check_art(val || '{"source": {"static": "/images/featured/x.webp"}}'::jsonb, at, array[]::uuid[]);
end;
$$;

-- A reference; p_feature: on a Featured / Spotlight card.
create or replace function public.cms_check_game_ref(val jsonb, at text, p_feature boolean)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_feature then
    perform public.cms_check_keys(val, array['game', 'cta', 'crop', 'style'], array['game', 'cta'], at);
    perform public.cms_check_text(val -> 'cta', 1, 24, at || '.cta');
    if val ? 'style' then
      perform public.cms_check_keys(val -> 'style', array['rules'], array[]::text[], at || '.style');
      if (val -> 'style') ? 'rules' and jsonb_typeof(val -> 'style' -> 'rules') <> 'boolean' then
        raise exception '%.style.rules: must be true or false', at using errcode = 'PT422';
      end if;
    end if;
  else
    perform public.cms_check_keys(val, array['game', 'crop'], array['game'], at);
  end if;
  if jsonb_typeof(val -> 'game') <> 'string' or (val ->> 'game') !~ '^[a-z0-9][a-z0-9-]{0,39}$' then
    raise exception '%.game: must be a game id', at using errcode = 'PT422';
  end if;
  if val ? 'crop' then
    perform public.cms_check_crop(val -> 'crop', at || '.crop');
  end if;
end;
$$;

-- A Featured / Spotlight card, or a carousel's: its own details (0012, 0014) or a
-- reference.
create or replace function public.cms_check_feature(val jsonb, at text, media inout uuid[])
language plpgsql
stable
set search_path = ''
as $$
begin
  if jsonb_typeof(val) = 'object' and val ? 'game' then
    perform public.cms_check_game_ref(val, at, true);
  else
    media := public.cms_check_card(val, at, media);
  end if;
end;
$$;

create or replace function public.cms_check_list_card(val jsonb, at text, media inout uuid[])
language plpgsql
stable
set search_path = ''
as $$
begin
  if jsonb_typeof(val) = 'object' and val ? 'game' then
    perform public.cms_check_game_ref(val, at, false);
  else
    media := public.cms_check_tile(val, at, media);
  end if;
end;
$$;

-- ── The page heading's fields ──────────────────────────────────────────────
create or replace function public.cms_check_heading(val jsonb, at text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  perform public.cms_check_keys(val, array['title', 'subtitle', 'emblem', 'count', 'countLabel'], array['title', 'emblem', 'count'], at);
  perform public.cms_check_text(val -> 'title', 1, 40, at || '.title');
  if val ? 'subtitle' then perform public.cms_check_text(val -> 'subtitle', 1, 40, at || '.subtitle'); end if;
  if val ? 'countLabel' then perform public.cms_check_text(val -> 'countLabel', 1, 16, at || '.countLabel'); end if;
  if jsonb_typeof(val -> 'emblem') <> 'string' or (val ->> 'emblem') not in ('games', 'compass', 'none') then
    raise exception '%.emblem: must be games, compass or none', at using errcode = 'PT422';
  end if;
  if jsonb_typeof(val -> 'count') <> 'string' or (val ->> 'count') not in ('none', 'cards') then
    raise exception '%.count: must be none or cards', at using errcode = 'PT422';
  end if;
end;
$$;

-- ── Schema 2, for any page ─────────────────────────────────────────────────
-- 0014's cms_validate_home_v2 with the page's own prefix, references, the two new
-- types and the growing rule. Site Navigation stays the homepage's.
create or replace function public.cms_validate_page(p_page text, doc jsonb)
returns uuid[]
language plpgsql
stable
set search_path = ''
as $$
declare
  prefix text := p_page || '.';
  media uuid[] := array[]::uuid[];
  comps jsonb;
  region jsonb;
  w jsonb;
  ri integer := 0;
  region_ids text[] := array[]::text[];
  inst_ids text[] := array[]::text[];
  inst_types text[] := array[]::text[];
  -- this region's rectangles, for the overlap and growing checks
  r_ids text[]; r_types text[]; r_col integer[]; r_row integer[]; r_cols integer[]; r_rows integer[];
  i integer; j integer; n integer;
  col integer; rw integer; cols integer; rws integer;
  f text;
  id text;
  t text;
  k text;
  rest text;
  ids text[];
  item_id text;
begin
  perform public.cms_check_keys(doc, array['schema', 'regions', 'components'], array['schema', 'regions', 'components'], 'document');
  if jsonb_typeof(doc -> 'schema') <> 'number' or (doc ->> 'schema') <> '2' then
    raise exception 'document.schema: must be 2' using errcode = 'PT422';
  end if;
  comps := doc -> 'components';
  if jsonb_typeof(comps) <> 'object' then
    raise exception 'document.components: must be an object' using errcode = 'PT422';
  end if;
  if pg_column_size(doc) > 262144 then
    raise exception 'document: larger than 256 KB' using errcode = 'PT422';
  end if;
  if jsonb_typeof(doc -> 'regions') <> 'array' or jsonb_array_length(doc -> 'regions') < 1 or jsonb_array_length(doc -> 'regions') > 4 then
    raise exception 'document.regions: must be a list of 1 to 4 regions' using errcode = 'PT422';
  end if;

  -- Regions and their placements.
  for region in select value from jsonb_array_elements(doc -> 'regions') loop
    ri := ri + 1;
    perform public.cms_check_keys(region, array['id', 'frame', 'rowHeight', 'stack', 'widgets'], array['id', 'widgets'], 'regions[' || ri || ']');
    if jsonb_typeof(region -> 'id') <> 'string' or (region ->> 'id') !~ '^[a-z][a-z0-9-]{0,31}$' then
      raise exception 'regions[%].id: invalid', ri using errcode = 'PT422';
    end if;
    if (region ->> 'id') = any (region_ids) then
      raise exception 'regions: "%" is used twice', region ->> 'id' using errcode = 'PT422';
    end if;
    region_ids := array_append(region_ids, region ->> 'id');
    if region ? 'frame' and (jsonb_typeof(region -> 'frame') <> 'string' or (region ->> 'frame') <> 'sidebar') then
      raise exception 'regions[%].frame: must be "sidebar"', ri using errcode = 'PT422';
    end if;
    if region ? 'rowHeight' and (jsonb_typeof(region -> 'rowHeight') <> 'number'
       or (region ->> 'rowHeight')::numeric < 8 or (region ->> 'rowHeight')::numeric > 400) then
      raise exception 'regions[%].rowHeight: must be a number from 8 to 400', ri using errcode = 'PT422';
    end if;
    if jsonb_typeof(region -> 'widgets') <> 'array' then
      raise exception 'regions[%].widgets: must be a list', ri using errcode = 'PT422';
    end if;

    r_ids := array[]::text[]; r_types := array[]::text[];
    r_col := array[]::integer[]; r_row := array[]::integer[]; r_cols := array[]::integer[]; r_rows := array[]::integer[];
    for w in select value from jsonb_array_elements(region -> 'widgets') loop
      perform public.cms_check_keys(w, array['id', 'type', 'col', 'row', 'cols', 'rows'], array['id', 'type', 'col', 'row', 'cols', 'rows'], 'regions[' || ri || '].widget');
      id := w ->> 'id';
      if jsonb_typeof(w -> 'id') <> 'string' or id !~ '^[a-z0-9][a-z0-9-]{0,39}$' then
        raise exception 'regions[%]: invalid widget id', ri using errcode = 'PT422';
      end if;
      if id = any (inst_ids) then
        raise exception 'widgets: "%" is placed twice', id using errcode = 'PT422';
      end if;
      t := w ->> 'type';
      if jsonb_typeof(w -> 'type') <> 'string' or t not in ('feature-hero', 'feature-spotlight', 'carousel', 'atlas-navigation', 'page-heading', 'card-grid') then
        raise exception 'widgets: "%" has an unsupported type', id using errcode = 'PT422';
      end if;
      foreach f in array array['col', 'row', 'cols', 'rows'] loop
        if jsonb_typeof(w -> f) <> 'number' or (w ->> f)::numeric <> floor((w ->> f)::numeric) or (w ->> f)::numeric < 1 or (w ->> f)::numeric > 400 then
          raise exception 'widgets."%".%: must be a whole number from 1 to 400', id, f using errcode = 'PT422';
        end if;
      end loop;
      col := (w ->> 'col')::integer; rw := (w ->> 'row')::integer; cols := (w ->> 'cols')::integer; rws := (w ->> 'rows')::integer;
      if col + cols - 1 > 20 then
        raise exception 'widgets."%": extends past column 20', id using errcode = 'PT422';
      end if;
      if rw + rws - 1 > 400 then
        raise exception 'widgets."%": extends past row 400', id using errcode = 'PT422';
      end if;
      inst_ids := array_append(inst_ids, id);
      inst_types := array_append(inst_types, t);
      if array_length(inst_ids, 1) > 24 then
        raise exception 'widgets: at most 24 on a page' using errcode = 'PT422';
      end if;
      r_ids := array_append(r_ids, id); r_types := array_append(r_types, t);
      r_col := array_append(r_col, col); r_row := array_append(r_row, rw);
      r_cols := array_append(r_cols, cols); r_rows := array_append(r_rows, rws);
    end loop;
    -- An authored stacking order (narrow screens) lists every widget once.
    if region ? 'stack' then
      if jsonb_typeof(region -> 'stack') <> 'array' or jsonb_array_length(region -> 'stack') <> coalesce(array_length(r_ids, 1), 0) then
        raise exception 'regions[%].stack: must list every widget of the region once', ri using errcode = 'PT422';
      end if;
      for w in select value from jsonb_array_elements(region -> 'stack') loop
        if jsonb_typeof(w) <> 'string' or not ((w #>> '{}') = any (r_ids)) then
          raise exception 'regions[%].stack: must list every widget of the region once', ri using errcode = 'PT422';
        end if;
      end loop;
      if (select count(distinct value) from jsonb_array_elements(region -> 'stack')) <> jsonb_array_length(region -> 'stack') then
        raise exception 'regions[%].stack: must list every widget of the region once', ri using errcode = 'PT422';
      end if;
    end if;
    n := coalesce(array_length(r_ids, 1), 0);
    -- Two widgets overlap when they share a column range and a row range.
    for i in 1 .. n loop
      for j in i + 1 .. n loop
        if greatest(r_col[i], r_col[j]) < least(r_col[i] + r_cols[i], r_col[j] + r_cols[j])
           and greatest(r_row[i], r_row[j]) < least(r_row[i] + r_rows[i], r_row[j] + r_rows[j]) then
          raise exception 'widgets: "%" and "%" overlap', r_ids[i], r_ids[j] using errcode = 'PT422';
        end if;
      end loop;
    end loop;
    -- A card grid grows with its content: nothing ends below it (for now; the
    -- same rule as scripts/grid/atlas-grid.js belowGrowing).
    for i in 1 .. n loop
      continue when r_types[i] <> 'card-grid';
      for j in 1 .. n loop
        if r_row[j] + r_rows[j] > r_row[i] + r_rows[i] then
          raise exception 'widgets: "%" ends below "%", which grows with its content', r_ids[j], r_ids[i] using errcode = 'PT422';
        end if;
      end loop;
    end loop;
  end loop;

  -- Each instance's own content.
  for i in 1 .. coalesce(array_length(inst_ids, 1), 0) loop
    id := inst_ids[i];
    t := inst_types[i];
    k := prefix || id;
    if t <> 'atlas-navigation' and not (comps ? k) then
      raise exception 'components: missing "%"', k using errcode = 'PT422';
    end if;
    if t in ('feature-hero', 'feature-spotlight') then
      media := public.cms_check_feature(comps -> k, k, media);
      if comps ? (k || '.saved') then
        ids := public.cms_check_list(comps, k || '.saved', k || '.saved.', 12);
        foreach item_id in array ids loop
          media := public.cms_check_feature(comps -> (k || '.saved.' || item_id), k || '.saved.' || item_id, media);
        end loop;
      else
        -- No list, no saved cards: none may go unlisted (and so unchecked).
        for rest in select jsonb_object_keys(comps) loop
          if left(rest, length(k || '.saved.')) = k || '.saved.' then
            raise exception '%: not listed in %.saved.order', rest, k using errcode = 'PT422';
          end if;
        end loop;
      end if;
    elsif t in ('carousel', 'card-grid') then
      ids := public.cms_check_list(comps, k, k || '.', 24);
      foreach item_id in array ids loop
        if item_id = 'saved' then
          raise exception '%.order: "saved" is reserved', k using errcode = 'PT422';
        end if;
        if t = 'card-grid' then
          perform public.cms_check_game_ref(comps -> (k || '.' || item_id), k || '.' || item_id, false);
        else
          media := public.cms_check_list_card(comps -> (k || '.' || item_id), k || '.' || item_id, media);
        end if;
      end loop;
    elsif t = 'page-heading' then
      perform public.cms_check_heading(comps -> k, k);
    end if;
  end loop;

  -- Every component belongs to an instance (or is the homepage's site-wide sidebar).
  for k in select jsonb_object_keys(comps) loop
    if k = 'site.sidebar' and p_page = 'home' then
      perform public.cms_check_nav(comps -> k, k);
      continue;
    end if;
    if left(k, length(prefix)) <> prefix or substr(k, length(prefix) + 1) !~ '^[a-z0-9][a-z0-9-]{0,39}(\.|$)' then
      raise exception 'components: unsupported component "%"', left(k, 60) using errcode = 'PT422';
    end if;
    id := split_part(substr(k, length(prefix) + 1), '.', 1);
    i := array_position(inst_ids, id);
    if i is null then
      raise exception 'components: "%" belongs to no widget', left(k, 60) using errcode = 'PT422';
    end if;
    rest := substr(k, length(prefix) + 1 + length(id));
    t := inst_types[i];
    if t = 'atlas-navigation'
       or not (rest = ''
               or (t in ('feature-hero', 'feature-spotlight') and (rest = '.saved' or rest ~ '^\.saved\.[a-z0-9][a-z0-9-]{0,39}$'))
               or (t in ('carousel', 'card-grid') and rest ~ '^\.[a-z0-9][a-z0-9-]{0,39}$')) then
      raise exception 'components: "%" is not part of a "%" widget', left(k, 60), t using errcode = 'PT422';
    end if;
  end loop;

  return (select coalesce(array_agg(distinct x), array[]::uuid[]) from unnest(media) x);
end;
$$;

-- ── The library ────────────────────────────────────────────────────────────
create or replace function public.cms_validate_library(doc jsonb)
returns uuid[]
language plpgsql
stable
set search_path = ''
as $$
declare
  media uuid[] := array[]::uuid[];
  comps jsonb;
  ids text[];
  id text;
  k text;
  g jsonb;
  f text;
  destinations text[] := array[]::text[];
begin
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
  if not (comps ? 'library.games') then
    raise exception 'components: missing "library.games"' using errcode = 'PT422';
  end if;
  for k in select jsonb_object_keys(comps) loop
    if k <> 'library.games' and k !~ '^library\.games\.[a-z0-9][a-z0-9-]{0,39}$' then
      raise exception 'components: unsupported component "%"', left(k, 60) using errcode = 'PT422';
    end if;
  end loop;

  ids := public.cms_check_list(comps, 'library.games', 'library.games.', 64);
  foreach id in array ids loop
    k := 'library.games.' || id;
    g := comps -> k;
    perform public.cms_check_keys(g, array['name', 'category', 'destination', 'availability', 'description', 'art', 'wide'],
      array['name', 'category', 'destination', 'availability'], k);
    perform public.cms_check_text(g -> 'name', 1, 40, k || '.name');
    if g ? 'description' then perform public.cms_check_text(g -> 'description', 1, 160, k || '.description'); end if;
    if jsonb_typeof(g -> 'category') <> 'string' or (g ->> 'category') not in ('Strategy', 'Arcade', 'Classic', 'Card') then
      raise exception '%.category: must be Strategy, Arcade, Classic or Card', k using errcode = 'PT422';
    end if;
    if jsonb_typeof(g -> 'availability') <> 'string' or (g ->> 'availability') not in ('available', 'coming-soon', 'hidden', 'archived') then
      raise exception '%.availability: must be available, coming-soon, hidden or archived', k using errcode = 'PT422';
    end if;
    perform public.cms_check_href(g -> 'destination', k || '.destination');
    if (g ->> 'destination') !~ '^/games/[a-z0-9-]+/$' then
      raise exception '%.destination: must be a game page', k using errcode = 'PT422';
    end if;
    if (g ->> 'destination') = any (destinations) then
      raise exception '%.destination: "%" is another game''s', k, g ->> 'destination' using errcode = 'PT422';
    end if;
    destinations := array_append(destinations, g ->> 'destination');
    foreach f in array array['art', 'wide'] loop
      if g ? f and jsonb_typeof(g -> f) <> 'null' then
        media := public.cms_check_art(g -> f, k || '.' || f, media);
      end if;
    end loop;
  end loop;

  return (select coalesce(array_agg(distinct x), array[]::uuid[]) from unnest(media) x);
end;
$$;

-- ── validate_content: by page, then by the document's own schema ───────────
-- A page is one more row in site_pages; only schema 1 (the homepage's original
-- shape) and the library have rules of their own.
create or replace function public.validate_content(p_page text, doc jsonb)
returns uuid[]
language plpgsql
stable
set search_path = ''
as $$
begin
  if not exists (select 1 from public.site_pages where page = p_page) then
    raise exception 'no content schema for page "%"', p_page using errcode = 'PT422';
  end if;
  if jsonb_typeof(doc) is distinct from 'object' then
    raise exception 'document: must be an object' using errcode = 'PT422';
  end if;
  if p_page = 'library' then
    return public.cms_validate_library(doc);
  end if;
  if p_page = 'home' and (jsonb_typeof(doc -> 'schema') = 'number' and (doc ->> 'schema') = '2') is not true then
    return public.cms_validate_home_v1(doc);
  end if;
  return public.cms_validate_page(p_page, doc);
end;
$$;

-- ── References hold ────────────────────────────────────────────────────────
-- A page's games exist (p_live: in the live library; otherwise its draft will do);
-- a library keeps every id that has been published. Takes the library's lock: a
-- library write holds it already (cms_lock_page), a page write shares it.
create or replace function public.cms_require_games(p_page text, doc jsonb, p_live boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  refs text[];
  missing text;
begin
  refs := case when p_page = 'library' then array[]::text[] else public.cms_game_refs(doc) end;
  if p_page <> 'library' and cardinality(refs) = 0 then return; end if;
  -- After the lock, this must see what its last holder committed.
  if current_setting('transaction_isolation') not in ('read committed', 'read uncommitted') then
    raise exception 'library checks need READ COMMITTED' using errcode = 'PT500';
  end if;

  if p_page = 'library' then
    select substr(live.key, length('library.games.') + 1) into missing
    from public.site_content_versions v
    cross join lateral jsonb_object_keys(v.content -> 'components') live(key)
    where v.page = 'library' and v.status = 'published'
      and left(live.key, length('library.games.')) = 'library.games.'
      and not (doc -> 'components') ? live.key
    order by 1 limit 1;
    if missing is not null then
      raise exception 'library.games.%: a published game can be archived, not removed', missing using errcode = 'PT422';
    end if;
    return;
  end if;

  perform pg_advisory_xact_lock_shared(hashtext('pergamon.site_content:library'));
  select r into missing
  from unnest(refs) r
  where not exists (
    select 1 from public.site_content_versions v
    where v.page = 'library' and (v.status = 'published' or (v.status = 'draft' and not p_live))
      and (v.content -> 'components') ? ('library.games.' || r))
    -- Already in this page's draft: kept, so the rest of the draft can be saved.
    and (p_live or not exists (
      select 1 from public.site_content_versions d
      where d.page = p_page and d.status = 'draft' and r = any (public.cms_game_refs(d.content))))
  order by 1 limit 1;
  if missing is not null then
    if p_live then
      raise exception 'game "%" isn''t in the published Game Library: publish the library first', missing using errcode = 'PT422';
    end if;
    raise exception 'game "%" isn''t in the Game Library', missing using errcode = 'PT422';
  end if;
end;
$$;

-- 0008's, with the check after validation.
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
  perform public.cms_require_games(p_page, p_content, false);
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
  media uuid[];
begin
  select id into pub_id from public.site_content_versions where page = p_page and status = 'published';
  if pub_id is distinct from p_expected_published_id then
    raise exception 'the live version changed (current %, expected %)', pub_id, p_expected_published_id
      using errcode = 'PT409';
  end if;
  perform public.cms_require_media_ready(public.validate_content(p_page, p_content));
  perform public.cms_require_games(p_page, p_content, true);
  select schema_version into sv from public.site_pages where page = p_page;
  if pub_id is not null then
    update public.site_content_versions set status = 'archived' where id = pub_id;
  end if;
  insert into public.site_content_versions
    (page, schema_version, content, status, previous_version_id, source_version_id, created_by, published_by, published_at)
  values
    (p_page, sv, p_content, 'published', pub_id, p_source_id, p_me, p_me, new_at)
  returning id into new_id;
  -- Two pages may publish the same image at once: rows in one order.
  media := public.validate_content(p_page, p_content);
  perform 1 from public.site_media where id = any (media) and published_at is null order by id for no key update;
  update public.site_media set published_at = new_at where id = any (media) and published_at is null;
  return jsonb_build_object('page', p_page, 'version', new_id, 'previous_version', pub_id, 'published_at', new_at);
end;
$$;

-- 0008's, but a library is restored by opening the version as a draft and publishing
-- that (its content comes from list_published_versions; saving it checks that no
-- published game is missing), never straight to visitors.
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
  if p_page = 'library' then
    raise exception 'the Game Library is restored as a draft' using errcode = 'PT422';
  end if;
  perform public.cms_lock_page(p_page);
  select * into target from public.site_content_versions where id = p_version_id and page = p_page;
  if target.id is null or target.status <> 'archived' then
    raise exception 'version % is not a previously published version of "%"', p_version_id, left(p_page, 40)
      using errcode = 'PT404';
  end if;
  return public.cms_activate(p_page, target.content, target.id, p_expected_published_id, me);
end;
$$;

-- ── Visitors ───────────────────────────────────────────────────────────────
-- As before (no saved cards, public image paths only), plus the public records of
-- the games the page refers to: 'library' = { version, games: { id: Record } },
-- only when it refers to any. A reference to any other record goes with it: a
-- list's card is left out, a Featured / Spotlight card becomes { "game": null }.
create or replace function public.get_published_content(p_page text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  l public.site_content_versions;
  lib public.site_content_versions;
  doc jsonb;
  comps jsonb;
  refs text[];
  games jsonb := '{}'::jsonb;
  answer jsonb;
begin
  if p_page = 'library' then return null; end if;
  select * into l from public.site_content_versions v where v.page = p_page and v.status = 'published';
  if l.id is null then return null; end if;

  doc := l.content;
  if jsonb_typeof(doc -> 'components') = 'object' then
    select coalesce(jsonb_object_agg(c.key, c.value), '{}'::jsonb) into comps
    from jsonb_each(doc -> 'components') c
    where c.key !~ '^[a-z][a-z0-9-]{0,31}\.[a-z0-9][a-z0-9-]{0,39}\.saved(\.|$)';
    doc := jsonb_set(doc, '{components}', comps);
  end if;

  refs := public.cms_game_refs(doc);
  if cardinality(refs) > 0 then
    select * into lib from public.site_content_versions v where v.page = 'library' and v.status = 'published';
    select coalesce(jsonb_object_agg(r, lib.content -> 'components' -> ('library.games.' || r)), '{}'::jsonb) into games
    from unnest(refs) r
    where (lib.content -> 'components' -> ('library.games.' || r) ->> 'availability') in ('available', 'coming-soon');
    -- Cards whose game visitors don't receive.
    select coalesce(jsonb_object_agg(c.key, case when c.gone then '{"game": null}'::jsonb else c.value end), '{}'::jsonb) into comps
    from (
      select e.key, e.value,
             coalesce(jsonb_typeof(e.value) = 'object' and jsonb_typeof(e.value -> 'game') = 'string' and not games ? (e.value ->> 'game'), false) as gone
      from jsonb_each(comps) e
    ) c
    where not (c.gone and c.key ~ '^[^.]+\.[^.]+\.');
    -- … leave their lists too.
    select coalesce(jsonb_object_agg(c.key, case
        when jsonb_typeof(c.value) = 'object' and jsonb_typeof(c.value -> 'order') = 'array' then
          jsonb_set(c.value, '{order}', coalesce((
            select jsonb_agg(o.value order by o.ordinality)
            from jsonb_array_elements(c.value -> 'order') with ordinality o
            where comps ? (c.key || '.' || (o.value #>> '{}'))), '[]'::jsonb))
        else c.value end), '{}'::jsonb) into comps
    from jsonb_each(comps) c;
    doc := jsonb_set(doc, '{components}', comps);
  end if;

  answer := jsonb_build_object(
    'page', l.page,
    'version', l.id,
    'schema', l.schema_version,
    'published_at', l.published_at,
    'content', doc,
    'media', coalesce((
      select jsonb_object_agg(m.id, jsonb_build_object('path', m.public_path, 'width', m.width, 'height', m.height))
      from public.site_media m
      where m.public_path is not null
        and m.id in (select (e ->> 'media')::uuid
                     from jsonb_path_query(jsonb_build_array(doc, games), 'lax $.**.source') e
                     where jsonb_typeof(e) = 'object' and e ? 'media')
    ), '{}'::jsonb)
  );
  if cardinality(refs) > 0 then
    answer := answer || jsonb_build_object('library', jsonb_build_object('version', lib.id, 'games', games));
  end if;
  return answer;
end;
$$;

-- ── Administrators: where games are used ───────────────────────────────────
-- In every page the database has, live and draft: [{ game, page, status, cards }].
create or replace function public.list_game_uses()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.cms_require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object('game', u.game, 'page', u.page, 'status', u.status, 'cards', u.cards) order by u.game, u.page, u.status)
    from (
      select c.value ->> 'game' as game, v.page, v.status, jsonb_agg(c.key order by c.key) as cards
      from public.site_content_versions v
      cross join lateral jsonb_each(case when jsonb_typeof(v.content -> 'components') = 'object' then v.content -> 'components' else '{}'::jsonb end) c
      where v.status in ('published', 'draft') and v.page <> 'library'
        and jsonb_typeof(c.value) = 'object' and jsonb_typeof(c.value -> 'game') = 'string'
      group by 1, 2, 3
    ) u
  ), '[]'::jsonb);
end;
$$;

-- ── Privileges ─────────────────────────────────────────────────────────────
-- Internal: nobody through the API.
revoke all on function public.cms_game_refs(jsonb) from public, anon, authenticated;
revoke all on function public.cms_check_crop(jsonb, text) from public, anon, authenticated;
revoke all on function public.cms_check_game_ref(jsonb, text, boolean) from public, anon, authenticated;
revoke all on function public.cms_check_feature(jsonb, text, uuid[]) from public, anon, authenticated;
revoke all on function public.cms_check_list_card(jsonb, text, uuid[]) from public, anon, authenticated;
revoke all on function public.cms_check_heading(jsonb, text) from public, anon, authenticated;
revoke all on function public.cms_validate_page(text, jsonb) from public, anon, authenticated;
revoke all on function public.cms_validate_library(jsonb) from public, anon, authenticated;
revoke all on function public.cms_require_games(text, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.validate_content(text, jsonb) from public, anon, authenticated;
revoke all on function public.cms_activate(text, jsonb, bigint, bigint, uuid) from public, anon, authenticated;
-- As before: the public reader for everyone, saving for signed-in callers (who are
-- then checked). New: usage, the same way.
revoke all on function public.get_published_content(text) from public, anon, authenticated;
grant execute on function public.get_published_content(text) to anon, authenticated;
revoke all on function public.save_draft(text, jsonb, bigint, text) from public, anon, authenticated;
grant execute on function public.save_draft(text, jsonb, bigint, text) to authenticated;
revoke all on function public.rollback(text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.rollback(text, bigint, bigint) to authenticated;
revoke all on function public.list_game_uses() from public, anon, authenticated;
grant execute on function public.list_game_uses() to authenticated;

commit;
