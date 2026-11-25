-- RECOVERY: undoes 0016_game_library.sql. Only if we agree to, and only while nothing
-- has been saved for the Games page or the library, and no homepage uses what 0016
-- allows: it refuses otherwise and changes nothing. After that leave 0016 in place
-- (older site code ignores it) and go forward.
--
-- MAINTENANCE WINDOW: no open editors, no saves or publishes until it has finished. It
-- waits for writes that have started; library and Games page writes that start during it
-- are refused. Takes about 10 seconds: it restores, waits, then drops.
--
-- Functions and the two site_pages rows only: no content, override or media changes.
-- The five functions are the repository's of 0008 and 0014, exactly.

begin;

do $guard$ begin
  -- Every writer's locks, in their order (pages, then the library): nothing is saved
  -- between this check and the end.
  perform pg_advisory_xact_lock(hashtext('pergamon.site_content:' || p.page)) from (select page from public.site_pages where page <> 'library' order by page) p;
  perform pg_advisory_xact_lock(hashtext('pergamon.site_content:library'));
  if exists (select 1 from public.site_pages where page not in ('home', 'games', 'library')) then
    raise exception 'A later page is registered: leave 0016 in place.';
  end if;
  if exists (select 1 from public.site_content_versions where page in ('games', 'library')) then
    raise exception 'The Games page or the Game Library has saved versions, which are permanent: leave 0016 in place.';
  end if;
  if exists (select 1 from public.site_content_versions
             where public.cms_game_refs(content) <> array[]::text[]
                or jsonb_path_exists(content, 'lax $.regions[*].widgets[*].type ? (@ == "page-heading" || @ == "card-grid")')) then
    raise exception 'A stored homepage version uses what 0016 allows: leave 0016 in place.';
  end if;
end $guard$;

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

delete from public.site_pages where page in ('games', 'library');

-- Privileges as 0008 and 0014 set them.
revoke all on function public.validate_content(text, jsonb) from public, anon, authenticated;
revoke all on function public.cms_activate(text, jsonb, bigint, bigint, uuid) from public, anon, authenticated;
revoke all on function public.get_published_content(text) from public, anon, authenticated;
grant execute on function public.get_published_content(text) to anon, authenticated;
revoke all on function public.save_draft(text, jsonb, bigint, text) from public, anon, authenticated;
grant execute on function public.save_draft(text, jsonb, bigint, text) to authenticated;
revoke all on function public.rollback(text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.rollback(text, bigint, bigint) to authenticated;

commit;

-- Requests already running may still be in 0016's functions: let them finish, then drop
-- what only those called. (If only this part fails, run it again: nothing uses them.)
select pg_sleep(10);

begin;
drop function public.cms_game_refs(jsonb);
drop function public.cms_check_crop(jsonb,text);
drop function public.cms_check_game_ref(jsonb,text,boolean);
drop function public.cms_check_feature(jsonb,text,uuid[]);
drop function public.cms_check_list_card(jsonb,text,uuid[]);
drop function public.cms_check_heading(jsonb,text);
drop function public.cms_validate_page(text,jsonb);
drop function public.cms_validate_library(jsonb);
drop function public.cms_require_games(text,jsonb,boolean);
drop function public.list_game_uses();
commit;
