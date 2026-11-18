-- READ-ONLY checks after each CMS migration (production or staging).
-- Run each block right after its migration (a block refers to objects that
-- migration creates, so it errors if run before it). Every row should say ok = true.


-- ── After 0008 ────────────────────────────────────────────────────────────
select * from (
select '0008', 'tables site_pages / site_content_routes / site_content_versions',
         (select count(*) from information_schema.tables where table_schema = 'public'
            and table_name in ('site_pages', 'site_content_routes', 'site_content_versions')) = 3
union all
select '0008', 'page "home" registered, schema 1',
         exists (select 1 from public.site_pages where page = 'home' and schema_version = 1)
union all
select '0008', 'allowed destinations seeded (9 routes)',
         (select count(*) from public.site_content_routes) >= 9
union all
select '0008', 'no published version yet (site keeps its static homepage)',
         not exists (select 1 from public.site_content_versions where status = 'published')
union all
select '0008', 'get_published_content callable by anon',
         has_function_privilege('anon', 'public.get_published_content(text)', 'execute')
union all
select '0008', 'publish NOT callable by anon',
         not has_function_privilege('anon', 'public.publish(text, bigint, bigint)', 'execute')
union all
select '0008', 'is_admin() exists',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'is_admin')
) as t(step, check_name, ok);

-- ── After 0009 ────────────────────────────────────────────────────────────
select * from (
select '0009', 'table site_media',
         exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'site_media')
union all
select '0009', 'bucket site-media-drafts private, 5 MB',
         exists (select 1 from storage.buckets where id = 'site-media-drafts' and not public and file_size_limit = 5242880)
union all
select '0009', 'bucket site-media public, 5 MB',
         exists (select 1 from storage.buckets where id = 'site-media' and public and file_size_limit = 5242880)
union all
select '0009', 'draft-bucket policies (admin read, issued-path insert)',
         (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
            and policyname in ('site_media_drafts_admin_read', 'site_media_drafts_admin_insert')) = 2
union all
select '0009', 'cms_record_prepared_media: service role only',
         has_function_privilege('service_role', 'public.cms_record_prepared_media(uuid, text, text, integer, integer, integer, text)', 'execute')
         and not has_function_privilege('authenticated', 'public.cms_record_prepared_media(uuid, text, text, integer, integer, integer, text)', 'execute')
) as t(step, check_name, ok);

-- ── After 0010 ────────────────────────────────────────────────────────────
select * from (
select '0010', 'anon cannot read homepage_settings.updated_by',
         not has_column_privilege('anon', 'public.homepage_settings', 'updated_by', 'select')
union all
select '0010', 'anon can still read homepage_settings.hero_image_path',
         has_column_privilege('anon', 'public.homepage_settings', 'hero_image_path', 'select')
union all
select '0010', 'legacy homepage bucket: listing limited to admins',
         exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'homepage_bucket_admin_read')
         and not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'homepage_bucket_public_read')
union all
select '0010', 'signed-in users may update profiles.display_name only',
         has_column_privilege('authenticated', 'public.profiles', 'display_name', 'update')
         and not has_column_privilege('authenticated', 'public.profiles', 'role', 'update')
) as t(step, check_name, ok);

-- ── After 0011 ────────────────────────────────────────────────────────────
select * from (
select '0011', 'no unique constraint on site_media.public_path',
         not exists (select 1 from pg_constraint where conrelid = 'public.site_media'::regclass and contype = 'u'
                       and pg_get_constraintdef(oid) like '%public_path%')
union all
select '0011', 'lookup index site_media_public_path_idx',
         exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'site_media_public_path_idx')
) as t(step, check_name, ok);
