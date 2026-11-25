-- READ-ONLY, after 0016_game_library.sql (staging or production). Changes nothing: the
-- sample documents are only validated, never stored. Every row with ok must be true;
-- the rows with ok = null must read as they did in preflight_0016.sql.
select 'every function is the repository’s' as check_name,
       coalesce(md5(btrim(regexp_replace(translate((select prosrc from pg_proc where oid = to_regprocedure('public.cms_game_refs(jsonb)')), chr(13) || chr(10) || chr(9), '   '), ' {2,}', ' ', 'g'))) = '7b17339d8e4fa73c58ade45aaa463155', false)
       and coalesce(md5(btrim(regexp_replace(translate((select prosrc from pg_proc where oid = to_regprocedure('public.cms_check_crop(jsonb,text)')), chr(13) || chr(10) || chr(9), '   '), ' {2,}', ' ', 'g'))) = '87b70165976d807588983a1b601e980f', false)
       and coalesce(md5(btrim(regexp_replace(translate((select prosrc from pg_proc where oid = to_regprocedure('public.cms_check_game_ref(jsonb,text,boolean)')), chr(13) || chr(10) || chr(9), '   '), ' {2,}', ' ', 'g'))) = '50b36700fee8589eb61adad49ad8a8f6', false)
       and coalesce(md5(btrim(regexp_replace(translate((select prosrc from pg_proc where oid = to_regprocedure('public.cms_check_feature(jsonb,text,uuid[])')), chr(13) || chr(10) || chr(9), '   '), ' {2,}', ' ', 'g'))) = '413e2901d66432ca5f84db7e3573954b', false)
       and coalesce(md5(btrim(regexp_replace(translate((select prosrc from pg_proc where oid = to_regprocedure('public.cms_check_list_card(jsonb,text,uuid[])')), chr(13) || chr(10) || chr(9), '   '), ' {2,}', ' ', 'g'))) = '91d34cda5128a92a285189f363818076', false)
       and coalesce(md5(btrim(regexp_replace(translate((select prosrc from pg_proc where oid = to_regprocedure('public.cms_check_heading(jsonb,text)')), chr(13) || chr(10) || chr(9), '   '), ' {2,}', ' ', 'g'))) = '5cdb083113e0f2c20b5a2f6d76bd0df1', false)
       and coalesce(md5(btrim(regexp_replace(translate((select prosrc from pg_proc where oid = to_regprocedure('public.cms_validate_page(text,jsonb)')), chr(13) || chr(10) || chr(9), '   '), ' {2,}', ' ', 'g'))) = '8caa3f3455491d456016c90b0b3256a9', false)
       and coalesce(md5(btrim(regexp_replace(translate((select prosrc from pg_proc where oid = to_regprocedure('public.cms_validate_library(jsonb)')), chr(13) || chr(10) || chr(9), '   '), ' {2,}', ' ', 'g'))) = '7a42956750c5a368c9fb652ce95eec26', false)
       and coalesce(md5(btrim(regexp_replace(translate((select prosrc from pg_proc where oid = to_regprocedure('public.cms_require_games(text,jsonb,boolean)')), chr(13) || chr(10) || chr(9), '   '), ' {2,}', ' ', 'g'))) = '1fca5c3141c90d620c3eb1980821a663', false)
       and coalesce(md5(btrim(regexp_replace(translate((select prosrc from pg_proc where oid = to_regprocedure('public.list_game_uses()')), chr(13) || chr(10) || chr(9), '   '), ' {2,}', ' ', 'g'))) = '584d342f4d192161d49e19768eb3a5d0', false)
       and coalesce(md5(btrim(regexp_replace(translate((select prosrc from pg_proc where oid = to_regprocedure('public.validate_content(text,jsonb)')), chr(13) || chr(10) || chr(9), '   '), ' {2,}', ' ', 'g'))) = 'e56b34515075c32f4a84d4420086c68e', false)
       and coalesce(md5(btrim(regexp_replace(translate((select prosrc from pg_proc where oid = to_regprocedure('public.get_published_content(text)')), chr(13) || chr(10) || chr(9), '   '), ' {2,}', ' ', 'g'))) = '233317347edc7b779eea05c869f65f20', false)
       and coalesce(md5(btrim(regexp_replace(translate((select prosrc from pg_proc where oid = to_regprocedure('public.save_draft(text,jsonb,bigint,text)')), chr(13) || chr(10) || chr(9), '   '), ' {2,}', ' ', 'g'))) = '86695f2dbdf1269e36301b2b9fbae776', false)
       and coalesce(md5(btrim(regexp_replace(translate((select prosrc from pg_proc where oid = to_regprocedure('public.cms_activate(text,jsonb,bigint,bigint,uuid)')), chr(13) || chr(10) || chr(9), '   '), ' {2,}', ' ', 'g'))) = 'bcec1d06156766c64c4ca916ec146e2c', false)
       and coalesce(md5(btrim(regexp_replace(translate((select prosrc from pg_proc where oid = to_regprocedure('public.rollback(text,bigint,bigint)')), chr(13) || chr(10) || chr(9), '   '), ' {2,}', ' ', 'g'))) = 'b0afa86ff21df6bbb83dabe8827a92b2', false) as ok,
       null::text as value
union all
select 'what it builds on is unchanged' as check_name,
       coalesce(md5(btrim(regexp_replace(translate((select prosrc from pg_proc where oid = to_regprocedure('public.cms_validate_home_v1(jsonb)')), chr(13) || chr(10) || chr(9), '   '), ' {2,}', ' ', 'g'))) = 'bac6ed72eade2e729d181c8a45b54621', false)
       and coalesce(md5(btrim(regexp_replace(translate((select prosrc from pg_proc where oid = to_regprocedure('public.cms_validate_home_v2(jsonb)')), chr(13) || chr(10) || chr(9), '   '), ' {2,}', ' ', 'g'))) = '9c2964ca4aebe09002e08f04c1a5d524', false)
       and coalesce(md5(btrim(regexp_replace(translate((select prosrc from pg_proc where oid = to_regprocedure('public.cms_check_tile(jsonb,text,uuid[])')), chr(13) || chr(10) || chr(9), '   '), ' {2,}', ' ', 'g'))) = 'e90a66d30baace7acca47551053a2983', false)
       and coalesce(md5(btrim(regexp_replace(translate((select prosrc from pg_proc where oid = to_regprocedure('public.cms_check_list(jsonb,text,text,integer)')), chr(13) || chr(10) || chr(9), '   '), ' {2,}', ' ', 'g'))) = '33792a3da7a837b3ee7761442d1ead7d', false)
       and coalesce(md5(btrim(regexp_replace(translate((select prosrc from pg_proc where oid = to_regprocedure('public.cms_check_nav(jsonb,text)')), chr(13) || chr(10) || chr(9), '   '), ' {2,}', ' ', 'g'))) = 'e9ec2fc8c19da402d474fe824d8adcb0', false)
       and coalesce(md5(btrim(regexp_replace(translate((select prosrc from pg_proc where oid = to_regprocedure('public.cms_check_card(jsonb,text,uuid[])')), chr(13) || chr(10) || chr(9), '   '), ' {2,}', ' ', 'g'))) = 'a17c665392c94f0b0d8817b27f5d14ee', false)
       and coalesce(md5(btrim(regexp_replace(translate((select prosrc from pg_proc where oid = to_regprocedure('public.cms_check_art(jsonb,text,uuid[])')), chr(13) || chr(10) || chr(9), '   '), ' {2,}', ' ', 'g'))) = '832e8fbf025c05e35553f180b7d4551a', false)
       and coalesce(md5(btrim(regexp_replace(translate((select prosrc from pg_proc where oid = to_regprocedure('public.cms_check_keys(jsonb,text[],text[],text)')), chr(13) || chr(10) || chr(9), '   '), ' {2,}', ' ', 'g'))) = '35a42f7e1e3307b3675397725e1720f1', false)
       and coalesce(md5(btrim(regexp_replace(translate((select prosrc from pg_proc where oid = to_regprocedure('public.cms_check_href(jsonb,text)')), chr(13) || chr(10) || chr(9), '   '), ' {2,}', ' ', 'g'))) = '7449e603041db55492a794c5d8c50529', false)
       and coalesce(md5(btrim(regexp_replace(translate((select prosrc from pg_proc where oid = to_regprocedure('public.cms_lock_page(text)')), chr(13) || chr(10) || chr(9), '   '), ' {2,}', ' ', 'g'))) = '0df12b9a48855599c77e08e47d35d7c0', false)
       and coalesce(md5(btrim(regexp_replace(translate((select prosrc from pg_proc where oid = to_regprocedure('public.publish(text,bigint,bigint)')), chr(13) || chr(10) || chr(9), '   '), ' {2,}', ' ', 'g'))) = '8b26fe23120b944f38a7b4bdd4b722cc', false)
       and coalesce(md5(btrim(regexp_replace(translate((select prosrc from pg_proc where oid = to_regprocedure('public.cms_require_media_ready(uuid[])')), chr(13) || chr(10) || chr(9), '   '), ' {2,}', ' ', 'g'))) = '0949f973b046f69ac9ce259641991864', false)
       and coalesce(md5(btrim(regexp_replace(translate((select prosrc from pg_proc where oid = to_regprocedure('public.cms_require_admin()')), chr(13) || chr(10) || chr(9), '   '), ' {2,}', ' ', 'g'))) = 'f00767175452515b0edfefa8e84c1098', false)
       and coalesce(md5(btrim(regexp_replace(translate((select prosrc from pg_proc where oid = to_regprocedure('public.is_admin()')), chr(13) || chr(10) || chr(9), '   '), ' {2,}', ' ', 'g'))) = 'e62dd9bb139a563f823b0de9a8a9b5ce', false) as ok,
       null::text as value
union all
select 'owner postgres, empty search_path, and only the functions that must are security definer' as check_name,
       (select count(*) = 15 and bool_and(pg_get_userbyid(proowner) = 'postgres' and 'search_path=""' = any (proconfig)
          and prosecdef = (oid = any (array['public.cms_require_games(text,jsonb,boolean)'::regprocedure::oid, 'public.cms_activate(text,jsonb,bigint,bigint,uuid)'::regprocedure::oid, 'public.save_draft(text,jsonb,bigint,text)'::regprocedure::oid, 'public.rollback(text,bigint,bigint)'::regprocedure::oid, 'public.get_published_content(text)'::regprocedure::oid, 'public.list_game_uses()'::regprocedure::oid])))
        from pg_proc where oid = any (array['public.cms_game_refs(jsonb)'::regprocedure::oid, 'public.cms_check_crop(jsonb,text)'::regprocedure::oid, 'public.cms_check_game_ref(jsonb,text,boolean)'::regprocedure::oid, 'public.cms_check_feature(jsonb,text,uuid[])'::regprocedure::oid, 'public.cms_check_list_card(jsonb,text,uuid[])'::regprocedure::oid, 'public.cms_check_heading(jsonb,text)'::regprocedure::oid, 'public.cms_validate_page(text,jsonb)'::regprocedure::oid, 'public.cms_validate_library(jsonb)'::regprocedure::oid, 'public.cms_require_games(text,jsonb,boolean)'::regprocedure::oid, 'public.list_game_uses()'::regprocedure::oid, 'public.validate_content(text,jsonb)'::regprocedure::oid, 'public.get_published_content(text)'::regprocedure::oid, 'public.save_draft(text,jsonb,bigint,text)'::regprocedure::oid, 'public.cms_activate(text,jsonb,bigint,bigint,uuid)'::regprocedure::oid, 'public.rollback(text,bigint,bigint)'::regprocedure::oid])) as ok,
       null::text as value
union all
select 'internal functions: nobody through the API' as check_name,
       not has_function_privilege('anon', 'public.cms_game_refs(jsonb)', 'execute')
       and not has_function_privilege('anon', 'public.cms_check_crop(jsonb,text)', 'execute')
       and not has_function_privilege('anon', 'public.cms_check_game_ref(jsonb,text,boolean)', 'execute')
       and not has_function_privilege('anon', 'public.cms_check_feature(jsonb,text,uuid[])', 'execute')
       and not has_function_privilege('anon', 'public.cms_check_list_card(jsonb,text,uuid[])', 'execute')
       and not has_function_privilege('anon', 'public.cms_check_heading(jsonb,text)', 'execute')
       and not has_function_privilege('anon', 'public.cms_validate_page(text,jsonb)', 'execute')
       and not has_function_privilege('anon', 'public.cms_validate_library(jsonb)', 'execute')
       and not has_function_privilege('anon', 'public.cms_require_games(text,jsonb,boolean)', 'execute')
       and not has_function_privilege('anon', 'public.validate_content(text,jsonb)', 'execute')
       and not has_function_privilege('anon', 'public.cms_activate(text,jsonb,bigint,bigint,uuid)', 'execute')
       and not has_function_privilege('anon', 'public.cms_validate_home_v1(jsonb)', 'execute')
       and not has_function_privilege('anon', 'public.cms_validate_home_v2(jsonb)', 'execute')
       and not has_function_privilege('authenticated', 'public.cms_game_refs(jsonb)', 'execute')
       and not has_function_privilege('authenticated', 'public.cms_check_crop(jsonb,text)', 'execute')
       and not has_function_privilege('authenticated', 'public.cms_check_game_ref(jsonb,text,boolean)', 'execute')
       and not has_function_privilege('authenticated', 'public.cms_check_feature(jsonb,text,uuid[])', 'execute')
       and not has_function_privilege('authenticated', 'public.cms_check_list_card(jsonb,text,uuid[])', 'execute')
       and not has_function_privilege('authenticated', 'public.cms_check_heading(jsonb,text)', 'execute')
       and not has_function_privilege('authenticated', 'public.cms_validate_page(text,jsonb)', 'execute')
       and not has_function_privilege('authenticated', 'public.cms_validate_library(jsonb)', 'execute')
       and not has_function_privilege('authenticated', 'public.cms_require_games(text,jsonb,boolean)', 'execute')
       and not has_function_privilege('authenticated', 'public.validate_content(text,jsonb)', 'execute')
       and not has_function_privilege('authenticated', 'public.cms_activate(text,jsonb,bigint,bigint,uuid)', 'execute')
       and not has_function_privilege('authenticated', 'public.cms_validate_home_v1(jsonb)', 'execute')
       and not has_function_privilege('authenticated', 'public.cms_validate_home_v2(jsonb)', 'execute') as ok,
       null::text as value
union all
select 'guests: the public reader only' as check_name,
       has_function_privilege('anon', 'public.get_published_content(text)', 'execute')
       and not has_function_privilege('anon', 'public.save_draft(text,jsonb,bigint,text)', 'execute')
       and not has_function_privilege('anon', 'public.rollback(text,bigint,bigint)', 'execute')
       and not has_function_privilege('anon', 'public.publish(text,bigint,bigint)', 'execute')
       and not has_function_privilege('anon', 'public.get_draft(text)', 'execute')
       and not has_function_privilege('anon', 'public.list_game_uses()', 'execute')
       and not has_function_privilege('anon', 'public.list_published_versions(text,integer)', 'execute') as ok,
       null::text as value
union all
select 'signed-in callers: the functions that check for an administrator themselves' as check_name,
       has_function_privilege('authenticated', 'public.save_draft(text,jsonb,bigint,text)', 'execute')
       and has_function_privilege('authenticated', 'public.rollback(text,bigint,bigint)', 'execute')
       and has_function_privilege('authenticated', 'public.publish(text,bigint,bigint)', 'execute')
       and has_function_privilege('authenticated', 'public.get_draft(text)', 'execute')
       and has_function_privilege('authenticated', 'public.list_game_uses()', 'execute')
       and has_function_privilege('authenticated', 'public.get_published_content(text)', 'execute')
       and (select bool_and(prosrc like '%cms_require_admin()%') from pg_proc where oid = any (array['public.save_draft(text,jsonb,bigint,text)'::regprocedure::oid, 'public.rollback(text,bigint,bigint)'::regprocedure::oid, 'public.list_game_uses()'::regprocedure::oid])) as ok,
       null::text as value
union all
select 'tables are still closed to the API, with no policies' as check_name,
       (select bool_and(relrowsecurity) from pg_class where oid in ('public.site_content_versions'::regclass, 'public.site_pages'::regclass, 'public.site_media'::regclass, 'public.site_content_routes'::regclass))
       and not exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('site_content_versions', 'site_pages', 'site_media', 'site_content_routes'))
       and not exists (select 1 from unnest(array['anon', 'authenticated']) r, unnest(array['public.site_content_versions', 'public.site_pages', 'public.site_media', 'public.site_content_routes']) t, unnest(array['select', 'insert', 'update', 'delete']) p where has_table_privilege(r, t, p)) as ok,
       null::text as value
union all
select 'the three pages' as check_name,
       (select array_agg(page || ' ' || schema_version order by page) from public.site_pages) = array['games 2', 'home 1', 'library 1'] as ok,
       null::text as value
union all
select 'nothing was created for the new pages' as check_name,
       not exists (select 1 from public.site_content_versions where page in ('games', 'library')) as ok,
       null::text as value
union all
select 'visitors get the homepage exactly as 0014 would answer' as check_name,
       public.get_published_content('home') is not distinct from (
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
      where v.page = 'home' and v.status = 'published'
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
       ) as ok,
       null::text as value
union all
select 'the library and an unpublished page answer nothing' as check_name,
       public.get_published_content('library') is null and public.get_published_content('games') is null as ok,
       null::text as value
union all
select 'the live homepage and its draft pass (raises if not)' as check_name,
       (select count(public.validate_content(page, content)) = count(*) from public.site_content_versions where status in ('published', 'draft')) as ok,
       null::text as value
union all
select 'every version that could be restored passes (raises if not)' as check_name,
       (select count(public.validate_content(page, content)) = count(*) from public.site_content_versions where status = 'archived') as ok,
       null::text as value
union all
select 'the live homepage as schema 2, a Games page and a library would be accepted (raises if not; nothing stored)' as check_name,
       (select public.validate_content('home', jsonb_build_object('schema', 2, 'regions', '[{"id":"upper","frame":"sidebar","rowHeight":23.43,"stack":["featured","spotlight","navigation"],"widgets":[{"id":"featured","type":"feature-hero","col":1,"row":1,"cols":14,"rows":7},{"id":"spotlight","type":"feature-spotlight","col":1,"row":8,"cols":14,"rows":4},{"id":"navigation","type":"atlas-navigation","col":15,"row":1,"cols":6,"rows":11}]},{"id":"lower","rowHeight":23.43,"widgets":[{"id":"carousel","type":"carousel","col":1,"row":1,"cols":20,"rows":10}]}]'::jsonb, 'components', v.content -> 'components')) is not null from public.site_content_versions v where v.page = 'home' and v.status = 'published' and v.content ->> 'schema' = '1'
         union all select true where not exists (select 1 from public.site_content_versions where page = 'home' and status = 'published' and content ->> 'schema' = '1') limit 1)
       and public.validate_content('games', '{"schema":2,"regions":[{"id":"main","frame":"sidebar","rowHeight":23.43,"widgets":[{"id":"heading","type":"page-heading","col":1,"row":1,"cols":20,"rows":6},{"id":"grid","type":"card-grid","col":1,"row":7,"cols":20,"rows":7}]}],"components":{"games.heading":{"title":"Games","emblem":"games","count":"cards"},"games.grid":{"order":["snake"]},"games.grid.snake":{"game":"snake"}}}'::jsonb) is not null
       and public.validate_content('library', '{"schema":1,"components":{"library.games":{"order":["snake"]},"library.games.snake":{"name":"Snake","category":"Arcade","destination":"/games/snake/","availability":"available"}}}'::jsonb) is not null as ok,
       null::text as value
union all
select 'for the record: live homepage version', null, (select id::text || ', schema ' || (content ->> 'schema') from public.site_content_versions where page = 'home' and status = 'published')
union all
select 'for the record: homepage answer fingerprint', null, md5(public.get_published_content('home')::text)
union all
select 'for the record: stored versions', null, (select string_agg(status || ' ' || n, ', ' order by status) from (select status, count(*) n from public.site_content_versions group by status) s)
union all
select 'for the record: fingerprint of every stored version', null, (select md5(string_agg(id || status || content::text, '|' order by id)) from public.site_content_versions)
union all
select 'for the record: fingerprint of all visibility overrides', null, coalesce((select md5(string_agg(path || visibility || updated_at::text, '|' order by path)) from public.atlas_visibility_overrides), 'none');
