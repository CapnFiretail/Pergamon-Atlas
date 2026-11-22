-- 0013: Site Navigation (the left sidebar) in the homepage CMS document.
--
-- Adds one optional component, `site.sidebar`, to page 'home'. It is
-- site-wide configuration (every regular page's sidebar reads it) stored in
-- the homepage document so it shares that document's draft, preview,
-- publish, Version History and rollback; it has nothing to do with the
-- homepage's cards or their order.
--
--   site.sidebar = { "sections": [ { "items": [
--     { "id": "home", "label": "Home", "icon": "home", "href": "/", "visible": true }, …
--   ] }, … ] }
--
-- What this changes:
--   1. cms_check_nav (new): validates site.sidebar —
--        1–4 sections, 1–12 items each, at most 16 items in all;
--        item id: lower-case key, unique; label: 1–24 characters, no < >;
--        icon: one of the sidebar's own icons (fixed list below);
--        href: one of the site's own pages (fixed list below) or a game page
--              from site_content_routes — never an external, script, admin
--              or Handbook URL;
--        visible: true / false (hiding an item only hides the link; pages
--              keep their own access rules).
--   2. validate_content (replaces 0012's): accepts site.sidebar (optional),
--      checked by cms_check_nav. Everything else is 0012's body, unchanged.
--   get_published_content (0012) already returns every component except
--   saved cards, so visitors get site.sidebar with no change there.
--
-- Documents without site.sidebar stay valid: until an administrator
-- publishes one, every page shows its built-in navigation.
--
-- No tables, policies or grants change. Read-only checks: verify_0013.sql.
--
-- Rollback (reference only): re-run 0012's validate_content, then
--   drop function public.cms_check_nav(jsonb, text);
-- (Do this only when no published or draft version contains site.sidebar,
-- or those versions will no longer validate.)

-- ── 1. Site Navigation ─────────────────────────────────────────────────────

create or replace function public.cms_check_nav(val jsonb, at text)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  section jsonb;
  item jsonb;
  ids text[] := array[]::text[];
  total integer := 0;
  href text;
begin
  perform public.cms_check_keys(val, array['sections'], array['sections'], at);
  if jsonb_typeof(val -> 'sections') <> 'array'
     or jsonb_array_length(val -> 'sections') < 1 or jsonb_array_length(val -> 'sections') > 4 then
    raise exception '%.sections: must be a list of 1 to 4 groups', at using errcode = 'PT422';
  end if;
  for section in select value from jsonb_array_elements(val -> 'sections') loop
    perform public.cms_check_keys(section, array['items'], array['items'], at || '.sections');
    if jsonb_typeof(section -> 'items') <> 'array'
       or jsonb_array_length(section -> 'items') < 1 or jsonb_array_length(section -> 'items') > 12 then
      raise exception '%.sections: each group needs 1 to 12 items', at using errcode = 'PT422';
    end if;
    for item in select value from jsonb_array_elements(section -> 'items') loop
      total := total + 1;
      perform public.cms_check_keys(item, array['id', 'label', 'icon', 'href', 'visible'], array['id', 'label', 'icon', 'href', 'visible'], at || '.item');
      if jsonb_typeof(item -> 'id') <> 'string' or (item ->> 'id') !~ '^[a-z0-9][a-z0-9-]{0,39}$' then
        raise exception '%.item.id: invalid id', at using errcode = 'PT422';
      end if;
      if (item ->> 'id') = any (ids) then
        raise exception '%.item.id: "%" is used twice', at, item ->> 'id' using errcode = 'PT422';
      end if;
      ids := array_append(ids, item ->> 'id');
      perform public.cms_check_text(item -> 'label', 1, 24, at || '.' || (item ->> 'id') || '.label');
      if jsonb_typeof(item -> 'icon') <> 'string'
         or (item ->> 'icon') not in ('home', 'games', 'suggestions', 'achievements', 'leaderboards', 'updates', 'settings', 'account') then
        raise exception '%.%.icon: not one of the sidebar icons', at, item ->> 'id' using errcode = 'PT422';
      end if;
      if jsonb_typeof(item -> 'href') <> 'string' then
        raise exception '%.%.href: must be a site path', at, item ->> 'id' using errcode = 'PT422';
      end if;
      href := item ->> 'href';
      if not (href in ('/', '/games/', '/suggestions/', '/achievements/', '/leaderboards/', '/updates/', '/settings/', '/account/')
              or exists (select 1 from public.site_content_routes r where r.path = href)) then
        raise exception '%.%.href: "%" is not an allowed destination', at, item ->> 'id', left(href, 80) using errcode = 'PT422';
      end if;
      if jsonb_typeof(item -> 'visible') <> 'boolean' then
        raise exception '%.%.visible: must be true or false', at, item ->> 'id' using errcode = 'PT422';
      end if;
    end loop;
  end loop;
  if total > 16 then
    raise exception '%: at most 16 items in all', at using errcode = 'PT422';
  end if;
end;
$$;

-- ── 2. validate_content: 0012's, plus site.sidebar ─────────────────────────

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
  saved_ids text[];
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

-- Internal helpers: not callable through the API (as in 0008 / 0012).
revoke all on function public.cms_check_nav(jsonb, text) from public, anon, authenticated;
revoke all on function public.validate_content(text, jsonb) from public, anon, authenticated;
