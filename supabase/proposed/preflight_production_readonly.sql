-- READ-ONLY pre-flight for the production CMS rollout (rddijjezqrcjrnwskenb).
-- Run in the production SQL Editor before applying 0008 → 0009 → 0010 → 0011.
-- Changes nothing. Expected answers are in the comments; stop if one differs.

-- 1. Baseline: the legacy schema (0001–0006) is present.             expect 3 rows
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('profiles', 'homepage_settings', 'atlas_visibility_overrides')
order by 1;

-- 2. Nothing of the CMS exists yet (no name clashes).               expect 0 rows
select 'table' as kind, table_name as name from information_schema.tables
where table_schema = 'public' and table_name in ('site_pages', 'site_content_routes', 'site_content_versions', 'site_media')
union all
select 'function', p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('is_admin', 'cms_require_admin', 'get_published_content', 'get_draft',
  'save_draft', 'discard_draft', 'publish', 'rollback', 'list_versions', 'validate_content', 'create_media_upload',
  'get_media', 'cms_record_prepared_media', 'cms_draft_upload_allowed', 'site_media_guard')
union all
select 'bucket', id from storage.buckets where id in ('site-media', 'site-media-drafts')
union all
select 'policy', policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'site_media%';

-- 3. Who would see Admin Mode (profiles.role = 'admin').            expect only the intended administrators
select p.id, u.email, p.role from public.profiles p join auth.users u on u.id = p.id where p.role = 'admin';

-- 4. What 0010 would tighten (for the decision on 0010).
select grantee, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'profiles' and grantee in ('anon', 'authenticated') order by 1, 2;
select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'homepage%';

-- 5. Extensions the CMS functions use (gen_random_uuid is built in on PG13+).
select current_setting('server_version') as postgres_version;
