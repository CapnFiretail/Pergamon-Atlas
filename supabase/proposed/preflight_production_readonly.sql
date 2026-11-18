-- READ-ONLY pre-flight for the production CMS rollout (rddijjezqrcjrnwskenb).
-- Run in the production SQL Editor before applying 0008 → 0009 → 0010 → 0011.
-- Changes nothing (only SELECTs). Results contain no passwords, keys or full
-- email addresses, so they can be shared. Expected answers are in the
-- comments; stop if one differs.
--
-- Run each numbered query on its own (the editor shows the last result only).

-- 1. Baseline: the legacy schema (0001–0006) is present.             expect 3 rows
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('profiles', 'homepage_settings', 'atlas_visibility_overrides')
order by 1;

-- 2. Nothing of the CMS exists yet (no name clashes).               expect 0 rows
select 'table' as kind, table_name as name from information_schema.tables
where table_schema = 'public' and table_name in ('site_pages', 'site_content_routes', 'site_content_versions', 'site_media')
union all
select 'function', p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('is_admin', 'cms_require_admin', 'cms_lock_page', 'get_published_content', 'get_draft',
  'save_draft', 'discard_draft', 'publish', 'rollback', 'list_versions', 'validate_content', 'create_media_upload',
  'get_media', 'cms_record_prepared_media', 'cms_draft_upload_allowed', 'site_media_guard', 'cms_activate',
  'cms_require_media_ready', 'cms_check_text', 'cms_check_number', 'cms_check_point', 'cms_check_anchor',
  'cms_check_href', 'cms_check_art', 'cms_check_keys')
union all
select 'bucket', id from storage.buckets where id in ('site-media', 'site-media-drafts')
union all
select 'policy', policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'
  and policyname in ('site_media_drafts_admin_read', 'site_media_drafts_admin_insert', 'homepage_bucket_admin_read');

-- 3. Administrators: who would see Admin Mode (emails masked).      expect only the intended administrators
select p.id as user_id,
       left(u.email, 2) || '…@' || split_part(u.email, '@', 2) as email_masked,
       u.last_sign_in_at is not null as has_signed_in,
       u.created_at::date as created
from public.profiles p join auth.users u on u.id = p.id
where p.role = 'admin'
order by u.created_at;

-- 4. Environment: Postgres version, the role running this, owner of
--    storage.objects (0009/0010 create policies on it), the profiles columns
--    0008 relies on, and whether the optional 0007 was ever applied.
select current_setting('server_version') as postgres_version,
       current_user as running_as,
       (select tableowner from pg_tables where schemaname = 'storage' and tablename = 'objects') as storage_objects_owner,
       (select string_agg(column_name, ', ' order by column_name) from information_schema.columns
         where table_schema = 'public' and table_name = 'profiles' and column_name in ('id', 'role', 'display_name')) as profiles_columns_used,
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles'
         and column_name = 'theme_palette') as has_0007_columns,
       (select count(*) from public.profiles) as profile_rows;

-- 5. Snapshot of what 0010 changes (keep this output: it is the "before"
--    state for rollback).
select 'grant' as kind, table_name || ' → ' || grantee as subject, string_agg(privilege_type, ', ' order by privilege_type) as detail
from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('profiles', 'homepage_settings') and grantee in ('anon', 'authenticated')
group by table_name, grantee
union all
select 'column grant', table_name || '.' || column_name || ' → ' || grantee, privilege_type
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'profiles' and grantee = 'authenticated'
  and privilege_type = 'UPDATE'
union all
select 'storage policy', policyname, cmd || ' to ' || array_to_string(roles, ',') || ' using ' || coalesce(qual, '-')
from pg_policies where schemaname = 'storage' and tablename = 'objects'
order by 1, 2;
