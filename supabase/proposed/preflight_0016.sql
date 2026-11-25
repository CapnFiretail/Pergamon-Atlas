-- READ-ONLY, before 0016_game_library.sql (staging or production). Changes nothing.
-- Run it all; the editor shows one result. Every row with ok must be true: stop if one
-- isn't. The rows with ok = null are for the record: keep the result, verify_0016.sql
-- shows the homepage rows again and they must be the same.
-- (Function texts are compared with the repository's, line endings aside.)
select 'what 0016 replaces is the repository’s' as check_name,
       coalesce(md5(btrim(regexp_replace(translate((select prosrc from pg_proc where oid = to_regprocedure('public.validate_content(text,jsonb)')), chr(13) || chr(10) || chr(9), '   '), ' {2,}', ' ', 'g'))) = 'e8ce95fc2c92771395454efd0ac676c3', false)
       and coalesce(md5(btrim(regexp_replace(translate((select prosrc from pg_proc where oid = to_regprocedure('public.get_published_content(text)')), chr(13) || chr(10) || chr(9), '   '), ' {2,}', ' ', 'g'))) = '6919fc4f99d92b8fa4bd2176b8ad452c', false)
       and coalesce(md5(btrim(regexp_replace(translate((select prosrc from pg_proc where oid = to_regprocedure('public.save_draft(text,jsonb,bigint,text)')), chr(13) || chr(10) || chr(9), '   '), ' {2,}', ' ', 'g'))) = 'f2c1741552d0d86fd198a6ff55d392ba', false)
       and coalesce(md5(btrim(regexp_replace(translate((select prosrc from pg_proc where oid = to_regprocedure('public.cms_activate(text,jsonb,bigint,bigint,uuid)')), chr(13) || chr(10) || chr(9), '   '), ' {2,}', ' ', 'g'))) = '261501f17538f44efa478b37da99a7a0', false)
       and coalesce(md5(btrim(regexp_replace(translate((select prosrc from pg_proc where oid = to_regprocedure('public.rollback(text,bigint,bigint)')), chr(13) || chr(10) || chr(9), '   '), ' {2,}', ' ', 'g'))) = '2c10bbecc7e556b26ec33b4b3ced3df9', false) as ok,
       null::text as value
union all
select 'what it builds on is the repository’s' as check_name,
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
select 'nothing of 0016 exists yet' as check_name,
       to_regprocedure('public.cms_game_refs(jsonb)') is null
       and to_regprocedure('public.cms_check_crop(jsonb,text)') is null
       and to_regprocedure('public.cms_check_game_ref(jsonb,text,boolean)') is null
       and to_regprocedure('public.cms_check_feature(jsonb,text,uuid[])') is null
       and to_regprocedure('public.cms_check_list_card(jsonb,text,uuid[])') is null
       and to_regprocedure('public.cms_check_heading(jsonb,text)') is null
       and to_regprocedure('public.cms_validate_page(text,jsonb)') is null
       and to_regprocedure('public.cms_validate_library(jsonb)') is null
       and to_regprocedure('public.cms_require_games(text,jsonb,boolean)') is null
       and to_regprocedure('public.list_game_uses()') is null
       and not exists (select 1 from public.site_pages where page in ('games', 'library')) as ok,
       null::text as value
union all
select 'the only page is the homepage, schema_version 1' as check_name,
       (select array_agg(page || ' ' || schema_version) from public.site_pages) = array['home 1'] as ok,
       null::text as value
union all
select 'requests run READ COMMITTED (no server, database, role or function setting says otherwise)' as check_name,
       not exists (select 1 from pg_db_role_setting s, unnest(s.setconfig) c where s.setdatabase in (0, (select oid from pg_database where datname = current_database())) and c ~ '^default_transaction_isolation=' and c !~ '="?read (un)?committed')
       and current_setting('default_transaction_isolation') = 'read committed'
       and not exists (select 1 from pg_proc p, unnest(p.proconfig) c where p.pronamespace = 'public'::regnamespace and c ~ '^default_transaction_isolation=') as ok,
       null::text as value
union all
select 'every game page is an allowed destination' as check_name,
       (select count(*) from public.site_content_routes where path ~ '^/games/[a-z0-9-]+/$') >= 8 as ok,
       null::text as value
union all
select 'the live homepage and its draft pass today’s validation (raises if not)' as check_name,
       (select count(public.validate_content(page, content)) = count(*) from public.site_content_versions where status in ('published', 'draft')) as ok,
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
select 'for the record: visibility overrides of games (kept; they suggest the first library draft)', null, coalesce((select string_agg(path || ' → ' || visibility, ', ' order by path) from public.atlas_visibility_overrides where path like '/games/%'), 'none')
union all
select 'for the record: fingerprint of all visibility overrides', null, coalesce((select md5(string_agg(path || visibility || updated_at::text, '|' order by path)) from public.atlas_visibility_overrides), 'none');
