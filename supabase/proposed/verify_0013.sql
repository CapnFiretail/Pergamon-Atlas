-- READ-ONLY checks after applying 0013_site_sidebar.sql (staging or production).
-- Every row should show ok = true. Changes nothing (validate_content is
-- stable and only reads; the sample documents are never stored).
with f as (
  select to_regprocedure('public.cms_check_nav(jsonb,text)') as check_nav,
         to_regprocedure('public.validate_content(text,jsonb)') as validate,
         to_regprocedure('public.get_published_content(text)') as published
)
select 'functions exist' as check_name,
       check_nav is not null and validate is not null and published is not null as ok
from f
union all
select 'internal checks not callable by anon or authenticated',
       not has_function_privilege('anon', 'public.cms_check_nav(jsonb,text)', 'execute')
       and not has_function_privilege('authenticated', 'public.cms_check_nav(jsonb,text)', 'execute')
       and not has_function_privilege('anon', 'public.validate_content(text,jsonb)', 'execute')
       and not has_function_privilege('authenticated', 'public.validate_content(text,jsonb)', 'execute')
union all
select 'anon can still read published content',
       has_function_privilege('anon', 'public.get_published_content(text)', 'execute')
union all
select 'validate_content checks site.sidebar',
       pg_get_functiondef('public.validate_content(text,jsonb)'::regprocedure) like '%cms_check_nav%'
union all
select 'validate_content still checks saved cards (0012)',
       pg_get_functiondef('public.validate_content(text,jsonb)'::regprocedure) like '%.saved.order%'
union all
select 'live version passes the new validation (raises if not)',
       coalesce((select public.validate_content('home', v.content) is not null
                 from public.site_content_versions v
                 where v.page = 'home' and v.status = 'published'), true)
union all
select 'current draft (if any) passes the new validation (raises if not)',
       coalesce((select public.validate_content('home', v.content) is not null
                 from public.site_content_versions v
                 where v.page = 'home' and v.status = 'draft'), true);
