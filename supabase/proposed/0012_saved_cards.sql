-- PROPOSED. Staging first; production only with explicit approval (run in
-- the SQL Editor by the project owner).
--
-- Pergamon Atlas — CMS: saved Featured / Spotlight cards and version history.
--
-- Apply after 0008_site_content.sql, 0009_site_media.sql and 0011.
--
-- Why
--   validate_content (0008) allows exactly one featured and one spotlight
--   card and refuses any other component, so the homepage document can't
--   hold alternative cards to switch between. Admin Mode's version history
--   needs the published versions with their content (list_versions returns
--   every draft without bodies).
--
-- Change (functions only: no table, column, policy, bucket or data change)
--   1. validate_content accepts, for each slot, an optional list of saved
--      cards: "home.featured.saved": { "order": [ids] } (at most 12) and one
--      "home.featured.saved.<id>" Card per listed id (same for spotlight).
--      The active card stays at "home.featured" with today's shape, so the
--      public renderer, the static fallback and every existing document are
--      unaffected. Every other rule is unchanged; the card rules move into
--      cms_check_card so active and saved cards are checked identically.
--   2. get_published_content leaves the saved lists out of its answer:
--      visitors receive only the active cards (and only their images). The
--      stored version keeps them for administrators and rollback.
--   3. list_published_versions (admin): the newest published / archived
--      versions with their content, publisher name and, for restores, the
--      version they restored. Read-only.
--
-- Why this is safe
--   * Every document valid before is valid after (only components are
--     added to the allowlist). Rollback re-validates archived versions with
--     the same rules, so every archived version stays restorable.
--   * Privileges are re-stated exactly as 0008 set them; the new function is
--     executable by authenticated callers only and checks is_admin() itself.
--   * An older editor keeps components it doesn't know: it saves the whole
--     document it loaded, so it can't drop saved cards (tests/cms).
--
-- Rollback (reference only): re-run 0008's validate_content and
-- get_published_content, then
--   drop function if exists public.list_published_versions(text, integer), public.cms_check_card(jsonb, text, uuid[]);
-- Do that only while no draft or published version uses saved cards
-- (otherwise the next save or rollback of such a version is refused).

-- ── Limits (mirrored in scripts/cms/content.js LIMITS) ─────────────────────
--   saved cards per slot: 12 · carousel cards: 24 (unchanged)

-- One Featured / Spotlight card (active or saved). Returns the media list
-- with the card's image added.
create or replace function public.cms_check_card(val jsonb, at text, media inout uuid[])
returns uuid[]
language plpgsql
stable
set search_path = ''
as $$
begin
  perform public.cms_check_keys(val, array['title', 'cta', 'href', 'art', 'style'], array['title', 'cta', 'href'], at);
  perform public.cms_check_text(val -> 'title', 1, 60, at || '.title');
  perform public.cms_check_text(val -> 'cta', 1, 24, at || '.cta');
  perform public.cms_check_href(val -> 'href', at || '.href');
  if val ? 'art' then
    media := public.cms_check_art(val -> 'art', at || '.art', media);
  end if;
  if val ? 'style' then
    perform public.cms_check_keys(val -> 'style', array['rules'], array[]::text[], at || '.style');
    if (val -> 'style') ? 'rules' and jsonb_typeof(val -> 'style' -> 'rules') <> 'boolean' then
      raise exception '%.style.rules: must be true or false', at using errcode = 'PT422';
    end if;
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
  -- the carousel order, and one entry per carousel card.
  for k in select jsonb_object_keys(comps) loop
    if k not in ('home.featured', 'home.spotlight', 'home.carousel', 'home.featured.saved', 'home.spotlight.saved')
       and k !~ '^home\.carousel\.[a-z0-9][a-z0-9-]{0,39}$'
       and k !~ '^home\.(featured|spotlight)\.saved\.[a-z0-9][a-z0-9-]{0,39}$' then
      raise exception 'components: unsupported component "%"', left(k, 60) using errcode = 'PT422';
    end if;
  end loop;

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

-- Visitors: the live version without the saved (inactive) cards, and the
-- public paths of the images that version shows.
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
                 where c.key !~ '^home\.(featured|spotlight)\.saved(\.|$)'
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

-- Admin: published history, newest first, with content (for the change
-- summary and the restore preview). `restored_from` is set when the version
-- was created by rollback (its source was an earlier published version).
create or replace function public.list_published_versions(p_page text, p_limit integer default 20)
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
      'published_at', v.published_at,
      'published_by', coalesce(p.display_name, 'An administrator'),
      'previous_version_id', v.previous_version_id,
      'restored_from', case when s.status in ('published', 'archived') then s.id end,
      'content', v.content) order by v.id desc)
    from (select * from public.site_content_versions
          where page = p_page and status in ('published', 'archived')
          order by id desc limit least(greatest(coalesce(p_limit, 20), 1), 50)) v
    left join public.profiles p on p.id = v.published_by
    left join public.site_content_versions s on s.id = v.source_version_id
  ), '[]'::jsonb);
end;
$$;

-- ── Function permissions (as 0008, plus the new functions) ─────────────────
revoke all on function public.cms_check_card(jsonb, text, uuid[]) from public, anon, authenticated;
revoke all on function public.validate_content(text, jsonb) from public, anon, authenticated;
revoke all on function public.get_published_content(text) from public, anon, authenticated;
revoke all on function public.list_published_versions(text, integer) from public, anon, authenticated;

grant execute on function public.get_published_content(text) to anon, authenticated;
grant execute on function public.list_published_versions(text, integer) to authenticated;
