-- 0014: homepage document schema 2 — a page made of grid regions with
-- independently placed widget instances (H5.3).
--
-- Schema 1 (today's documents) stays valid unchanged: its validator is
-- 0013's validate_content, renamed cms_validate_home_v1. Rollback to any
-- earlier version keeps working. Schema 2:
--
--   { "schema": 2,
--     "regions": [ { "id": "upper", "frame": "sidebar", "rowHeight": 23.43, "stack": [ids],
--                    "widgets": [ { "id", "type", "col", "row", "cols", "rows" }, … ] },
--                  { "id": "lower", "rowHeight": 23.43, "widgets": [ … ] } ],
--     "components": { "home.<instance>": …, "site.sidebar": … } }
--
-- An instance is a placement (in exactly one region) plus its content under
-- "home.<instance id>": a Card for feature-hero / feature-spotlight (with its
-- own saved cards: .saved / .saved.<key>), an { order } list for a carousel
-- (with its cards: .<key>), nothing for atlas-navigation. Every component
-- must belong to an instance (or be site.sidebar); nothing is orphaned.
--
-- The server checks structure, limits, bounds and overlaps. Pixel content
-- floors depend on screen width and fonts, so the editor checks those
-- (scripts/grid/atlas-grid.js).
--
-- site_pages.schema_version stays 1: get_published_content reports it, and
-- the live loader accepts only 1. Documents carry their own "schema"; the new
-- loader (H5.3 Checkpoint C) reads that instead, before any schema-2 document
-- is published. validate_content dispatches on document.schema.
--
-- Rollout: 0013 must be applied first (cms_check_nav). Staging, then
-- production, before the code that writes schema 2 is released.

begin;

-- ── Schema 1: unchanged (0013's validate_content, renamed) ─────────────────
create or replace function public.cms_validate_home_v1(doc jsonb)
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
  saved_ids text[];
  item jsonb;
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

  -- Component ids: the two active cards, their saved lists and saved cards,
  -- the carousel order, one entry per carousel card, and the site-wide
  -- sidebar navigation.
  for k in select jsonb_object_keys(comps) loop
    if k not in ('home.featured', 'home.spotlight', 'home.carousel', 'home.featured.saved', 'home.spotlight.saved', 'site.sidebar')
       and k !~ '^home\.carousel\.[a-z0-9][a-z0-9-]{0,39}$'
       and k !~ '^home\.(featured|spotlight)\.saved\.[a-z0-9][a-z0-9-]{0,39}$' then
      raise exception 'components: unsupported component "%"', left(k, 60) using errcode = 'PT422';
    end if;
  end loop;

  if comps ? 'site.sidebar' then
    perform public.cms_check_nav(comps -> 'site.sidebar', 'site.sidebar');
  end if;

  foreach card in array array['home.featured', 'home.spotlight'] loop
    if not (comps ? card) then
      raise exception 'components: missing "%"', card using errcode = 'PT422';
    end if;
    media := public.cms_check_card(comps -> card, card, media);

    -- Saved cards for this slot: an ordered list of ids, one card per id.
    saved_ids := array[]::text[];
    if comps ? (card || '.saved') then
      perform public.cms_check_keys(comps -> (card || '.saved'), array['order'], array['order'], card || '.saved');
      ord := comps -> (card || '.saved') -> 'order';
      if jsonb_typeof(ord) <> 'array' or jsonb_array_length(ord) > 12 then
        raise exception '%.saved.order: must be a list of up to 12 card ids', card using errcode = 'PT422';
      end if;
      for item in select value from jsonb_array_elements(ord) loop
        if jsonb_typeof(item) <> 'string' or (item #>> '{}') !~ '^[a-z0-9][a-z0-9-]{0,39}$' then
          raise exception '%.saved.order: invalid card id', card using errcode = 'PT422';
        end if;
        if (item #>> '{}') = any (saved_ids) then
          raise exception '%.saved.order: "%" is listed twice', card, item #>> '{}' using errcode = 'PT422';
        end if;
        saved_ids := array_append(saved_ids, item #>> '{}');
        if not (comps ? (card || '.saved.' || (item #>> '{}'))) then
          raise exception '%.saved.order: no component for "%"', card, item #>> '{}' using errcode = 'PT422';
        end if;
      end loop;
    end if;
    for k in select jsonb_object_keys(comps) loop
      continue when left(k, length(card || '.saved.')) <> card || '.saved.';
      item_id := substr(k, length(card || '.saved.') + 1);
      if not (item_id = any (saved_ids)) then
        raise exception '%: not listed in %.saved.order', k, card using errcode = 'PT422';
      end if;
      media := public.cms_check_card(comps -> k, k, media);
    end loop;
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

-- ── A carousel card (shared by both schemas) ───────────────────────────────
create or replace function public.cms_check_tile(val jsonb, at text, media inout uuid[])
language plpgsql
stable
set search_path = ''
as $$
begin
  perform public.cms_check_keys(val, array['title', 'category', 'href', 'art'], array['title', 'category', 'href'], at);
  perform public.cms_check_text(val -> 'title', 1, 40, at || '.title');
  if jsonb_typeof(val -> 'category') <> 'string'
     or (val ->> 'category') not in ('Strategy', 'Arcade', 'Classic', 'Card') then
    raise exception '%.category: must be Strategy, Arcade, Classic or Card', at using errcode = 'PT422';
  end if;
  perform public.cms_check_href(val -> 'href', at || '.href');
  if val ? 'art' and jsonb_typeof(val -> 'art') <> 'null' then
    media := public.cms_check_art(val -> 'art', at || '.art', media);
  end if;
end;
$$;

-- An ordered list of up to max_n ids, one component per id (prefix || id),
-- and no component with that prefix left unlisted. Returns the ids.
create or replace function public.cms_check_list(comps jsonb, list_key text, prefix text, max_n integer)
returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
  ord jsonb;
  item jsonb;
  ids text[] := array[]::text[];
  k text;
begin
  perform public.cms_check_keys(comps -> list_key, array['order'], array['order'], list_key);
  ord := comps -> list_key -> 'order';
  if jsonb_typeof(ord) <> 'array' or jsonb_array_length(ord) > max_n then
    raise exception '%.order: must be a list of up to % ids', list_key, max_n using errcode = 'PT422';
  end if;
  for item in select value from jsonb_array_elements(ord) loop
    if jsonb_typeof(item) <> 'string' or (item #>> '{}') !~ '^[a-z0-9][a-z0-9-]{0,39}$' then
      raise exception '%.order: invalid id', list_key using errcode = 'PT422';
    end if;
    if (item #>> '{}') = any (ids) then
      raise exception '%.order: "%" is listed twice', list_key, item #>> '{}' using errcode = 'PT422';
    end if;
    ids := array_append(ids, item #>> '{}');
    if not (comps ? (prefix || (item #>> '{}'))) then
      raise exception '%.order: no component for "%"', list_key, item #>> '{}' using errcode = 'PT422';
    end if;
  end loop;
  for k in select jsonb_object_keys(comps) loop
    continue when left(k, length(prefix)) <> prefix;
    if not (substr(k, length(prefix) + 1) = any (ids)) then
      raise exception '%: not listed in %.order', k, list_key using errcode = 'PT422';
    end if;
  end loop;
  return ids;
end;
$$;

-- ── Schema 2 ───────────────────────────────────────────────────────────────
create or replace function public.cms_validate_home_v2(doc jsonb)
returns uuid[]
language plpgsql
stable
set search_path = ''
as $$
declare
  media uuid[] := array[]::uuid[];
  comps jsonb;
  region jsonb;
  w jsonb;
  ri integer := 0;
  region_ids text[] := array[]::text[];
  inst_ids text[] := array[]::text[];
  inst_types text[] := array[]::text[];
  -- this region's rectangles, for the overlap check
  r_ids text[]; r_col integer[]; r_row integer[]; r_cols integer[]; r_rows integer[];
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

    r_ids := array[]::text[]; r_col := array[]::integer[]; r_row := array[]::integer[]; r_cols := array[]::integer[]; r_rows := array[]::integer[];
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
      if jsonb_typeof(w -> 'type') <> 'string' or t not in ('feature-hero', 'feature-spotlight', 'carousel', 'atlas-navigation') then
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
      r_ids := array_append(r_ids, id); r_col := array_append(r_col, col); r_row := array_append(r_row, rw);
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
    -- Two widgets overlap when they share a column range and a row range.
    n := coalesce(array_length(r_ids, 1), 0);
    for i in 1 .. n loop
      for j in i + 1 .. n loop
        if greatest(r_col[i], r_col[j]) < least(r_col[i] + r_cols[i], r_col[j] + r_cols[j])
           and greatest(r_row[i], r_row[j]) < least(r_row[i] + r_rows[i], r_row[j] + r_rows[j]) then
          raise exception 'widgets: "%" and "%" overlap', r_ids[i], r_ids[j] using errcode = 'PT422';
        end if;
      end loop;
    end loop;
  end loop;

  -- Each instance's own content.
  for i in 1 .. coalesce(array_length(inst_ids, 1), 0) loop
    id := inst_ids[i];
    t := inst_types[i];
    if t in ('feature-hero', 'feature-spotlight') then
      if not (comps ? ('home.' || id)) then
        raise exception 'components: missing "home.%"', id using errcode = 'PT422';
      end if;
      media := public.cms_check_card(comps -> ('home.' || id), 'home.' || id, media);
      if comps ? ('home.' || id || '.saved') then
        ids := public.cms_check_list(comps, 'home.' || id || '.saved', 'home.' || id || '.saved.', 12);
        foreach item_id in array ids loop
          media := public.cms_check_card(comps -> ('home.' || id || '.saved.' || item_id), 'home.' || id || '.saved.' || item_id, media);
        end loop;
      else
        -- No list, no saved cards: none may go unlisted (and so unchecked).
        for k in select jsonb_object_keys(comps) loop
          if left(k, length('home.' || id || '.saved.')) = 'home.' || id || '.saved.' then
            raise exception '%: not listed in home.%.saved.order', k, id using errcode = 'PT422';
          end if;
        end loop;
      end if;
    elsif t = 'carousel' then
      if not (comps ? ('home.' || id)) then
        raise exception 'components: missing "home.%"', id using errcode = 'PT422';
      end if;
      ids := public.cms_check_list(comps, 'home.' || id, 'home.' || id || '.', 24);
      foreach item_id in array ids loop
        if item_id = 'saved' then
          raise exception 'home.%.order: "saved" is reserved', id using errcode = 'PT422';
        end if;
        media := public.cms_check_tile(comps -> ('home.' || id || '.' || item_id), 'home.' || id || '.' || item_id, media);
      end loop;
    end if;
  end loop;

  -- Every component belongs to an instance (or is the site-wide sidebar).
  for k in select jsonb_object_keys(comps) loop
    if k = 'site.sidebar' then
      perform public.cms_check_nav(comps -> k, k);
      continue;
    end if;
    if k !~ '^home\.[a-z0-9][a-z0-9-]{0,39}(\.|$)' then
      raise exception 'components: unsupported component "%"', left(k, 60) using errcode = 'PT422';
    end if;
    id := split_part(substr(k, 6), '.', 1);
    i := array_position(inst_ids, id);
    if i is null then
      raise exception 'components: "%" belongs to no widget', left(k, 60) using errcode = 'PT422';
    end if;
    rest := substr(k, 6 + length(id));
    t := inst_types[i];
    if not (rest = ''
            or (t in ('feature-hero', 'feature-spotlight') and (rest = '.saved' or rest ~ '^\.saved\.[a-z0-9][a-z0-9-]{0,39}$'))
            or (t = 'carousel' and rest ~ '^\.[a-z0-9][a-z0-9-]{0,39}$'))
       or (t = 'atlas-navigation') then
      raise exception 'components: "%" is not part of a "%" widget', left(k, 60), t using errcode = 'PT422';
    end if;
  end loop;

  return (select coalesce(array_agg(distinct x), array[]::uuid[]) from unnest(media) x);
end;
$$;

-- ── validate_content: by the document's own schema ─────────────────────────
create or replace function public.validate_content(p_page text, doc jsonb)
returns uuid[]
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_page <> 'home' then
    raise exception 'no content schema for page "%"', p_page using errcode = 'PT422';
  end if;
  if jsonb_typeof(doc) <> 'object' then
    raise exception 'document: must be an object' using errcode = 'PT422';
  end if;
  if jsonb_typeof(doc -> 'schema') = 'number' and (doc ->> 'schema') = '2' then
    return public.cms_validate_home_v2(doc);
  end if;
  return public.cms_validate_home_v1(doc);
end;
$$;

-- ── Visitors: no instance's saved cards ────────────────────────────────────
create or replace function public.get_published_content(p_page text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return (
    with live as (
      select v.page, v.id, v.schema_version, v.published_at,
             case when jsonb_typeof(v.content -> 'components') = 'object' then
               jsonb_set(v.content, '{components}', coalesce((
                 select jsonb_object_agg(c.key, c.value)
                 from jsonb_each(v.content -> 'components') c
                 where c.key !~ '^home\.[a-z0-9][a-z0-9-]{0,39}\.saved(\.|$)'
               ), '{}'::jsonb))
             else v.content end as content
      from public.site_content_versions v
      where v.page = p_page and v.status = 'published'
    )
    select jsonb_build_object(
      'page', l.page,
      'version', l.id,
      'schema', l.schema_version,
      'published_at', l.published_at,
      'content', l.content,
      'media', coalesce((
        select jsonb_object_agg(m.id, jsonb_build_object('path', m.public_path, 'width', m.width, 'height', m.height))
        from public.site_media m
        where m.public_path is not null
          and m.id in (select (e ->> 'media')::uuid
                       from jsonb_path_query(l.content, 'lax $.**.source') e
                       where jsonb_typeof(e) = 'object' and e ? 'media')
      ), '{}'::jsonb)
    )
    from live l
  );
end;
$$;

-- Internal helpers: not callable through the API (as in 0008 / 0012 / 0013).
revoke all on function public.cms_validate_home_v1(jsonb) from public, anon, authenticated;
revoke all on function public.cms_validate_home_v2(jsonb) from public, anon, authenticated;
revoke all on function public.cms_check_tile(jsonb, text, uuid[]) from public, anon, authenticated;
revoke all on function public.cms_check_list(jsonb, text, text, integer) from public, anon, authenticated;
revoke all on function public.validate_content(text, jsonb) from public, anon, authenticated;
revoke all on function public.get_published_content(text) from public, anon, authenticated;
grant execute on function public.get_published_content(text) to anon, authenticated;

commit;
