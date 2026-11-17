-- PROPOSED — NOT APPLIED. Optional; independent of 0008/0009.
--
-- Pergamon Atlas — tighten three exposures found in the CMS audit. Items 1
-- and 2 are legacy (pre-V1) resources the V1 site doesn't use; item 3
-- restores the intended second layer on profiles. Nothing that renders
-- today changes.
--
-- 1. homepage_settings (0003) returns updated_by — an admin's auth user id —
--    to anonymous visitors while published. Replace the table-wide SELECT
--    grant with a column list that omits it. (Postgres can't revoke one
--    column from a table-wide grant, hence revoke-then-grant.) Note: after
--    this, an anonymous `select *` on the table is refused; the pre-V1
--    site's getHomepageSettings() did that, but V1 never calls it and the
--    pre-V1 site is no longer deployed.
-- 2. The legacy 'homepage' bucket (0004) lets anyone list its objects
--    (the read policy applies to the list endpoint). Public buckets serve
--    files by URL without any SELECT policy, so the policy can be limited to
--    admins without breaking existing image URLs.

-- 3. profiles (0001) intends that signed-in users may update display_name
--    only, via `grant update (display_name)`. But Supabase's default
--    privileges already grant ALL on new public tables to anon and
--    authenticated, so that column grant adds nothing: a user's UPDATE of
--    role/atlas_address/coord_* is permitted and only the
--    protect_profile_fields trigger reverts it. Make the grants match the
--    intent so there are two independent layers again. RLS is unchanged
--    (own row only), and display_name edits keep working.

--    SELECT stays granted to anon and authenticated: RLS already limits it
--    to the caller's own row, and older policies (homepage_settings,
--    atlas_visibility_overrides, the 'homepage' bucket) look up
--    profiles.role as the calling role, so revoking it would break them.

revoke insert, update, delete, truncate, references, trigger on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;

revoke select on public.homepage_settings from anon;
grant select (id, hero_image_path, featured_path, published, published_at, updated_at,
              hero_image_zoom, hero_image_x, hero_image_y, featured_description,
              featured_tool_1_path, featured_tool_1_description,
              featured_tool_2_path, featured_tool_2_description,
              featured_game_path, featured_game_description)
  on public.homepage_settings to anon;

drop policy if exists "homepage_bucket_public_read" on storage.objects;
create policy "homepage_bucket_admin_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'homepage' and exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

-- Rollback (reference only):
--   grant insert, update, delete, truncate, references, trigger on public.profiles to anon, authenticated;
--   grant select on public.homepage_settings to anon;
--   drop policy if exists "homepage_bucket_admin_read" on storage.objects;
--   create policy "homepage_bucket_public_read" on storage.objects for select using (bucket_id = 'homepage');
