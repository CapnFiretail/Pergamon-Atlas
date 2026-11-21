-- READ-ONLY checks after applying 0012_saved_cards.sql (staging or production).
-- Every row should show ok = true. Changes nothing.
with f as (
  select to_regprocedure('public.cms_check_card(jsonb,text,uuid[])') as check_card,
         to_regprocedure('public.validate_content(text,jsonb)') as validate,
         to_regprocedure('public.get_published_content(text)') as published,
         to_regprocedure('public.list_published_versions(text,integer)') as history,
         to_regprocedure('public.rollback(text,bigint,bigint)') as rollback
)
select 'functions exist' as check_name,
       check_card is not null and validate is not null and published is not null and history is not null and rollback is not null as ok
from f
union all
select 'anon: get_published_content only',
       has_function_privilege('anon', 'public.get_published_content(text)', 'execute')
       and not has_function_privilege('anon', 'public.list_published_versions(text,integer)', 'execute')
       and not has_function_privilege('anon', 'public.validate_content(text,jsonb)', 'execute')
       and not has_function_privilege('anon', 'public.cms_check_card(jsonb,text,uuid[])', 'execute')
union all
select 'authenticated: history yes, internal checks no',
       has_function_privilege('authenticated', 'public.list_published_versions(text,integer)', 'execute')
       and not has_function_privilege('authenticated', 'public.validate_content(text,jsonb)', 'execute')
       and not has_function_privilege('authenticated', 'public.cms_check_card(jsonb,text,uuid[])', 'execute')
union all
select 'history checks is_admin()',
       pg_get_functiondef('public.list_published_versions(text,integer)'::regprocedure) like '%cms_require_admin()%'
union all
select 'public answer leaves saved cards out',
       pg_get_functiondef('public.get_published_content(text)'::regprocedure) like '%saved%'
union all
select 'live version passes the new validation (raises if not)',
       coalesce((select public.validate_content('home', v.content) is not null
                 from public.site_content_versions v
                 where v.page = 'home' and v.status = 'published'), true);
