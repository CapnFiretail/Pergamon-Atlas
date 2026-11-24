-- READ-ONLY checks after applying 0015_studio_documents.sql (staging or
-- production). Every row should show ok = true. Changes nothing.
select 'functions exist' as check_name,
       to_regprocedure('public.get_studio_document(text)') is not null
       and to_regprocedure('public.save_studio_document(text,jsonb,bigint)') is not null
       and to_regprocedure('public.studio_check_document(text,jsonb)') is not null as ok
union all
select 'the two kinds, and no others',
       (select array_agg(kind order by kind) from public.studio_document_kinds) = array['connections', 'ideas']
union all
select 'row level security on, with no policies',
       (select bool_and(relrowsecurity) from pg_class where oid in ('public.studio_documents'::regclass, 'public.studio_document_kinds'::regclass))
       and not exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('studio_documents', 'studio_document_kinds'))
union all
select 'anon and authenticated have no privilege on the tables',
       not exists (
         select 1
         from unnest(array['anon', 'authenticated']) r,
              unnest(array['public.studio_documents', 'public.studio_document_kinds']) t,
              unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) p
         where has_table_privilege(r, t, p))
union all
select 'anon can call none of them',
       not has_function_privilege('anon', 'public.get_studio_document(text)', 'execute')
       and not has_function_privilege('anon', 'public.save_studio_document(text,jsonb,bigint)', 'execute')
       and not has_function_privilege('anon', 'public.studio_check_document(text,jsonb)', 'execute')
union all
select 'authenticated can call the two that check for an administrator, not the validator',
       has_function_privilege('authenticated', 'public.get_studio_document(text)', 'execute')
       and has_function_privilege('authenticated', 'public.save_studio_document(text,jsonb,bigint)', 'execute')
       and not has_function_privilege('authenticated', 'public.studio_check_document(text,jsonb)', 'execute')
union all
select 'both check for an administrator and run with an empty search_path',
       (select bool_and(prosecdef and prosrc like '%cms_require_admin()%' and 'search_path=""' = any (proconfig))
        from pg_proc where oid in ('public.get_studio_document(text)'::regprocedure, 'public.save_studio_document(text,jsonb,bigint)'::regprocedure))
union all
select 'every saved document passes validation (raises if not)',
       (select count(public.studio_check_document(kind, document)) = count(*) from public.studio_documents);
